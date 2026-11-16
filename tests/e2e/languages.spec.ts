import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function selectEnglish(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'EN — English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
}

async function signIn(page: Page, email: string, password: string) {
  await selectEnglish(page);
  await page.getByLabel('Work email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\?|$)/);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const response = await page.request.get('/api/workspace');
  expect(response.status()).toBe(200);
  return response.json();
}

test('language choice persists across public and account pages without clearing form fields', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page
    .getByLabel('Adresse email professionnelle', { exact: true })
    .fill('language@example.test');
  await page.getByRole('button', { name: 'EN — English', exact: true }).click();
  await expect(page.getByLabel('Work email address', { exact: true })).toHaveValue(
    'language@example.test',
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  for (const path of ['/', '/methode', '/offres', '/signup', '/forgot-password']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'EN — English', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await mkdir('/tmp/ecarteo-languages-qa', { recursive: true });
  await page.goto('/');
  await page.screenshot({ path: '/tmp/ecarteo-languages-qa/landing-english.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/methode', '/offres', '/login', '/signup']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('button', { name: 'EN — English', exact: true })).toBeVisible();
  }
  await page.screenshot({
    path: '/tmp/ecarteo-languages-qa/signup-english-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'FR — Français', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByLabel('Organisation', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('admin language carries from login into the console and team/request pages', async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_QUALITY_EMAIL || !process.env.E2E_QUALITY_PASSWORD,
    'Requires a local quality account.',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const workspace = await signIn(
    page,
    process.env.E2E_QUALITY_EMAIL!,
    process.env.E2E_QUALITY_PASSWORD!,
  );
  expect(workspace.actor.role).toBe('qualite');
  await page.getByRole('link', { name: 'Team and access', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Team and access');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('link', { name: 'Audit requests', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit requests');
  await page.getByRole('button', { name: 'FR — Français', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demandes d’audit');
  await page.goto('/app');
  await expect(page.getByRole('button', { name: 'Se déconnecter', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('operator has assigned work and retains English on reload', async ({ page }) => {
  test.skip(
    !process.env.E2E_OPERATOR_EMAIL || !process.env.E2E_OPERATOR_PASSWORD,
    'Requires a local operator account.',
  );
  const workspace = await signIn(
    page,
    process.env.E2E_OPERATOR_EMAIL!,
    process.env.E2E_OPERATOR_PASSWORD!,
  );
  expect(workspace.actor.role).toBe('operateur');
  expect(workspace.state.missions.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const denied = await page.request.get('/api/team', { headers: { 'Accept-Language': 'en' } });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error).toBe('You do not have permission to perform this action.');
});

test('client can view a sample report and use English request and billing pages', async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD,
    'Requires a local client account.',
  );
  const workspace = await signIn(
    page,
    process.env.E2E_CLIENT_EMAIL!,
    process.env.E2E_CLIENT_PASSWORD!,
  );
  expect(workspace.actor.role).toBe('client');
  expect(
    workspace.state.missions.some((mission: { status: string }) => mission.status === 'done'),
  ).toBe(true);
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/view=rapport/);
  await expect(page.getByRole('combobox', { name: 'Choose a report', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy text', exact: true })).toBeVisible();
  await mkdir('/tmp/ecarteo-languages-qa', { recursive: true });
  await page.screenshot({
    path: '/tmp/ecarteo-languages-qa/client-report-english.png',
    fullPage: false,
  });
  await page.getByRole('link', { name: 'Audit requests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request an audit', exact: true })).toBeVisible();
  await page.goto('/app/billing');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByText('Online subscriptions are not available yet.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'FR — Français', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.goto('/app');
  await expect(page.getByRole('button', { name: 'Se déconnecter', exact: true })).toBeVisible();
});
