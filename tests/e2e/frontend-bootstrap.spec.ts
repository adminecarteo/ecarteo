import { expect, test } from '@playwright/test';
import type { BillingOverview } from '../../src/lib/billing-types';

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
  await page.getByRole('button', { name: 'Français', exact: true }).click();
  await expect.poll(() => pending).toBeGreaterThan(0);
  await expect(page.getByRole('status')).toHaveText('Chargement de votre espace…');
  await expect(page.getByText('Private account A', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toHaveCount(0);
  release();
  await expect(page.getByText('Private account B', { exact: true })).toBeVisible();
  await expect(page.getByText('Private account A', { exact: true })).toHaveCount(0);
  phase = 'expired';
  await page.getByRole('button', { name: 'English', exact: true }).click();
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
  await page.getByRole('button', { name: 'Français', exact: true }).click();
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
