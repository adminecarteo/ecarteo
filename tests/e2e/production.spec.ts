import { expect, test } from '@playwright/test';

test('sign-in retains credentials typed while application scripts are loading', async ({
  page,
}) => {
  let resume!: () => void;
  const scripts = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route('**/_next/static/**/*.js', async (route) => {
    await scripts;
    await route.continue();
  });
  try {
    await page.goto('/login', { waitUntil: 'commit' });
    const form = page.locator('form');
    await expect(form).toBeVisible();
    test.skip((await page.getByRole('status').count()) > 0, 'Requires a configured auth provider.');
    const submit = form.locator('button[type=submit]');
    await expect(submit).toBeDisabled();
    await form.locator('[name=email]').fill('early-entry@example.test');
    await form.locator('[name=password]').fill('synthetic-early-entry');
    resume();
    await expect(submit).toBeEnabled();
    await expect(form.locator('[name=email]')).toHaveValue('early-entry@example.test');
    await page.route('**/api/auth', (route) =>
      route.fulfill({ status: 401, json: { error: 'Test response' } }),
    );
    const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/auth');
    await submit.click();
    expect((await request).postDataJSON()).toMatchObject({
      action: 'login',
      email: 'early-entry@example.test',
      password: 'synthetic-early-entry',
    });
    await expect(form.locator('[name=password]')).toHaveValue('');
  } finally {
    resume();
  }
});

test('auth link redirects suppress referrers while public pages keep the site policy', async ({
  request,
}) => {
  for (const path of ['/auth/callback', '/auth/confirm']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(new URL(response.headers().location).pathname).toBe('/login');
  }
  const login = await request.get('/login');
  expect(login.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('account forms never submit credentials in a URL before JavaScript is ready', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/login');
    const form = page.locator('form');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', '/api/auth');
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeDisabled();
    // Playwright's text selector excludes noscript; its rendered paragraph is visible without JS.
    const notice = page.locator('noscript p');
    await expect(notice).toHaveText(
      'Activez JavaScript pour utiliser les formulaires de connexion sécurisés.',
    );
    await expect(notice).toBeVisible();
    await page.getByLabel('Adresse email professionnelle').fill('prehydration@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('never-place-this-in-a-url');
    const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/auth');
    await form.evaluate((element) => (element as HTMLFormElement).submit());
    const submitted = await request;
    expect(submitted.method()).toBe('POST');
    expect(new URL(submitted.url()).search).toBe('');
  } finally {
    await context.close();
  }
});

test('new customer and staff features remain private before login', async ({ page, request }) => {
  for (const path of ['/app/team', '/app/requests', '/app/billing']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Les Tilleuls', { exact: true })).toHaveCount(0);
  }
  for (const path of ['/api/team', '/api/audit-requests', '/api/billing']) {
    const response = await request.get(path);
    expect([401, 503]).toContain(response.status());
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});

test('monitoring and billing webhooks reject unauthenticated or unsigned probes', async ({
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  expect((await request.get('/api/ready')).status()).toBe(404);
  const webhook = await request.post('/api/billing/webhook', {
    data: { type: 'checkout.session.completed' },
  });
  expect([400, 503]).toContain(webhook.status());
});
