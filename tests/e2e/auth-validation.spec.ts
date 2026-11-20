import { expect, test, type Page } from '@playwright/test';

const secret = 'synthetic audit passphrase';
const anotherSecret = 'another synthetic passphrase';
const confirmationMessage = 'Synthetic confirmation response';
const providerError =
  'The authentication service is temporarily unavailable. Wait before trying again.';

const messages = {
  en: {
    language: 'EN — English',
    mismatch: 'The passwords do not match.',
    summary: 'Check the highlighted fields.',
    registered: 'This email is already registered. Sign in or reset your password.',
    signIn: 'Sign in',
    resetPassword: 'Reset password',
  },
  fr: {
    language: 'FR — Français',
    mismatch: 'Les mots de passe ne correspondent pas.',
    summary: 'Vérifiez les champs indiqués.',
    registered:
      'Cette adresse email est déjà enregistrée. Connectez-vous ou réinitialisez votre mot de passe.',
    signIn: 'Se connecter',
    resetPassword: 'Réinitialiser le mot de passe',
  },
};

async function signup(
  page: Page,
  locale: 'en' | 'fr' = 'en',
  response = { status: 200, json: { message: confirmationMessage } as Record<string, unknown> },
  next?: string,
) {
  const requests: Record<string, unknown>[] = [];
  // Every auth request is intercepted: these UI checks create no accounts or emails.
  await page.route('**/api/auth', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill(response);
  });
  await page.goto(next ? `/signup?next=${encodeURIComponent(next)}` : '/signup');
  await page.getByRole('button', { name: messages[locale].language, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  test.skip(
    await page
      .getByRole('status')
      .filter({
        hasText: /secure workspace is being activated|espace sécurisé est en cours d’activation/,
      })
      .isVisible(),
    'Requires configured auth; CI also runs these cases with the isolated frontend fixture.',
  );
  const form = page.locator('form');
  const submit = form.locator('button[type=submit]');
  await expect(submit).toBeEnabled();
  const name = form.locator('[name=name]');
  const company = form.locator('[name=company]');
  const email = form.locator('[name=email]');
  const password = form.locator('[name=password]');
  const confirm = form.locator('[name=confirmPassword]');
  await name.fill('QA Customer');
  await company.fill('Synthetic QA Organisation');
  await email.fill('qa@example.test');
  await password.fill(secret);
  await confirm.fill(secret);
  return { form, submit, name, company, email, password, confirm, requests };
}

for (const locale of ['en', 'fr'] as const) {
  test(`${locale}: correcting either password clears the stale mismatch before resubmitting`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    if (locale === 'en') await page.setViewportSize({ width: 390, height: 844 });
    const { form, submit, password, confirm, requests } = await signup(page, locale);
    await expect(page).toHaveTitle(/Écartéo/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      locale === 'en'
        ? 'Your next improvement starts here.'
        : 'Votre prochain progrès commence ici.',
    );
    await confirm.fill(anotherSecret);
    await submit.click();
    await expect(form.getByRole('alert')).toHaveText(messages[locale].summary);
    await expect(page.locator('#auth-confirmPassword-error')).toHaveText(messages[locale].mismatch);
    await expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toHaveLength(0);

    await confirm.fill(secret);
    await expect(confirm).toHaveAttribute('aria-invalid', 'false');
    await expect(page.locator('#auth-confirmPassword-error')).toHaveCount(0);
    await expect(form.getByRole('alert')).toHaveCount(0);

    await password.fill(anotherSecret);
    await submit.click();
    await expect(confirm).toHaveAttribute('aria-invalid', 'true');
    await password.fill(secret);
    await expect(confirm).toHaveAttribute('aria-invalid', 'false');
    await expect(form.getByRole('alert')).toHaveCount(0);
    expect(requests).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `/tmp/ecarteo-auth-validation-${locale}.png`, fullPage: true });

    await submit.click();
    await expect(page.getByRole('status')).toContainText(confirmationMessage);
    expect(requests).toEqual([
      expect.objectContaining({ password: secret, confirmPassword: secret }),
    ]);
    expect(errors).toEqual([]);
  });
}

for (const locale of ['en', 'fr'] as const) {
  test(`${locale}: duplicate signup keeps account guidance until the email changes`, async ({
    page,
  }) => {
    const response = {
      status: 409,
      json: {
        code: 'EMAIL_ALREADY_REGISTERED',
        error: messages[locale].registered,
        fieldErrors: { email: messages[locale].registered },
      } as Record<string, unknown>,
    };
    const { form, submit, name, email, password, confirm, requests } = await signup(
      page,
      locale,
      response,
    );
    await submit.click();
    const alert = form.getByRole('alert');
    await expect(alert).toContainText(messages[locale].registered);
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#auth-email-error')).toHaveText(messages[locale].registered);
    await expect(password).toHaveValue('');
    await expect(confirm).toHaveValue('');
    await expect(
      page.getByRole('heading', { name: /Check your inbox|Consultez votre messagerie/ }),
    ).toHaveCount(0);

    await email.focus();
    await email.press('Tab');
    await expect(alert).toContainText(messages[locale].registered);
    await name.fill('QA Customer Updated');
    await password.fill(anotherSecret);
    await confirm.fill(anotherSecret);
    await confirm.press('Tab');
    await expect(alert).toContainText(messages[locale].registered);
    await email.fill('QA@EXAMPLE.TEST');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(alert).toContainText(messages[locale].registered);
    expect(requests).toHaveLength(1);

    await email.fill('qa-new@example.test');
    await expect(email).toHaveAttribute('aria-invalid', 'false');
    await expect(page.locator('#auth-email-error')).toHaveCount(0);
    await expect(alert).toHaveCount(0);
    response.status = 200;
    response.json = { message: confirmationMessage };
    await submit.click();
    await expect(page.getByRole('status')).toContainText(confirmationMessage);
    expect(requests).toEqual([
      expect.objectContaining({ email: 'qa@example.test' }),
      expect.objectContaining({ email: 'qa-new@example.test', password: anotherSecret }),
    ]);
  });

  for (const destination of ['login', 'forgot-password'] as const) {
    test(`${locale}: duplicate signup ${destination} link survives blur and preserves the destination`, async ({
      page,
    }) => {
      const next = '/app/requests?view=pending';
      const { form, submit, email, requests } = await signup(
        page,
        locale,
        {
          status: 409,
          json: {
            code: 'EMAIL_ALREADY_REGISTERED',
            error: messages[locale].registered,
            fieldErrors: { email: messages[locale].registered },
          },
        },
        next,
      );
      await submit.click();
      const link = form.getByRole('alert').getByRole('link', {
        name: destination === 'login' ? messages[locale].signIn : messages[locale].resetPassword,
        exact: true,
      });
      const path = `/${destination}?next=${encodeURIComponent(next)}`;
      await expect(link).toHaveAttribute('href', path);
      // Clicking from an input triggers blur before the link's click handler.
      await email.focus();
      await link.click();
      await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === path);
      expect(requests).toHaveLength(1);
    });
  }
}

test('correcting a password mismatch keeps unrelated invalid fields visible', async ({ page }) => {
  const { form, submit, name, confirm, requests } = await signup(page);
  await name.fill('');
  await confirm.fill(anotherSecret);
  await submit.click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');

  await confirm.fill(secret);
  await expect(confirm).toHaveAttribute('aria-invalid', 'false');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#auth-name-error')).toHaveText('Enter your name.');
  await expect(form.getByRole('alert')).toHaveText(messages.en.summary);
  expect(requests).toHaveLength(0);

  await name.fill('QA Customer');
  await expect(name).toHaveAttribute('aria-invalid', 'false');
  await expect(form.getByRole('alert')).toHaveCount(0);
});

test('password confirmation preserves meaningful whitespace and submits it unchanged', async ({
  page,
}) => {
  const { form, submit, password, confirm, requests } = await signup(page);
  const spacedSecret = ` ${secret} `;
  await password.fill(spacedSecret);
  await confirm.fill(secret);
  await submit.click();
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');
  expect(requests).toHaveLength(0);

  await confirm.fill(`${secret} `);
  await confirm.press('Tab');
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#auth-confirmPassword-error')).toHaveText(messages.en.mismatch);
  await confirm.fill(spacedSecret);
  await expect(confirm).toHaveAttribute('aria-invalid', 'false');
  await expect(form.getByRole('alert')).toHaveCount(0);
  await submit.click();
  await expect(page.getByRole('status')).toContainText(confirmationMessage);
  expect(requests).toEqual([
    expect.objectContaining({ password: spacedSecret, confirmPassword: spacedSecret }),
  ]);
});

test('blur reads values changed without input events and submits the actual form values', async ({
  page,
}) => {
  const { form, submit, password, confirm, requests } = await signup(page);
  await confirm.fill(anotherSecret);
  await submit.click();
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');
  const autofilledSecret = ' synthetic autofilled passphrase ';
  // Model password managers which update the DOM without dispatching React input events.
  await password.evaluate((element, value) => {
    (element as HTMLInputElement).value = value;
  }, autofilledSecret);
  await confirm.evaluate((element, value) => {
    (element as HTMLInputElement).value = value;
  }, autofilledSecret);
  await confirm.focus();
  await confirm.press('Tab');
  await expect(confirm).toHaveAttribute('aria-invalid', 'false');
  await expect(form.getByRole('alert')).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await submit.click();
  await expect(page.getByRole('status')).toContainText(confirmationMessage);
  expect(requests).toEqual([
    expect.objectContaining({
      action: 'signup',
      email: 'qa@example.test',
      password: autofilledSecret,
      confirmPassword: autofilledSecret,
    }),
  ]);
});

test('editing fields does not dismiss an authentication provider failure', async ({ page }) => {
  const { form, submit, name, password, confirm, requests } = await signup(page, 'en', {
    status: 503,
    json: { error: providerError },
  });
  await submit.click();
  await expect(form.getByRole('alert')).toHaveText(providerError);
  await expect(password).toHaveValue('');
  await expect(confirm).toHaveValue('');
  await name.fill('QA Customer Updated');
  await password.fill(anotherSecret);
  await confirm.fill(anotherSecret);
  await confirm.press('Tab');
  await expect(form.getByRole('alert')).toHaveText(providerError);
  expect(requests).toHaveLength(1);
});

test('password reset clears a corrected mismatch and submits only the matching new password', async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(
    process.env.E2E_DEPLOYMENT_TARGET !== 'frontend',
    'The isolated frontend fixture supplies a synthetic identity without a real recovery session.',
  );
  const requests: Record<string, unknown>[] = [];
  const identityRequests: string[] = [];
  await context.addCookies([{ name: 'ecarteo-locale', value: 'en', url: baseURL! }]);
  await page.route('**/api/session*', async (route) => {
    identityRequests.push(new URL(route.request().url()).search);
    await route.fulfill({
      json: { user: { id: '52c7a86b-4727-4b3a-8d15-274a398d68ae', email: 'qa@example.test' } },
    });
  });
  await page.route('**/api/auth', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { redirect: '/login?notice=password-updated' } });
  });
  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { name: 'A new password.', exact: true })).toBeVisible();
  expect(identityRequests).toContain('?mode=user');
  const form = page.locator('form');
  const password = page.getByLabel('New password', { exact: true });
  const confirm = page.getByLabel('Confirm password', { exact: true });
  const submit = page.getByRole('button', { name: 'Save the password', exact: true });
  await password.fill(secret);
  await confirm.fill(anotherSecret);
  await submit.click();
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('alert')).toHaveText(messages.en.summary);
  expect(requests).toHaveLength(0);
  await confirm.fill(secret);
  await expect(confirm).toHaveAttribute('aria-invalid', 'false');
  await expect(form.getByRole('alert')).toHaveCount(0);
  await submit.click();
  await expect(page).toHaveURL(/\/login\?notice=password-updated$/);
  await expect(page.getByRole('status')).toContainText(
    'Your password has been changed. You can sign in again.',
  );
  expect(requests).toEqual([{ action: 'reset', password: secret, confirmPassword: secret }]);
});
