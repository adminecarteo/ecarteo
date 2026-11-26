import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

// This file exercises private, single-use links in the local Mailpit test.
test.use({ trace: 'off', screenshot: 'off' });

test('language controls wait for hydration before accepting a choice on a new signup document', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: 'ecarteo-locale', value: 'en', url: baseURL! }]);
  let releaseScripts!: () => void;
  const hydrationGate = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route('**/_next/static/**', async (route) => {
    if (route.request().resourceType() === 'script') await hydrationGate;
    await route.continue();
  });
  try {
    await page.goto('/signup?offer=flash', { waitUntil: 'commit' });
    await expect(page.getByText(/Selected offer: Flash audit/)).toBeVisible();
    // A visible SSR button cannot handle clicks until its JavaScript has hydrated.
    await expect(page.getByRole('button', { name: 'FR — Français' })).toBeDisabled();
  } finally {
    releaseScripts();
  }
  const french = page.getByRole('button', { name: 'FR — Français' });
  await expect(french).toBeEnabled();
  await french.click();
  await expect(page.getByText(/Offre choisie : Audit Flash/)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('offer selection survives switching between signup, sign-in and password recovery', async ({
  page,
}) => {
  await page.goto('/offres');
  await page.getByRole('button', { name: 'EN — English' }).click();
  await page.getByRole('link', { name: 'Request: Flash audit' }).click();
  await expect(page).toHaveURL(/\/signup\?offer=flash$/);
  await expect(page.getByText(/Selected offer: Flash audit/)).toBeVisible();
  await page.getByRole('button', { name: 'FR — Français' }).click();
  await expect(page.getByText(/Offre choisie : Audit Flash/)).toBeVisible();
  await page.getByRole('link', { name: 'Se connecter', exact: true }).click();
  const signInUrl = /\/login\?next=%2Fapp%2Frequests%3Foffer%3Dflash$/;
  await expect(page).toHaveURL(signInUrl);
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await page.getByRole('link', { name: 'Retour à la connexion' }).click();
  await expect(page).toHaveURL(signInUrl);
  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await expect(page.getByText(/Offre choisie : Audit Flash/)).toBeVisible();
  await page.getByRole('link', { name: 'Se connecter', exact: true }).click();
  await expect(page).toHaveURL(signInUrl);
});

test('expired links lead directly to separate confirmation and password recovery forms', async ({
  page,
}) => {
  await page.goto('/login?notice=invalid-link');
  await page.getByRole('link', { name: 'Renvoyer la confirmation du compte' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmez votre adresse email.' })).toBeVisible();
  await expect(page.locator('form input')).toHaveCount(1);
  await page.goBack();
  await page.getByRole('button', { name: 'EN — English' }).click();
  await page.getByRole('link', { name: 'Request a password reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Regain access.' })).toBeVisible();
});

test('local Mailpit confirmation in a fresh browser recovers an editable first request', async ({
  browser,
  page,
  request,
  baseURL,
}) => {
  test.skip(
    process.env.ECARTEO_LOCAL_MAILPIT_E2E !== '1',
    'Requires the dedicated local Supabase and Mailpit stack.',
  );
  expect(baseURL).toBe('http://127.0.0.1:3000');
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:55321');
  test.setTimeout(90_000);
  const email = `offer-${randomUUID()}@example.test`;
  await page.goto('/offres');
  await page.getByRole('button', { name: 'EN — English' }).click();
  await page.getByRole('link', { name: 'Request: Flash audit' }).click();
  await page.getByLabel('Your name').fill('Local Offer Test');
  await page.getByLabel('Organisation').fill('Local acceptance');
  await page.getByLabel('Work email address').fill(email);
  const password = `Local-${randomUUID()}`;
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  const mailpit = 'http://127.0.0.1:55324/api/v1';
  const received = new Set<string>();
  async function nextMailLink(kind: 'signup' | 'recovery') {
    let messageId: string | undefined;
    await expect
      .poll(
        async () => {
          const response = await request.get(`${mailpit}/search`, {
            params: { query: `to:${email}`, limit: 10 },
          });
          const result = await response.json();
          messageId = result.messages.find((item: { ID: string }) => !received.has(item.ID))?.ID;
          return Boolean(messageId);
        },
        { timeout: 15000 },
      )
      .toBe(true);
    if (!messageId) throw new Error('Mailpit message missing');
    received.add(messageId);
    const message = await (await request.get(`${mailpit}/message/${messageId}`)).json();
    const href = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(message.HTML)?.[1];
    if (!href) throw new Error('Mailpit message missing the application link');
    const link = new URL(href.replaceAll('&amp;', '&'));
    expect(link.origin).toBe(baseURL);
    expect(link.searchParams.get('type')).toBe(kind);
    return link;
  }

  await nextMailLink('signup');
  await page.goto('/login?notice=invalid-link');
  await page.getByRole('link', { name: 'Resend account confirmation' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your email address.' })).toBeVisible();
  await page.getByLabel('Work email address').fill(email);
  // The local GoTrue configuration limits new mail to one per second per recipient.
  await page.waitForTimeout(1100);
  await expect(page.getByLabel('Work email address')).toHaveValue(email);
  await page.getByRole('button', { name: 'Resend confirmation email' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  const link = await nextMailLink('signup');
  const device = await browser.newContext({ baseURL });
  try {
    const confirmed = await device.newPage();
    await confirmed.goto(link.href);
    await expect(confirmed).toHaveURL(`${baseURL}/app/requests`);
    await confirmed.getByRole('button', { name: 'EN — English' }).click();
    const subject = confirmed.getByRole('textbox', { name: 'Request subject' });
    await expect(subject).toHaveValue('Flash audit');
    await expect(confirmed.getByRole('textbox', { name: 'Your requirements' })).toHaveValue(
      /two channels/,
    );
    await subject.fill('Local edited enquiry test');
    await confirmed.getByRole('button', { name: 'FR — Français' }).click();
    await expect(confirmed.getByRole('textbox', { name: 'Objet de la demande' })).toHaveValue(
      'Local edited enquiry test',
    );
    await confirmed.getByRole('button', { name: 'EN — English' }).click();
    await confirmed.getByRole('button', { name: 'Submit request' }).click();
    await expect(confirmed.getByText('Local edited enquiry test', { exact: true })).toBeVisible();
    await confirmed.reload();
    await confirmed.getByRole('button', { name: 'New request', exact: true }).click();
    await expect(subject).toHaveValue('');
    await page.goto('/login?notice=invalid-link');
    await page.getByRole('link', { name: 'Request a password reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Regain access.' })).toBeVisible();
    await page.getByLabel('Work email address').fill(email);
    await page.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    const recovery = await nextMailLink('recovery');
    await page.goto(recovery.href);
    await expect(page).toHaveURL(`${baseURL}/reset-password`);
  } finally {
    await device.close();
  }
});
