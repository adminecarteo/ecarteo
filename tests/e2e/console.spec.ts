import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { WorkspaceResponse } from '../../src/lib/workspace-client';

// Supply dedicated, confirmed test accounts against a disposable Supabase project.
// The lifecycle test leaves an audit record; no fixtures or auth bypasses exist in the app.
const qualityEmail = process.env.E2E_QUALITY_EMAIL;
const qualityPassword = process.env.E2E_QUALITY_PASSWORD;
const clientEmail = process.env.E2E_CLIENT_EMAIL;
const clientPassword = process.env.E2E_CLIENT_PASSWORD;
const fixtureClientId = process.env.E2E_CLIENT_ID;

async function login(page: Page, email: string, password: string): Promise<WorkspaceResponse> {
  await page.goto('/login');
  await page.getByLabel('Adresse email professionnelle', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\?|$)/);
  const response = await page.request.get('/api/workspace');
  expect(response.status()).toBe(200);
  const workspace = (await response.json()) as WorkspaceResponse;
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  return workspace;
}

async function origin(page: Page) {
  return new URL(page.url()).origin;
}

test.describe('authenticated quality workspace', () => {
  test.skip(
    !qualityEmail || !qualityPassword,
    'Set E2E_QUALITY_EMAIL and E2E_QUALITY_PASSWORD for a dedicated confirmed quality account.',
  );

  test('uses the server identity and persists only display preferences', async ({ page }) => {
    const workspace = await login(page, qualityEmail!, qualityPassword!);
    expect(workspace.actor.role).toBe('qualite');
    await expect(page.getByRole('complementary')).toContainText(workspace.actor.name);
    await expect(page.getByRole('combobox', { name: /Aperçu du rôle|Role preview/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: /Réinitialiser la démo|Reset demo/ }),
    ).toHaveCount(0);
    await expect(page.getByText('Données d’exemple', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.getByRole('button', { name: 'Change theme', exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  });

  test('creates, executes and publishes a real audit with evidence and a PDF', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const workspace = await login(page, qualityEmail!, qualityPassword!);
    expect(workspace.actor.role).toBe('qualite');
    test.skip(
      !fixtureClientId || !workspace.operators.length,
      'Set E2E_CLIENT_ID for a dedicated test client and provision one active operator profile.',
    );
    const client = workspace.state.clients.find((item) => item.id === fixtureClientId);
    expect(
      client,
      'E2E_CLIENT_ID must identify an accessible dedicated test client.',
    ).toBeDefined();
    const operator = workspace.operators[0];
    const title = `Audit automatisé ${randomUUID().slice(0, 8)}`;
    await page.getByRole('link', { name: 'Scénarios', exact: true }).click();
    await page.getByRole('button', { name: 'Nouveau scénario', exact: true }).click();
    await page.getByRole('combobox', { name: 'Client', exact: true }).selectOption(client!.id);
    await page.getByRole('textbox', { name: 'Titre du parcours', exact: true }).fill(title);
    await page
      .getByRole('textbox', { name: 'Objectif', exact: true })
      .fill('Contrôler le parcours dans un environnement de recette.');
    await page.getByRole('checkbox', { name: 'Email', exact: true }).check();
    await page
      .getByRole('textbox', { name: 'Persona de test', exact: true })
      .fill('Personne fictive de recette.');
    await page
      .getByRole('textbox', { name: 'Action de l’opérateur 1', exact: true })
      .fill('Consigner une observation de recette sans contact externe.');
    await page
      .getByRole('textbox', { name: 'Seuil attendu 1', exact: true })
      .fill('Une observation et une preuve.');
    await page
      .getByRole('textbox', { name: 'Limites et exclusions', exact: true })
      .fill('Ne contacter aucun client réel.');
    await page.getByRole('button', { name: 'Enregistrer en brouillon', exact: true }).click();
    await page.getByRole('button', { name: 'Valider le scénario', exact: true }).click();
    await page.getByRole('combobox', { name: 'Opérateur', exact: true }).selectOption(operator.id);
    await page.getByLabel('Date d’exécution', { exact: true }).fill('2030-11-15');
    await page.getByRole('button', { name: 'Créer la mission', exact: true }).click();
    await page.getByRole('button', { name: /À faire$/ }).click();
    await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Démarrer la mission', exact: true }).click();
    const observation = 'Observation factuelle enregistrée par le test de recette.';
    await page
      .getByRole('textbox', {
        name: 'Observation factuelle (durée, réponse obtenue…) — 1',
        exact: true,
      })
      .fill(observation);
    await page.getByRole('button', { name: 'Étape 1 terminée', exact: true }).click();
    await page.getByRole('textbox', { name: 'Intitulé', exact: true }).fill('Preuve de recette');
    const evidenceBytes = Buffer.from('Preuve textuelle réservée à la recette automatisée.');
    await page
      .getByLabel('Fichier (capture d’écran, PDF…) · optionnel', { exact: true })
      .setInputFiles({ name: 'recette.txt', mimeType: 'text/plain', buffer: evidenceBytes });
    await page.getByRole('button', { name: 'Ajouter la preuve', exact: true }).click();
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Preuve de recette', exact: true }) });
    await expect(card).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Télécharger', exact: true }).click();
    const evidenceStream = await (await downloadPromise).createReadStream();
    expect(evidenceStream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of evidenceStream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(evidenceBytes);
    await page.reload();
    await expect(
      page.getByRole('textbox', {
        name: 'Observation factuelle (durée, réponse obtenue…) — 1',
        exact: true,
      }),
    ).toHaveValue(observation);
    await page.getByRole('button', { name: 'Soumettre à validation', exact: true }).click();
    await page.getByRole('button', { name: 'Noter cette mission', exact: true }).click();
    for (const criterion of [
      'Disponibilité',
      'Vitesse',
      'Compréhension',
      'Qualité commerciale',
      'Cohérence omnicanale',
      'Qualité linguistique',
      'Gestion sensible',
      'Relance et ownership',
    ]) {
      await page
        .getByRole('group', { name: `Note ${criterion}`, exact: true })
        .getByRole('button', { name: '3', exact: true })
        .click();
    }
    const availability = page.getByRole('group', { name: 'Note Disponibilité', exact: true });
    await availability.getByRole('button', { name: '1', exact: true }).click();
    const speed = page.getByRole('group', { name: 'Note Vitesse', exact: true });
    await speed.getByRole('button', { name: '2', exact: true }).click();
    const ownerLabel = 'Responsable côté client · Disponibilité';
    const deadlineLabel = 'Échéance · Disponibilité';
    await page.getByRole('textbox', { name: ownerLabel }).fill('Responsable accueil');
    await page.getByRole('combobox', { name: deadlineLabel }).selectOption('90');
    await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
    await expect(
      page.getByText('Notation et plan d’actions enregistrés', { exact: true }),
    ).toBeVisible();
    const freshTab = await page.context().newPage();
    try {
      await freshTab.goto(page.url());
      await expect(freshTab.getByRole('textbox', { name: ownerLabel })).toHaveValue(
        'Responsable accueil',
      );
      await expect(freshTab.getByRole('combobox', { name: deadlineLabel })).toHaveValue('90');
      const audit = new URL(page.url());
      const response = await freshTab.request.get(`/api/workspace${audit.search}`);
      expect(response.ok()).toBe(true);
      const saved = (await response.json()) as WorkspaceResponse;
      expect(
        saved.state.missions.find((m) => m.id === audit.searchParams.get('id'))?.scoringDraft
          ?.actions,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ critId: 'vitesse', include: true, owner: '', horizon: 30 }),
        ]),
      );
    } finally {
      await freshTab.close();
    }
    await availability.getByRole('button', { name: '3', exact: true }).click();
    await speed.getByRole('button', { name: '3', exact: true }).click();
    await page.getByRole('button', { name: 'Valider et générer le rapport', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(title);
    await expect(page.getByRole('dialog')).toContainText('75/100');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Publier le rapport', exact: true })
      .click();
    await expect(
      page
        .getByRole('group', { name: 'Note Disponibilité', exact: true })
        .getByRole('button', { name: '3', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Ouvrir le rapport', exact: true }).click();
    await expect(page.getByRole('main')).toContainText(`Le parcours « ${title} » obtient 75/100.`);
    const pdfPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
    const pdf = await pdfPromise;
    const stream = await pdf.createReadStream();
    expect(stream).not.toBeNull();
    const pdfChunks: Buffer[] = [];
    for await (const chunk of stream!) pdfChunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(pdfChunks);
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    await testInfo.attach('generated-report', { body: bytes, contentType: 'application/pdf' });
  });
});

test.describe('authenticated client workspace', () => {
  test.skip(
    !clientEmail || !clientPassword,
    'Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD for a dedicated confirmed client account.',
  );

  test('shows only assigned published data and rejects a quality command', async ({ page }) => {
    const workspace = await login(page, clientEmail!, clientPassword!);
    expect(workspace.actor.role).toBe('client');
    expect(workspace.actor.clientId).toBeTruthy();
    expect(workspace.state.clients.every((client) => client.id === workspace.actor.clientId)).toBe(
      true,
    );
    expect(
      workspace.state.missions.every(
        (mission) =>
          mission.status === 'done' &&
          mission.scenarioSnapshot.clientId === workspace.actor.clientId,
      ),
    ).toBe(true);
    await expect(page.getByRole('link', { name: 'Scénarios', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /Aperçu du rôle|Role preview/ })).toHaveCount(
      0,
    );
    if (!workspace.state.missions.length) {
      await expect(
        page.getByRole('heading', { name: 'Bienvenue dans votre espace Écartéo', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Découvrir les offres d’audit', exact: true }),
      ).toHaveAttribute('href', '/offres');
    }
    const denied = await page.request.post('/api/commands', {
      headers: { Origin: await origin(page) },
      data: {
        idempotencyKey: randomUUID(),
        command: {
          type: 'scenario.create',
          draft: {
            clientId: workspace.actor.clientId,
            title: 'Commande interdite de recette',
            family: 'info',
            objective: '',
            channels: ['email'],
            lang: 'FR',
            persona: '',
            steps: [{ label: 'Test', seuil: '' }],
            evidence: [],
            limits: '',
          },
        },
      },
    });
    expect(denied.status()).toBe(403);
  });

  test('signs out the current account and hides its workspace in another tab', async ({
    page,
    context,
  }) => {
    await login(page, clientEmail!, clientPassword!);
    const otherTab = await context.newPage();
    await otherTab.goto('/app');
    await expect(
      otherTab.getByRole('button', { name: 'Se déconnecter', exact: true }),
    ).toBeVisible();
    await otherTab.evaluate(() =>
      sessionStorage.setItem('ecarteo:evidence-draft:session-check', 'private-test-observation'),
    );
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      otherTab.getByRole('heading', { name: 'Votre session a expiré', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        otherTab.evaluate(() =>
          Object.keys(sessionStorage).filter((key) => key.startsWith('ecarteo:')),
        ),
      )
      .toEqual([]);
    const denied = await page.request.get('/api/workspace');
    expect(denied.status()).toBe(401);
  });
});
