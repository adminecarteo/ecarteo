import { expect, test, type Page } from '@playwright/test';

const publicPages = [
  {
    path: '/',
    french: /Mesurez l’écart\.\s*Corrigez l’expérience\./,
    english: /Measure the gap\.\s*Improve the experience\./,
    title: 'Écartéo · Measure the gap. Improve the experience.',
  },
  {
    path: '/methode',
    french: /De la première demande\s*au prochain progrès\./,
    english: /From the first enquiry\s*to the next improvement\./,
    title: 'Our method · Écartéo',
  },
  {
    path: '/offres',
    french: /Le bon périmètre\.\s*Des résultats exploitables\./,
    english: /The right scope\.\s*Results you can act on\./,
    title: 'Our offers · Écartéo',
  },
  {
    path: '/mentions-legales',
    french: 'Mentions légales',
    english: 'Legal notice',
    title: 'Legal notice · Écartéo',
  },
  {
    path: '/confidentialite',
    french: 'Confidentialité',
    english: 'Privacy',
    title: 'Privacy · Écartéo',
  },
  {
    path: '/conditions',
    french: 'Conditions d’utilisation',
    english: 'Terms of use',
    title: 'Terms of use · Écartéo',
  },
] as const;

function observeProblems(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) problems.push(message.text());
  });
  return problems;
}

async function selectLocale(page: Page, locale: 'fr' | 'en') {
  await page
    .getByRole('button', { name: locale === 'fr' ? 'FR — Français' : 'EN — English', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

async function expectNoOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
}

test.describe('public HTML before JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('all six pages contain their French heading, footer and canonical URL', async ({ page }) => {
    for (const entry of publicPages) {
      const response = await page.goto(entry.path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.french);
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(
        page.getByRole('link', { name: 'Mentions légales', exact: true }).last(),
      ).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://ecarteo.fr${entry.path}`,
      );
    }
  });
});

test.describe('hydrated static marketing', () => {
  test('all six pages hydrate, translate their titles/footers and use only local marketing assets', async ({
    page,
    context,
  }) => {
    const problems = observeProblems(page);
    const resourceUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (['script', 'stylesheet', 'font', 'image'].includes(request.resourceType()))
        resourceUrls.push(url.href);
      if (/^\/(?:_next|api|auth)(?:\/|$)/.test(url.pathname) || request.headers().rsc)
        forbiddenRequests.push(url.href);
    });
    for (const entry of publicPages) {
      await context.clearCookies();
      await page.goto(entry.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.french);
      await selectLocale(page, 'en');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.english);
      await expect(page).toHaveTitle(entry.title);
      await expect(
        page.getByRole('link', { name: 'Legal notice', exact: true }).last(),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Privacy', exact: true }).last()).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Terms of use', exact: true }).last(),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
    }
    expect(resourceUrls.length).toBeGreaterThan(0);
    for (const resource of resourceUrls) {
      const url = new URL(resource);
      expect(url.origin).toBe('http://127.0.0.1:3216');
      expect(url.pathname.startsWith('/marketing-assets/') || url.pathname === '/icon.svg').toBe(
        true,
      );
    }
    expect(forbiddenRequests).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('language choice survives reload and full-document public navigation', async ({
    page,
    context,
  }) => {
    const problems = observeProblems(page);
    await page.goto('/');
    await selectLocale(page, 'en');
    const preference = (await context.cookies()).find((cookie) => cookie.name === 'ecarteo-locale');
    expect(preference?.value).toBe('en');
    expect(preference?.path).toBe('/');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(publicPages[0].english);
    const navigation = page.waitForRequest(
      (request) => request.isNavigationRequest() && new URL(request.url()).pathname === '/methode',
    );
    await page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Method', exact: true })
      .click();
    expect((await navigation).resourceType()).toBe('document');
    await expect(page).toHaveURL(/\/methode$/);
    await expect(page).toHaveTitle('Our method · Écartéo');
    await page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Offers', exact: true })
      .click();
    await expect(page).toHaveTitle('Our offers · Écartéo');
    await page.getByRole('link', { name: 'Privacy', exact: true }).last().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    await selectLocale(page, 'fr');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confidentialité');
    await expect(page).toHaveTitle('Confidentialité · Écartéo');
    expect(problems).toEqual([]);
  });

  test('a focus event restores a preference changed in another tab', async ({ page, context }) => {
    const problems = observeProblems(page);
    await page.goto('/');
    await selectLocale(page, 'en');
    const other = await context.newPage();
    const otherProblems = observeProblems(other);
    await other.goto('/methode');
    await expect(other.locator('html')).toHaveAttribute('lang', 'en');
    await selectLocale(other, 'fr');
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'ecarteo-locale')?.value,
    ).toBe('fr');
    // Headless pages do not reliably receive OS focus events; dispatch the actual subscribed event.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(publicPages[0].french);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle('Écartéo · Mesurez l’écart. Corrigez l’expérience.');
    expect([...problems, ...otherProblems]).toEqual([]);
    await other.close();
  });

  for (const width of [320, 390, 1280]) {
    test(`all public pages fit ${width}px and navigation remains usable in French/English`, async ({
      page,
    }) => {
      const problems = observeProblems(page);
      await page.setViewportSize({ width, height: 900 });
      for (const entry of publicPages) {
        await page.goto(entry.path);
        await selectLocale(page, 'fr');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.french);
        await expectNoOverflow(page);
        await selectLocale(page, 'en');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.english);
        await expectNoOverflow(page);
        if (width < 700) {
          const summary = page.locator('summary');
          const menu = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
          await summary.click();
          await expect(menu).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(menu).toBeHidden();
          await summary.click();
          await menu.getByRole('link', { name: 'Our method', exact: true }).click();
          await expect(page).toHaveURL(/\/methode$/);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(publicPages[1].english);
          await expect(page.locator('details')).not.toHaveAttribute('open', '');
        } else {
          await expect(
            page.getByRole('navigation', { name: 'Main navigation', exact: true }),
          ).toBeVisible();
          await expect(page.locator('summary')).toBeHidden();
        }
      }
      expect(problems).toEqual([]);
    });
  }

  for (const [path, label] of [
    ['/login', 'Se connecter'],
    ['/signup', 'Créer un compte'],
  ] as const) {
    test(`${path} handoff is an ordinary document request, not a Next/RSC navigation`, async ({
      page,
    }) => {
      const problems = observeProblems(page);
      // Deliberately intercept this boundary: the static preview cannot test real authentication.
      await page.route(`**${path}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html lang="en"><head><title>Navigation fixture</title></head><body><h1>Navigation fixture only</h1></body></html>',
        }),
      );
      await page.goto('/');
      const navigation = page.waitForRequest((request) => new URL(request.url()).pathname === path);
      await page.locator('header').getByRole('link', { name: label, exact: true }).click();
      const request = await navigation;
      expect(request.isNavigationRequest()).toBe(true);
      expect(request.resourceType()).toBe('document');
      expect(request.headers().rsc).toBeUndefined();
      expect(request.headers()['next-router-state-tree']).toBeUndefined();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Navigation fixture only');
      expect(problems).toEqual([]);
    });
  }
});
