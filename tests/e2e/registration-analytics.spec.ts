import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type BrowserContext } from '@playwright/test';

// The local-provider case handles single-use email links and credentials.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const productionOrigin = 'https://ecarteo.fr';
const measurementId = 'G-X9BFFJ9M78';
const consentKey = 'ecarteo.cookie-consent.v1';
const consentLifetime = 180 * 86_400_000;
type ConsentRecord = { version: 1; analytics: boolean; savedAt: number; expiresAt: number };

function consent(analytics: boolean, expired = false): ConsentRecord {
  const savedAt = Date.now() - (expired ? consentLifetime + 1000 : 1000);
  return { version: 1, analytics, savedAt, expiresAt: savedAt + consentLifetime };
}

function gate(hold = false) {
  let release = () => {};
  const promise = hold
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  return { promise, release: () => release() };
}

type FixtureOptions = {
  consent: ConsentRecord | null;
  track?: boolean;
  holdClaim?: boolean;
  holdTag?: boolean;
  debug?: boolean;
};

async function registrationFixture(
  context: BrowserContext,
  baseURL: string,
  options: FixtureOptions,
) {
  test.skip(
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname),
    'Isolated browser tests proxy only to a local application.',
  );
  const commands: unknown[][] = [];
  const claims: unknown[] = [];
  const googleRequests: string[] = [];
  const unexpectedRequests: string[] = [];
  const problems: string[] = [];
  for (const page of context.pages()) {
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
  }
  const claimGate = gate(options.holdClaim);
  const tagGate = gate(options.holdTag);
  await context.exposeBinding('__recordRegistrationAnalytics', (_, command: unknown[]) => {
    commands.push(command);
  });
  await context.addInitScript(
    ({ record, key, debug }) => {
      if (location.origin !== 'https://ecarteo.fr') return;
      if (!localStorage.getItem('ecarteo.test-consent-initialized')) {
        if (record) localStorage.setItem(key, JSON.stringify(record));
        else localStorage.removeItem(key);
        localStorage.setItem('ecarteo.test-consent-initialized', '1');
      }
      if (debug) sessionStorage.setItem('ecarteo.analytics.debug', '1');
    },
    { record: options.consent, key: consentKey, debug: options.debug ?? false },
  );
  // Next 16's development RSC debug stream shares its HMR socket; blocking it
  // leaves hydration pending. Bridge only that socket to the loopback fixture.
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());
    if (url.hostname !== 'ecarteo.fr' || url.pathname !== '/_next/hmr') {
      unexpectedRequests.push(socket.url());
      socket.close();
      return;
    }
    const local = new URL(`${baseURL}${url.pathname}${url.search}`);
    local.protocol = local.protocol === 'https:' ? 'wss:' : 'ws:';
    const upstream = new WebSocket(local);
    upstream.binaryType = 'arraybuffer';
    const pending: (string | Buffer)[] = [];
    socket.onMessage((message) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
      else pending.push(message);
    });
    upstream.addEventListener('open', () => {
      for (const message of pending) upstream.send(message);
      pending.length = 0;
    });
    upstream.addEventListener('message', (event) => {
      if (typeof event.data === 'string') socket.send(event.data);
      else if (event.data instanceof ArrayBuffer) socket.send(Buffer.from(event.data));
    });
    upstream.addEventListener('close', () => socket.close());
    upstream.addEventListener('error', () => socket.close());
    socket.onClose(() => upstream.close());
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === productionOrigin) {
      if (url.pathname === '/api/analytics/registration') {
        claims.push(request.postDataJSON());
        await claimGate.promise;
        await route.fulfill({
          json: { track: options.track !== false && claims.length === 1, next: '/app/requests' },
        });
        return;
      }
      if (
        url.pathname === '/app' ||
        url.pathname.startsWith('/app/') ||
        url.pathname === '/__consent-fixture'
      ) {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><head><title>Isolated workspace fixture</title></head><body><h1>Workspace fixture</h1></body></html>',
        });
        return;
      }
      const headers = { ...request.headers() };
      delete headers.host;
      // The browser exercises the real production origin, but the fixture transport
      // must identify its loopback target correctly to Next's development asset guard.
      headers.origin = baseURL;
      headers.referer = `${baseURL}/registration-complete`;
      const response = await context.request.get(`${baseURL}${url.pathname}${url.search}`, {
        headers,
      });
      await route.fulfill({ response });
      return;
    }
    if (/(^|\.)(?:googletagmanager\.com|google-analytics\.com)$/.test(url.hostname)) {
      googleRequests.push(url.href);
      if (url.pathname === '/gtag/js') {
        await tagGate.promise;
        await route
          .fulfill({
            contentType: 'application/javascript',
            body: `
          (() => {
            const layer = window.dataLayer || [];
            const capture = (entry) => {
              const command = Array.from(entry);
              const callback = command[0] === 'event' && command[2]?.event_callback;
              const safe = JSON.parse(JSON.stringify(command));
              Promise.resolve(window.__recordRegistrationAnalytics(safe)).then(() => {
                if (typeof callback === 'function') callback();
              });
            };
            layer.forEach(capture);
            const push = layer.push.bind(layer);
            layer.push = (...entries) => { entries.forEach(capture); return push(...entries); };
          })();
        `,
          })
          .catch(() => undefined);
      } else await route.fulfill({ status: 204, body: '' });
      return;
    }
    unexpectedRequests.push(url.href);
    await route.abort();
  });
  return {
    commands,
    claims,
    googleRequests,
    unexpectedRequests,
    problems,
    releaseClaim: claimGate.release,
    releaseTag: tagGate.release,
  };
}

function events(commands: unknown[][]) {
  return commands.filter((entry) => entry[0] === 'event');
}

test.describe('isolated confirmed-registration analytics', () => {
  for (const width of [1440, 390]) {
    test(`the completion transition fits ${width}px and keeps a native fallback`, async ({
      page,
      context,
      baseURL,
    }) => {
      const fixture = await registrationFixture(context, baseURL!, {
        consent: null,
        holdClaim: true,
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${productionOrigin}/registration-complete`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(
        page.getByRole('heading', { level: 1, name: 'Ouverture de votre espace.' }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Continuer vers mon espace' })).toHaveAttribute(
        'href',
        '/app',
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const output = path.join(tmpdir(), 'ecarteo-registration-qa');
      await mkdir(output, { recursive: true });
      await page.screenshot({ path: path.join(output, `completion-${width}.png`) });
      fixture.releaseClaim();
      await expect(page).toHaveURL(`${productionOrigin}/app/requests`);
      expect(fixture.googleRequests).toEqual([]);
    });
  }

  test('one backend-approved activation sends one sign_up and no page_view, including after reload', async ({
    page,
    context,
    baseURL,
  }) => {
    const record = consent(true);
    const fixture = await registrationFixture(context, baseURL!, { consent: record, debug: true });
    await page.goto(`${productionOrigin}/registration-complete`);
    expect(fixture.problems).toEqual([]);
    expect(fixture.unexpectedRequests).toEqual([]);
    await expect(page).toHaveURL(`${productionOrigin}/app/requests`);
    expect(fixture.claims).toEqual([{ consent: record }]);
    expect(fixture.googleRequests).toEqual([
      `https://www.googletagmanager.com/gtag/js?id=${measurementId}`,
    ]);
    expect(events(fixture.commands)).toHaveLength(1);
    expect(events(fixture.commands)[0]).toEqual([
      'event',
      'sign_up',
      expect.objectContaining({ method: 'email', send_to: measurementId, debug_mode: true }),
    ]);
    expect(fixture.commands.find((entry) => entry[0] === 'config')?.[2]).toMatchObject({
      send_page_view: false,
    });
    expect(JSON.stringify(fixture.commands)).not.toMatch(
      /email_address|user_id|client_id|token_hash|\/app|password|\?/,
    );
    // Reopening the completion URL cannot manufacture another successful backend receipt.
    await page.goto(`${productionOrigin}/registration-complete`);
    await expect(page).toHaveURL(`${productionOrigin}/app/requests`);
    expect(fixture.claims).toHaveLength(2);
    expect(events(fixture.commands)).toHaveLength(1);
    expect(fixture.googleRequests).toHaveLength(1);
    expect(fixture.unexpectedRequests).toEqual([]);
  });

  for (const choice of ['absent', 'refused', 'expired'] as const) {
    test(`${choice} consent never loads Google, even if a stale claim says track`, async ({
      page,
      context,
      baseURL,
    }) => {
      const record =
        choice === 'absent' ? null : consent(choice !== 'refused', choice === 'expired');
      const fixture = await registrationFixture(context, baseURL!, { consent: record });
      await page.goto(`${productionOrigin}/registration-complete`);
      await expect(page).toHaveURL(`${productionOrigin}/app/requests`);
      expect(fixture.claims).toEqual([{ consent: choice === 'refused' ? record : null }]);
      expect(fixture.googleRequests).toEqual([]);
      expect(events(fixture.commands)).toEqual([]);
      expect(fixture.unexpectedRequests).toEqual([]);
    });
  }

  test('an unknown or consumed receipt sends no event despite accepted consent', async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await registrationFixture(context, baseURL!, {
      consent: consent(true),
      track: false,
    });
    await page.goto(`${productionOrigin}/registration-complete`);
    await expect(page).toHaveURL(`${productionOrigin}/app/requests`);
    expect(fixture.claims).toHaveLength(1);
    expect(fixture.googleRequests).toEqual([]);
    expect(events(fixture.commands)).toEqual([]);
  });

  for (const phase of ['claim', 'tag'] as const) {
    test(`withdrawing consent while the ${phase} is pending suppresses sign_up`, async ({
      page,
      context,
      baseURL,
    }) => {
      const fixture = await registrationFixture(context, baseURL!, {
        consent: consent(true),
        holdClaim: phase === 'claim',
        holdTag: phase === 'tag',
      });
      await page.goto(`${productionOrigin}/registration-complete`, {
        waitUntil: 'domcontentloaded',
      });
      await expect
        .poll(() => (phase === 'claim' ? fixture.claims.length : fixture.googleRequests.length))
        .toBe(1);
      const other = await context.newPage();
      await other.goto(`${productionOrigin}/__consent-fixture`);
      await other.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), {
        key: consentKey,
        record: consent(false),
      });
      fixture.releaseClaim();
      fixture.releaseTag();
      await expect(page).toHaveURL(`${productionOrigin}/app/requests`);
      expect(events(fixture.commands)).toEqual([]);
      expect(fixture.googleRequests).toHaveLength(phase === 'tag' ? 1 : 0);
      expect(fixture.unexpectedRequests).toEqual([]);
      await other.close();
    });
  }

  test('a completion URL containing a query or fragment never starts Google', async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await registrationFixture(context, baseURL!, { consent: consent(true) });
    await page.goto(
      `${productionOrigin}/registration-complete?token=private-fixture#private-fragment`,
    );
    await expect(page).toHaveURL(`${productionOrigin}/app/requests`);
    expect(fixture.googleRequests).toEqual([]);
    expect(events(fixture.commands)).toEqual([]);
  });

  test('ordinary signup, login and workspace visits never claim or send a registration event', async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await registrationFixture(context, baseURL!, { consent: consent(true) });
    for (const pathname of ['/signup', '/login', '/app']) {
      await page.goto(`${productionOrigin}${pathname}`);
      await expect(page.locator('main, h1').first()).toBeVisible();
    }
    expect(fixture.claims).toEqual([]);
    expect(fixture.googleRequests).toEqual([]);
    expect(events(fixture.commands)).toEqual([]);
    expect(fixture.unexpectedRequests).toEqual([]);
  });
});

test.describe('actual local activation receipt', () => {
  test('Mailpit confirmation creates and consumes one receipt; replay and ordinary login do not', async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    test.skip(
      process.env.ECARTEO_LOCAL_MAILPIT_E2E !== '1',
      'Requires local Supabase/Mailpit with the registration migration applied.',
    );
    expect(baseURL).toBe('http://127.0.0.1:3000');
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:55321');
    const record = consent(true);
    await context.addInitScript(
      ({ key, record }) => localStorage.setItem(key, JSON.stringify(record)),
      { key: consentKey, record },
    );
    const googleRequests: string[] = [];
    let claimCount = 0;
    const claimResults: { status: number; body: unknown }[] = [];
    await page.route('**/api/analytics/registration', async (route) => {
      const response = await route.fetch();
      claimResults.push({ status: response.status(), body: await response.json() });
      await route.fulfill({ response });
    });
    page.on('request', (item) => {
      if (new URL(item.url()).pathname === '/api/analytics/registration') claimCount += 1;
      if (
        /(^|\.)(?:googletagmanager\.com|google-analytics\.com)$/.test(new URL(item.url()).hostname)
      )
        googleRequests.push(item.url());
    });
    const email = `registration-analytics-${randomUUID()}@example.test`;
    const password = `Local-${randomUUID()}`;
    await page.goto('/signup');
    await page.getByLabel('Votre nom', { exact: true }).fill('Test activation locale');
    await page.getByLabel('Organisation', { exact: true }).fill('Test local analytics');
    await page.getByLabel('Adresse email professionnelle', { exact: true }).fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Créer mon espace', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Consultez votre messagerie', exact: true }),
    ).toBeVisible();
    expect(claimCount).toBe(0);
    const mailpit = 'http://127.0.0.1:55324/api/v1';
    let messageId: string | undefined;
    await expect
      .poll(async () => {
        const response = await request.get(`${mailpit}/search`, {
          params: { query: `to:${email}`, limit: 1 },
        });
        const data = await response.json();
        messageId = data.messages[0]?.ID;
        return Boolean(messageId);
      })
      .toBe(true);
    const message = await (await request.get(`${mailpit}/message/${messageId}`)).json();
    const href = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(message.HTML)?.[1];
    expect(href).toBeTruthy();
    const link = new URL(href!.replaceAll('&amp;', '&'));
    expect(link.origin).toBe(baseURL);
    expect(link.searchParams.get('type')).toBe('signup');
    await page.goto(link.href);
    await expect.poll(() => claimResults.length).toBe(1);
    expect(claimResults[0]).toEqual({ status: 200, body: { track: true, next: '/app' } });
    await expect(page).toHaveURL(`${baseURL}/app`);
    expect(claimCount).toBe(1);
    expect(googleRequests).toEqual([]); // Localhost never sends production analytics.
    await page.goto('/registration-complete');
    await expect.poll(() => claimResults.length).toBe(2);
    expect(claimResults[1].body).toMatchObject({ track: false });
    await expect(page).toHaveURL(`${baseURL}/app`);
    expect(claimCount).toBe(2);
    await page.reload();
    await expect(page).toHaveURL(`${baseURL}/app`);
    await page.goto(link.href);
    await expect(page).toHaveURL(/\/login\?notice=invalid-link$/);
    await page.getByLabel('Adresse email professionnelle', { exact: true }).fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/app`);
    expect(claimCount).toBe(2);
    expect(googleRequests).toEqual([]);
  });
});
