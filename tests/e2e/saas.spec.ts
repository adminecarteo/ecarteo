import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('public website routes lead to real account pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mesurez');
  await expect(page.getByText('Exemple illustratif', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Méthode', exact: true }).first().click();
  await expect(page).toHaveURL(/\/methode$/);
  await page.getByRole('link', { name: 'Offres', exact: true }).first().click();
  await expect(page).toHaveURL(/\/offres$/);
  await page.getByRole('link', { name: 'Se connecter', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Heureux de vous retrouver.' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('login, signup and recovery forms support password managers and keyboard visibility', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByLabel('Adresse email professionnelle')).toHaveAttribute(
    'autocomplete',
    'email',
  );
  const password = page.getByLabel('Mot de passe', { exact: true });
  await password.fill('a-private-test-password');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Afficher mot de passe', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Masquer mot de passe', exact: true }).click();
  await page.getByRole('link', { name: 'Créer un compte', exact: true }).click();
  await expect(page.getByLabel('Votre nom')).toBeVisible();
  await expect(page.getByLabel('Organisation', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirmer le mot de passe', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password',
  );
  await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page.getByRole('heading', { name: 'Retrouvez votre accès.' })).toBeVisible();
});
test('unconfigured deployment fails closed without any demo workspace', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/workspace');
  const configuration = await response.json();
  test.skip(
    response.status() !== 503 || configuration.code !== 'AUTH_NOT_CONFIGURED',
    'This case only applies before Supabase activation.',
  );
  await page.goto('/login');
  await expect(page.getByRole('status')).toContainText('en cours d’activation');
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeDisabled();
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Votre espace sécurisé' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Aperçu du rôle' })).toHaveCount(0);
  expect(response.status()).toBe(503);
  expect(JSON.stringify(configuration)).not.toContain('Les Tilleuls');
});
test('public mutation endpoints reject requests from other origins', async ({ request }) => {
  const response = await request.post('/api/auth', {
    headers: { origin: 'https://evil.example' },
    data: { action: 'login', email: 'test@example.com', password: 'irrelevant' },
  });
  expect(response.status()).toBe(403);
});
test('desktop and mobile layouts stay within the viewport', async ({ page }) => {
  await mkdir('/tmp/ecarteo-saas-qa', { recursive: true });
  await page.goto('/');
  await page.screenshot({ path: '/tmp/ecarteo-saas-qa/landing-desktop.png', fullPage: true });
  await page.goto('/login');
  await page.screenshot({ path: '/tmp/ecarteo-saas-qa/login-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    '/',
    '/methode',
    '/offres',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
  ]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto('/signup');
  await page.screenshot({ path: '/tmp/ecarteo-saas-qa/signup-mobile.png', fullPage: true });
});

test('compact public navigation fits small screens and restores keyboard focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 641, height: 850 });
  await page.goto('/methode');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 375, height: 812 });
  const header = page.getByRole('banner');
  const brand = await header.getByRole('link', { name: 'Écartéo, accueil' }).boundingBox();
  const toggle = header.locator('summary');
  const control = await toggle.boundingBox();
  expect(brand).not.toBeNull();
  expect(control).not.toBeNull();
  expect(brand!.y + brand!.height).toBeGreaterThan(control!.y);

  await toggle.focus();
  await page.keyboard.press('Enter');
  const current = page
    .getByRole('navigation', { name: 'Navigation mobile' })
    .getByRole('link', { name: 'La méthode' });
  await expect(current).toHaveAttribute('aria-current', 'page');
  await current.focus();
  await page.keyboard.press('Escape');
  await expect(current).toBeHidden();
  await expect(toggle).toBeFocused();
});

test.describe('public navigation on touch screens', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('menu links navigate on the first tap', async ({ page }) => {
    for (const [label, path] of [
      ['La méthode', '/methode'],
      ['Les offres', '/offres'],
      ['Se connecter', '/login'],
      ['Créer un compte', '/signup'],
    ]) {
      await page.goto('/');
      await page.locator('summary').tap();
      await page
        .getByRole('navigation', { name: 'Navigation mobile' })
        .getByRole('link', { name: label })
        .tap();
      await expect(page).toHaveURL(path);
    }
  });
});
