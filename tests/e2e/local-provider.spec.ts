import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const mailpit = process.env.E2E_MAILPIT_URL;
const qualityEmail = process.env.E2E_QUALITY_EMAIL;
const qualityPassword = process.env.E2E_QUALITY_PASSWORD;
const clientEmail = process.env.E2E_CLIENT_EMAIL;
const clientPassword = process.env.E2E_CLIENT_PASSWORD;
const tenant = process.env.E2E_CLIENT_ID;
const local = (value?: string) => {
  try {
    return !!value && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
};
const password = () => randomBytes(24).toString('base64url');
async function login(page: Page, email: string, secret: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse email professionnelle', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\?|$)/);
}
async function signup(page: Page, email: string, secret: string) {
  await page.goto('/signup');
  await page.getByLabel('Votre nom', { exact: true }).fill('Recette identité locale');
  await page
    .getByLabel('Organisation', { exact: true })
    .fill(`Recette locale ${randomUUID().slice(0, 8)}`);
  await page.getByLabel('Adresse email professionnelle', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(secret);
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Créer mon espace', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Consultez votre messagerie', exact: true }),
  ).toBeVisible();
}
/** Read only the local SMTP sink. These tests cannot send or retrieve production email. */
async function emailLink(email: string, kind: 'signup' | 'recovery') {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(
      `${mailpit}/view/latest.html?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (response.ok) {
      const html = await response.text();
      const href = html.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
      if (href) {
        const link = new URL(href);
        if (
          link.origin === new URL(baseURL).origin &&
          link.pathname === '/auth/confirm' &&
          link.searchParams.get('type') === kind
        )
          return href;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Expected local confirmation/recovery email was not received.');
}
test.describe('actual local Auth, email and invitation acceptance', () => {
  test.skip(
    !local(baseURL) ||
      !local(mailpit) ||
      !qualityEmail ||
      !qualityPassword ||
      !clientEmail ||
      !clientPassword ||
      !tenant,
    'Requires local Supabase/Mailpit and dedicated quality/client fixtures. This suite never runs against external email services.',
  );
  test('confirms signup, rejects another tenant’s private evidence, and recovers the password', async ({
    page,
    browser,
  }) => {
    const email = `signup-${randomUUID()}@example.test`;
    const secret = password();
    await signup(page, email, secret);
    await page.goto(await emailLink(email, 'signup'));
    await expect(page).toHaveURL(/\/app$/);
    const own = await (await page.request.get('/api/workspace')).json();
    expect(own.actor.role).toBe('client');
    expect(own.actor.clientId).not.toBe(tenant);
    const context = await browser.newContext({ baseURL });
    try {
      const original = await context.newPage();
      await login(original, clientEmail!, clientPassword!);
      const workspace = await (await original.request.get('/api/workspace')).json();
      const evidence = workspace.state.evidence.find((entry: { fileId?: string }) => entry.fileId);
      expect(
        evidence,
        'Run the console lifecycle test first to create private evidence.',
      ).toBeTruthy();
      expect((await original.request.get(`/api/attachments/${evidence.fileId}`)).status()).toBe(
        200,
      );
      expect((await page.request.get(`/api/attachments/${evidence.fileId}`)).status()).toBe(404);
      expect((await page.request.get(`/api/workspace?id=${evidence.missionId}`)).status()).toBe(
        200,
      );
      const inaccessible = await (
        await page.request.get(`/api/workspace?id=${evidence.missionId}`)
      ).json();
      expect(inaccessible.state.missions).toHaveLength(0);
    } finally {
      await context.close();
    }
    await page.goto('/forgot-password');
    await page.getByLabel('Adresse email professionnelle', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Envoyer le lien', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Consultez votre messagerie', exact: true }),
    ).toBeVisible();
    await page.goto(await emailLink(email, 'recovery'));
    await expect(page).toHaveURL(/\/reset-password$/);
    const replacement = password();
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(replacement);
    await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(replacement);
    await page.getByRole('button', { name: 'Enregistrer le mot de passe', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?notice=password-updated$/);
    await login(page, email, replacement);
    expect((await page.request.get('/api/workspace')).status()).toBe(200);
  });
  test('searches organizations, invites a confirmed identity and enforces its assigned customer access', async ({
    page,
    browser,
  }) => {
    await login(page, qualityEmail!, qualityPassword!);
    await page.goto('/app/team');
    const teams = await (await page.request.get('/api/team')).json();
    const organization = teams.clients.find((entry: { id: string }) => entry.id === tenant);
    expect(
      organization,
      'Dedicated client organization must appear in the local fixture directory.',
    ).toBeTruthy();
    await page.getByLabel('Rechercher une organisation', { exact: true }).fill(organization.name);
    await page.getByRole('button', { name: 'Chercher l’organisation', exact: true }).click();
    await page.getByLabel('Organisation', { exact: true }).selectOption(tenant!);
    const email = `invite-${randomUUID()}@example.test`;
    await page.getByLabel('Adresse email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Créer une invitation', exact: true }).click();
    const link = await page.getByLabel('Lien personnel — affiché une seule fois').inputValue();
    const context = await browser.newContext({ baseURL });
    try {
      const invitee = await context.newPage();
      await signup(invitee, email, password());
      await invitee.goto(await emailLink(email, 'signup'));
      // An email-confirmed invited Auth identity has no organization/profile until explicit redemption.
      expect((await invitee.request.get('/api/workspace')).status()).toBe(403);
      await invitee.goto(link);
      await invitee.getByLabel('Votre nom', { exact: true }).fill('Membre invité local');
      await invitee.getByRole('button', { name: 'Rejoindre l’espace', exact: true }).click();
      await expect(invitee).toHaveURL(/\/app$/);
      const joined = await (await invitee.request.get('/api/workspace')).json();
      expect(joined.actor.clientId).toBe(tenant);
      expect(joined.actor.role).toBe('client');
      expect((await invitee.request.get('/api/team')).status()).toBe(403);
      expect((await invitee.request.get('/api/billing')).status()).toBe(403);
      // Reusing the same token from a different confirmed identity must not grant access.
      const rejected = await page.request.post('/api/invitations/accept', {
        headers: { Origin: baseURL },
        data: { token: new URL(link).hash.slice(1), displayName: 'Wrong identity' },
      });
      expect(rejected.status()).toBe(400);
      await page.getByLabel('Rechercher', { exact: true }).fill(email);
      await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
      const member = page.locator('form').filter({ hasText: email });
      await member.getByLabel('Accès actif', { exact: true }).uncheck();
      await member.getByRole('button', { name: 'Enregistrer l’accès', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Accès mis à jour');
      expect((await invitee.request.get('/api/workspace')).status()).toBe(403);
    } finally {
      await context.close();
    }
  });
});
