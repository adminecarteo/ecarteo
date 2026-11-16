import { expect, test } from '@playwright/test';
import { createSeedState } from '../../src/domain/seed';
import { scopedState } from '../../src/domain/commands';
import type { Actor } from '../../src/domain/types';
import type { WorkspaceSummary } from '../../src/lib/workspace-query';
import type { BillingOverview } from '../../src/lib/billing-types';
import type { RequestPage } from '../../src/lib/accounts-requests-schema';

test.skip(
  process.env.E2E_DEPLOYMENT_TARGET !== 'frontend',
  'Exercises the client bootstrap in a separate frontend deployment.',
);

function billing(plan: string): BillingOverview {
  return {
    enabled: true,
    canManage: true,
    hasCustomer: true,
    plans: [],
    subscriptions: [
      { id: plan, status: 'active', plan, cancelAtPeriodEnd: false, periodEnd: null },
    ],
    pendingCheckout: false,
  };
}

test('returning mobile clients can open a published report or start a new request from history', async ({
  page,
  context,
  baseURL,
}) => {
  const user = '7464a51a-e860-469e-b0d9-a8ba1bc587b2';
  const tenant = 'a7d93c94-212a-4ef1-9294-25a84da1bb37';
  const mission = '8fcfb6f0-f169-4b40-ab25-00ab24293b78';
  const result: RequestPage = {
    page: 1,
    pageSize: 25,
    total: 1,
    items: [
      {
        id: 'f56727d7-d781-49eb-8f85-3add9abe87f4',
        clientId: tenant,
        clientName: 'Fixture',
        title: 'Reservation enquiry',
        sector: 'hospitality',
        channels: ['form'],
        siteCount: 1,
        preferredDate: null,
        brief: 'Check reservation enquiry handling.',
        reviewNote: '',
        status: 'published',
        scenarioId: null,
        revision: 2,
        createdAt: '2026-11-01T09:00:00Z',
        publishedReports: [
          { missionId: mission, publishedAt: '2026-11-10T09:00:00Z', isRetest: false },
        ],
      },
    ],
  };
  await context.addCookies([{ name: 'ecarteo-locale', value: 'en', url: baseURL! }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/session*', (route) =>
    route.fulfill({
      json: {
        user: { id: user, email: 'client@example.test' },
        profile: {
          id: user,
          display_name: 'Client',
          role: 'client',
          client_id: tenant,
          active: true,
        },
      },
    }),
  );
  await page.route('**/api/audit-requests*', (route) => route.fulfill({ json: result }));
  await page.goto('/app/requests');
  await expect(page.getByRole('heading', { name: 'Your requests' })).toBeInViewport();
  await expect(page.getByRole('link', { name: /Open report/ })).toHaveAttribute(
    'href',
    '/app?view=rapport&id=' + mission,
  );
  const subject = page.getByLabel('Request subject');
  await expect(subject).toBeHidden();
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await expect(subject).toBeVisible();
  await subject.fill('Draft retained while viewing history');
  await page.getByRole('button', { name: 'Hide request form', exact: true }).click();
  await expect(subject).toBeHidden();
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await expect(subject).toHaveValue('Draft retained while viewing history');
});

test('locale reload hides old billing data while pending and remounts the new account state', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: 'ecarteo-locale', value: 'en', url: baseURL! }]);
  let phase: 'initial' | 'reload' | 'expired' = 'initial';
  let pending = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/billing', async (route) => {
    if (phase === 'initial') return route.fulfill({ json: billing('Private account A') });
    if (phase === 'expired')
      return route.fulfill({
        status: 401,
        json: { code: 'UNAUTHENTICATED', error: 'Session expired' },
      });
    pending += 1;
    await gate;
    await route.fulfill({ json: billing('Private account B') });
  });
  await page.goto('/app/billing');
  await expect(page.getByText('Private account A', { exact: true })).toBeVisible();
  phase = 'reload';
  await page.getByRole('button', { name: 'FR — Français', exact: true }).click();
  await expect.poll(() => pending).toBeGreaterThan(0);
  await expect(page.getByRole('status')).toHaveText('Chargement de votre espace…');
  await expect(page.getByText('Private account A', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toHaveCount(0);
  release();
  await expect(page.getByText('Private account B', { exact: true })).toBeVisible();
  await expect(page.getByText('Private account A', { exact: true })).toHaveCount(0);
  phase = 'expired';
  await page.getByRole('button', { name: 'EN — English', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fbilling/);
  await expect(page.getByText('Private account B', { exact: true })).toHaveCount(0);
});

test('a delayed bootstrap response cannot restore protected billing after a sign-out broadcast', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: 'ecarteo-locale', value: 'en', url: baseURL! }]);
  let reload = false;
  let pending = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/billing', async (route) => {
    if (!reload) return route.fulfill({ json: billing('Private account A') });
    pending += 1;
    await gate;
    // The boundary aborts the request when it unmounts the private subtree.
    await route.fulfill({ json: billing('Private account B') }).catch(() => undefined);
  });
  await page.goto('/app/billing');
  await expect(page.getByText('Private account A', { exact: true })).toBeVisible();
  reload = true;
  await page.getByRole('button', { name: 'FR — Français', exact: true }).click();
  await expect.poll(() => pending).toBeGreaterThan(0);
  await expect(page.getByText('Private account A', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const channel = new BroadcastChannel('ecarteo-workspace');
    channel.postMessage('signed-out');
    channel.close();
  });
  const expired = page.getByRole('heading', { name: 'Votre session a expiré', exact: true });
  await expect(expired).toBeVisible();
  release();
  await expect(expired).toBeVisible();
  await expect(page.getByText('Private account B', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toHaveCount(0);
});

for (const locale of ['en', 'fr'] as const) {
  test(`client dashboard shows actionable priorities and meaningful score history in ${locale}`, async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    const en = locale === 'en';
    await context.addCookies([{ name: 'ecarteo-locale', value: locale, url: baseURL! }]);
    await page.setViewportSize({ width: 390, height: 844 });
    const actor: Actor = { id: 'client-fixture', name: 'Client', role: 'client', clientId: 'c1' };
    const state = scopedState(createSeedState(), actor);
    const action = state.actions.find((item) => !item.done)!;
    const published = state.missions.filter((item) => item.reportSnapshot).slice(0, 2);
    const reports = published.map((mission, index) => ({
      missionId: mission.id,
      title: mission.scenarioSnapshot.title,
      publishedAt: `2026-11-01T1${index}:00:00Z`,
      score: mission.reportSnapshot!.score,
    }));
    const summary: WorkspaceSummary = {
      completed: 0,
      inProgress: 0,
      openActions: 0,
      urgentActions: 0,
      completedActions: 0,
      averageScore: null,
      averageHours: 0,
      months: [],
      criteria: {},
      clientDashboard: { reports: [], nextAction: null },
    };
    const overview = summary.clientDashboard!;
    await page.route('**/api/workspace*', (route) =>
      route.fulfill({
        json: {
          state: overview.reports.length
            ? state
            : { ...state, missions: [], actions: [], scenarios: [], evidence: [] },
          actor,
          operators: [],
          summary,
        },
      }),
    );
    await page.route('**/api/reports/*/addenda', (route) =>
      route.fulfill({ json: { addenda: [] } }),
    );
    await page.goto('/');
    const preview = page.getByRole('figure', {
      name: en ? /Booking an accessible room/ : /Réserver une chambre accessible/,
    });
    await expect(preview).toContainText(en ? 'three hours' : 'trois heures');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await page.goto('/app');
    await expect(
      page.getByRole('link', {
        name: en ? 'Go to audit requests' : 'Accéder aux demandes d’audit',
      }),
    ).toBeInViewport();
    await expect(page.getByText(en ? 'Average production time' : 'Production moyenne')).toHaveCount(
      0,
    );
    const chart = page.getByRole('img', {
      name: en ? 'Published audit scores' : 'Scores des audits publiés',
    });
    await expect(chart).toHaveCount(0);

    overview.reports = [reports[0]];
    summary.completed = 1;
    await page.reload();
    await expect(
      page.getByText(en ? /Your first audit scored/ : /Votre premier audit obtient/),
    ).toBeVisible();
    await expect(
      page.getByText(
        en ? 'You have no outstanding actions.' : 'Vous n’avez aucune action en attente.',
      ),
    ).toBeVisible();
    await expect(chart).toHaveCount(0);

    overview.reports = reports;
    overview.nextAction = action;
    summary.completed = 2;
    await page.reload();
    const reportLink = page.getByRole('link', { name: en ? 'Read report' : 'Lire le rapport' });
    const actionLink = page.getByRole('link', { name: en ? 'Open action' : 'Ouvrir l’action' });
    await expect(reportLink).toHaveAttribute(
      'href',
      '/app?view=rapport&id=' + reports[1].missionId,
    );
    await expect(reportLink).toBeInViewport();
    await expect(actionLink).toBeInViewport();
    await expect(chart).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath('client-dashboard-mobile-' + locale + '.png'),
    });
    await actionLink.click();
    await expect(
      page.getByRole('checkbox').and(page.locator('#action-' + action.id)),
    ).toBeFocused();
  });
}

test('staff retain their operational views on desktop', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'ecarteo-locale', value: 'en', url: baseURL! }]);
  let actor: Actor = { id: 'quality-fixture', name: 'Quality', role: 'qualite' };
  const state = createSeedState();
  await page.route('**/api/workspace*', (route) =>
    route.fulfill({ json: { state: scopedState(state, actor), actor, operators: [] } }),
  );
  await page.goto('/app');
  await expect(page.getByText('Average production time')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Latest published report' })).toHaveCount(0);
  actor = { id: 'operator-fixture', name: 'Operator', role: 'operateur' };
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Missions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Latest published report' })).toHaveCount(0);
});
