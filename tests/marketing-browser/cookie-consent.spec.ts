import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const publicOrigin = 'https://ecarteo.fr';
const localOrigin = 'http://127.0.0.1:3216';
const measurementId = 'G-X9BFFJ9M78';
const consentKey = 'ecarteo.cookie-consent.v1';
const artifacts = path.join(tmpdir(), 'ecarteo-consent-qa');

// Exercise the real production-origin guard against the built local artifact.
// Every external request is intercepted: these regression tests send no analytics.
async function isolateSite(context: BrowserContext, options: { holdTag?: boolean } = {}) {
  const googleRequests: string[] = [];
  const unexpectedRequests: string[] = [];
  let releaseTag: (() => void) | undefined;
  const tagGate = options.holdTag
    ? new Promise<void>((resolve) => {
        releaseTag = resolve;
      })
    : Promise.resolve();
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === publicOrigin) {
      const response = await context.request.get(`${localOrigin}${url.pathname}${url.search}`);
      await route.fulfill({ response });
      return;
    }
    if (url.origin === localOrigin) {
      await route.continue();
      return;
    }
    if (/(^|\.)(?:googletagmanager\.com|google-analytics\.com)$/.test(url.hostname)) {
      googleRequests.push(url.href);
      if (url.pathname === '/gtag/js') {
        await tagGate;
        await route.fulfill({ contentType: 'application/javascript', body: '/* GA test stub */' });
      } else {
        await route.fulfill({ status: 204, body: '' });
      }
      return;
    }
    unexpectedRequests.push(url.href);
    await route.abort();
  });
  return { googleRequests, unexpectedRequests, releaseTag: () => releaseTag?.() };
}

function observeProblems(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) problems.push(message.text());
  });
  return problems;
}

async function commands(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => {
    const layer = (window as typeof window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer;
    return (layer ?? []).map((command) => Array.from(command));
  });
}

async function pageViews(page: Page) {
  return (await commands(page)).filter(
    (command) => command[0] === 'event' && command[1] === 'page_view',
  );
}

async function analyticsCookies(context: BrowserContext) {
  return (await context.cookies()).filter((cookie) => cookie.name.startsWith('_ga'));
}

async function expectNoOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
}

test('a fresh visitor can refuse without loading Google; refusal survives navigation and reload', async ({
  page,
  context,
}) => {
  const network = await isolateSite(context);
  const problems = observeProblems(page);
  await page.goto(publicOrigin);
  const banner = page.getByRole('region', { name: 'Choix des cookies', exact: true });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Accepter', exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Refuser', exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Personnaliser', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(network.googleRequests).toEqual([]);
  expect(await analyticsCookies(context)).toEqual([]);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, 'banner-desktop-fr.png') });
  await banner.getByRole('button', { name: 'Refuser', exact: true }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(banner).toBeHidden();
  await page
    .getByRole('navigation', { name: 'Navigation principale', exact: true })
    .getByRole('link', { name: 'Méthode', exact: true })
    .click();
  await expect(page).toHaveURL(`${publicOrigin}/methode`);
  await expect(banner).toBeHidden();
  await page.waitForLoadState('networkidle');
  expect(network.googleRequests).toEqual([]);
  expect(await analyticsCookies(context)).toEqual([]);
  expect(network.unexpectedRequests).toEqual([]);
  expect(problems).toEqual([]);
});

test('acceptance loads the requested GA4 tag once and queues one sanitized page_view per public document', async ({
  page,
  context,
}) => {
  const network = await isolateSite(context);
  const problems = observeProblems(page);
  await page.goto(`${publicOrigin}/?email=private%40example.test&token=secret#private-fragment`);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect.poll(() => pageViews(page)).toHaveLength(1);
  expect(network.googleRequests).toEqual([
    `https://www.googletagmanager.com/gtag/js?id=${measurementId}`,
  ]);
  const config = (await commands(page)).find((command) => command[0] === 'config');
  expect(config?.[1]).toBe(measurementId);
  expect(config?.[2]).toMatchObject({ send_page_view: false });
  expect((await pageViews(page))[0][2]).toMatchObject({ page_location: `${publicOrigin}/` });
  expect(JSON.stringify(await commands(page))).not.toMatch(
    /private@|example\.test|secret|private-fragment/,
  );
  await page
    .getByRole('navigation', { name: 'Navigation principale', exact: true })
    .getByRole('link', { name: 'Méthode', exact: true })
    .click();
  await expect(page).toHaveURL(`${publicOrigin}/methode`);
  await expect.poll(() => pageViews(page)).toHaveLength(1);
  expect((await pageViews(page))[0][2]).toMatchObject({ page_location: `${publicOrigin}/methode` });
  await expect(page.getByRole('region', { name: 'Choix des cookies', exact: true })).toBeHidden();
  expect(network.googleRequests).toHaveLength(2);
  expect(network.unexpectedRequests).toEqual([]);
  expect(problems).toEqual([]);
});

test('preferences default to analytics off, support keyboard dismissal and allow later withdrawal', async ({
  page,
  context,
}) => {
  const network = await isolateSite(context);
  const problems = observeProblems(page);
  await page.goto(publicOrigin);
  const customise = page.getByRole('button', { name: 'Personnaliser', exact: true });
  await customise.click();
  const dialog = page.getByRole('dialog', { name: 'Gérer les cookies', exact: true });
  const analytics = dialog.getByRole('checkbox', {
    name: 'Mesure d’audience (Google Analytics)',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(analytics).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(customise).toBeFocused();
  expect(network.googleRequests).toEqual([]);
  await customise.click();
  await analytics.check();
  await dialog.getByRole('button', { name: 'Enregistrer mes choix', exact: true }).click();
  await expect.poll(() => pageViews(page)).toHaveLength(1);
  // A controlled cookie fixture verifies both host-only and domain cookie deletion.
  await context.addCookies([
    { name: '_ga', value: 'fixture', domain: '.ecarteo.fr', path: '/', secure: true },
    { name: '_ga_X9BFFJ9M78', value: 'fixture', url: publicOrigin, secure: true },
  ]);
  await page.getByRole('button', { name: 'Gérer les cookies', exact: true }).click();
  await expect(analytics).toBeChecked();
  await analytics.uncheck();
  await dialog.getByRole('button', { name: 'Enregistrer mes choix', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => analyticsCookies(context)).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['ga-disable-G-X9BFFJ9M78'],
    ),
  ).toBe(true);
  const requestCount = network.googleRequests.length;
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(network.googleRequests).toHaveLength(requestCount);
  expect(await pageViews(page)).toEqual([]);
  expect(network.unexpectedRequests).toEqual([]);
  expect(problems).toEqual([]);
});

test('refusing while the Google script is loading prevents queued page views', async ({
  page,
  context,
}) => {
  const network = await isolateSite(context, { holdTag: true });
  await page.goto(publicOrigin);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect.poll(() => network.googleRequests.length).toBe(1);
  await page.getByRole('button', { name: 'Gérer les cookies', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Refuser', exact: true }).click();
  network.releaseTag();
  await page.waitForLoadState('networkidle');
  expect(await pageViews(page)).toEqual([]);
  expect(await analyticsCookies(context)).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['ga-disable-G-X9BFFJ9M78'],
    ),
  ).toBe(true);
});

test('withdrawal in another tab updates consent and disables tracking in existing tabs', async ({
  page,
  context,
}) => {
  await isolateSite(context);
  await page.goto(publicOrigin);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect.poll(() => pageViews(page)).toHaveLength(1);
  const other = await context.newPage();
  await other.goto(`${publicOrigin}/offres`);
  await expect.poll(() => pageViews(other)).toHaveLength(1);
  await other.getByRole('button', { name: 'Gérer les cookies', exact: true }).click();
  await other.getByRole('dialog').getByRole('button', { name: 'Refuser', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as Record<string, unknown>)['ga-disable-G-X9BFFJ9M78'],
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Gérer les cookies', exact: true }).click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('checkbox', { name: 'Mesure d’audience (Google Analytics)', exact: true }),
  ).not.toBeChecked();
  await other.close();
});

test('expired consent is requested again without starting analytics', async ({ page, context }) => {
  const network = await isolateSite(context);
  await context.addInitScript(
    ({ key }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          analytics: true,
          savedAt: Date.now() - 181 * 86_400_000,
          expiresAt: Date.now() - 86_400_000,
        }),
      );
    },
    { key: consentKey },
  );
  await page.goto(publicOrigin);
  await expect(page.getByRole('region', { name: 'Choix des cookies', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(network.googleRequests).toEqual([]);
});

test('accepting on a preview origin cannot send production analytics', async ({
  page,
  context,
}) => {
  const network = await isolateSite(context);
  await page.goto(localOrigin);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Choix des cookies', exact: true })).toBeHidden();
  await page.waitForLoadState('networkidle');
  expect(network.googleRequests).toEqual([]);
  expect(await pageViews(page)).toEqual([]);
});

for (const width of [320, 390]) {
  test(`cookie controls and preferences fit ${width}px in French and English`, async ({
    page,
    context,
  }) => {
    const network = await isolateSite(context);
    const problems = observeProblems(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(publicOrigin);
    await mkdir(artifacts, { recursive: true });
    for (const locale of ['fr', 'en'] as const) {
      if (locale === 'en') {
        await page.getByRole('button', { name: 'EN — English', exact: true }).click();
      }
      const banner = page.getByRole('region', {
        name: locale === 'fr' ? 'Choix des cookies' : 'Cookie choices',
        exact: true,
      });
      await expect(banner).toBeVisible();
      await expectNoOverflow(page);
      for (const choice of await banner.getByRole('button').all()) {
        expect(await choice.evaluate((button) => button.scrollWidth <= button.clientWidth)).toBe(
          true,
        );
      }
      await page.screenshot({ path: path.join(artifacts, `banner-${width}-${locale}.png`) });
      await banner
        .getByRole('button', { name: locale === 'fr' ? 'Personnaliser' : 'Customise', exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: locale === 'fr' ? 'Gérer les cookies' : 'Manage cookies',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expectNoOverflow(page);
      await page.screenshot({ path: path.join(artifacts, `preferences-${width}-${locale}.png`) });
      await dialog
        .getByRole('button', { name: locale === 'fr' ? 'Fermer' : 'Close', exact: true })
        .click();
      await expect(dialog).toBeHidden();
    }
    expect(network.googleRequests).toEqual([]);
    expect(network.unexpectedRequests).toEqual([]);
    expect(problems).toEqual([]);
  });
}
