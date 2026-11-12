import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

async function authenticatedContext(
  browser: Browser,
  baseURL: string,
  email: string,
  password: string,
) {
  // Every test owns its own session. Sign-out only revokes that local session.
  const context = await browser.newContext({ baseURL, locale: 'en-GB' });
  await context.addCookies([{ name: 'ecarteo-locale', value: 'en', url: baseURL }]);
  const response = await context.request.post('/api/auth', {
    headers: { Origin: new URL(baseURL).origin, 'Accept-Language': 'en' },
    data: { action: 'login', email, password, next: '/app' },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ redirect: '/app' });
  return context;
}

async function open(context: BrowserContext, path: string, heading: string) {
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  return page;
}

async function expectExpired(page: Page, privateHeading: string, returnPath: string) {
  await expect(
    page.getByRole('heading', { name: 'Your session has expired', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: privateHeading, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in again', exact: true })).toHaveAttribute(
    'href',
    `/login?next=${encodeURIComponent(returnPath)}`,
  );
  await expect(page.getByRole('textbox')).toHaveCount(0);
}

test('staff portal content is removed on rejected sessions and another-tab local sign-out', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.E2E_QUALITY_EMAIL || !process.env.E2E_QUALITY_PASSWORD,
    'Requires a dedicated local quality account.',
  );
  const context = await authenticatedContext(
    browser,
    baseURL!,
    process.env.E2E_QUALITY_EMAIL!,
    process.env.E2E_QUALITY_PASSWORD!,
  );
  try {
    const consolePage = await context.newPage();
    await consolePage.goto('/app');
    await expect(consolePage.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    const team = await open(context, '/app/team', 'Team and access');
    const requests = await open(context, '/app/requests', 'Audit requests');
    await expect(
      team.getByRole('button', { name: 'Save access', exact: true }).first(),
    ).toBeVisible();
    await team.getByRole('textbox', { name: 'Search', exact: true }).fill('Private unsent search');

    // Simulate provider expiry responses without disabling the shared fixture identity.
    const expiredRequests = await open(context, '/app/requests', 'Audit requests');
    await expiredRequests.route('**/api/audit-requests?*', (route) =>
      route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED', error: 'Session expired' } }),
    );
    await expiredRequests.getByRole('button', { name: 'Filter', exact: true }).click();
    await expectExpired(expiredRequests, 'Audit requests', '/app/requests');

    const disabledTeam = await open(context, '/app/team', 'Team and access');
    await disabledTeam.route('**/api/team?*', (route) =>
      route.fulfill({
        status: 403,
        json: { code: 'ACCOUNT_UNAVAILABLE', error: 'Access unavailable' },
      }),
    );
    await disabledTeam.getByRole('button', { name: 'Search', exact: true }).click();
    await expectExpired(disabledTeam, 'Team and access', '/app/team');

    await consolePage.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(consolePage).toHaveURL(/\/login\?notice=signed-out/);
    await expectExpired(team, 'Team and access', '/app/team');
    await expect(team.getByRole('button', { name: 'Save access', exact: true })).toHaveCount(0);
    await expectExpired(requests, 'Audit requests', '/app/requests');
    expect((await context.request.get('/api/team')).status()).toBe(401);
  } finally {
    await context.close();
  }
});

test('billing content is removed after local sign-out in another tab', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD,
    'Requires a dedicated local client account.',
  );
  const context = await authenticatedContext(
    browser,
    baseURL!,
    process.env.E2E_CLIENT_EMAIL!,
    process.env.E2E_CLIENT_PASSWORD!,
  );
  try {
    const consolePage = await context.newPage();
    await consolePage.goto('/app');
    await expect(consolePage.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    const billing = await open(context, '/app/billing', 'Subscription and invoices');
    await expect(billing.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
    await consolePage.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(consolePage).toHaveURL(/\/login\?notice=signed-out/);
    await expectExpired(billing, 'Subscription and invoices', '/app/billing');
    await expect(billing.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);
    expect((await context.request.get('/api/billing')).status()).toBe(401);
  } finally {
    await context.close();
  }
});
