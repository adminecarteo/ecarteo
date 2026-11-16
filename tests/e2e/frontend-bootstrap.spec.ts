import { expect, test } from '@playwright/test';
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
