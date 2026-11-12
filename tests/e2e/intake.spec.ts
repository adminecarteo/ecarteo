import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
const qualityEmail = process.env.E2E_QUALITY_EMAIL;
const qualityPassword = process.env.E2E_QUALITY_PASSWORD;
const clientEmail = process.env.E2E_CLIENT_EMAIL;
const clientPassword = process.env.E2E_CLIENT_PASSWORD;
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse email professionnelle', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\?|$)/);
}
test.describe('authenticated audit intake and protocol preparation', () => {
  test.skip(
    !qualityEmail || !qualityPassword || !clientEmail || !clientPassword,
    'Dedicated confirmed client and quality credentials are required; no production authentication bypass is used.',
  );
  test('submits a customer request, reviews it as quality and edits the resulting draft', async ({
    page,
    browser,
  }) => {
    const title = `Recette demande ${randomUUID().slice(0, 8)}`;
    await login(page, clientEmail!, clientPassword!);
    await page.goto('/app/requests');
    await page.getByLabel('Objet de la demande', { exact: true }).fill(title);
    await page
      .getByLabel('Votre besoin', { exact: true })
      .fill(
        'Recette automatisée uniquement. Contrôler le formulaire interne sans contacter aucun tiers.',
      );
    await page.getByRole('button', { name: 'Envoyer la demande', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Votre demande a été enregistrée');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const qualityContext = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
      locale: 'fr-FR',
    });
    try {
      const qualityPage = await qualityContext.newPage();
      await login(qualityPage, qualityEmail!, qualityPassword!);
      await qualityPage.goto('/app/requests');
      await qualityPage.getByLabel('Rechercher', { exact: true }).fill(title);
      await qualityPage.getByRole('button', { name: 'Filtrer', exact: true }).click();
      await expect(qualityPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await qualityPage
        .getByLabel('Réponse au client', { exact: true })
        .fill('Périmètre de recette accepté. Aucun contact externe ne doit être effectué.');
      await qualityPage.getByRole('button', { name: 'Accepter le périmètre', exact: true }).click();
      await expect(
        qualityPage.locator('article').getByText('Acceptée', { exact: true }),
      ).toBeVisible();
      await qualityPage.getByRole('button', { name: 'Préparer un scénario', exact: true }).click();
      await qualityPage.getByRole('link', { name: 'Ouvrir le scénario', exact: true }).click();
      await expect(qualityPage).toHaveURL(/\/app\?view=scenarios&id=/);
      await qualityPage.getByRole('button', { name: 'Valider le scénario', exact: true }).click();
      await expect(qualityPage.locator('#scenario-detail-error')).toContainText(
        'Ajoutez au moins une étape',
      );
      await qualityPage.getByRole('button', { name: 'Modifier le brouillon', exact: true }).click();
      await qualityPage
        .getByRole('textbox', { name: 'Persona de test', exact: true })
        .fill('Identité fictive pour la recette locale.');
      await qualityPage
        .getByRole('textbox', { name: 'Action de l’opérateur 1', exact: true })
        .fill('Consigner une observation de recette sans contact externe.');
      await qualityPage
        .getByRole('textbox', { name: 'Seuil attendu 1', exact: true })
        .fill('Une observation horodatée.');
      await qualityPage
        .getByRole('textbox', { name: 'Limites et exclusions', exact: true })
        .fill('Aucun appel, message, paiement ou réservation réel.');
      await qualityPage
        .getByRole('button', { name: 'Enregistrer les modifications', exact: true })
        .click();
      await expect(
        qualityPage.getByRole('button', { name: 'Modifier le brouillon', exact: true }),
      ).toBeVisible();
      await qualityPage.reload();
      await expect(
        qualityPage.locator('.seuil').filter({ hasText: 'Une observation horodatée.' }),
      ).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(
        page
          .locator('article')
          .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
          .getByText('Scénario préparé', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ouvrir le scénario', exact: true })).toHaveCount(
        0,
      );
    } finally {
      await qualityContext.close();
    }
  });
});
