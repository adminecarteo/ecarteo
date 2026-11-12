import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { Account } from '@/server/auth';
vi.mock('server-only', () => ({}));
const provider = vi.hoisted(() => ({
  customerCreate: vi.fn(),
  customerRetrieve: vi.fn(),
  price: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutRetrieve: vi.fn(),
  checkoutExpire: vi.fn(),
  subscriptionList: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  portalCreate: vi.fn(),
}));
vi.mock('@/server/billing-config', async (original) => ({
  ...(await original<typeof import('@/server/billing-config')>()),
  stripeClient: () => ({
    customers: { create: provider.customerCreate, retrieve: provider.customerRetrieve },
    prices: { retrieve: provider.price },
    checkout: {
      sessions: {
        create: provider.checkoutCreate,
        retrieve: provider.checkoutRetrieve,
        expire: provider.checkoutExpire,
      },
    },
    subscriptions: { list: provider.subscriptionList, retrieve: provider.subscriptionRetrieve },
    billingPortal: { sessions: { create: provider.portalCreate } },
  }),
}));
import {
  createCheckout,
  createBillingPortal,
  cancelCheckout,
  loadBilling,
  handleBillingWebhook,
} from '@/server/billing';
import { closeWorkspaceDatabase } from '@/server/database';

const testUrl = process.env.ECARTEO_TEST_DATABASE_URL;
describe.skipIf(!testUrl)('billing transactions with real PostgreSQL and a provider double', () => {
  const sql = postgres(testUrl || 'postgres://localhost/unused', { max: 2 });
  const remoteSessions = new Map<string, Record<string, unknown>>();
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', testUrl!);
    vi.stubEnv('APP_URL', 'http://127.0.0.1:3000');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_1234567890');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_testsecret');
    vi.stubEnv(
      'STRIPE_BILLING_PLANS',
      JSON.stringify([
        { id: 'pilot', name: 'Pilot fixture', priceId: 'price_pilot' },
        { id: 'annual', name: 'Annual fixture', priceId: 'price_annual' },
      ]),
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    provider.price.mockImplementation(async (id: string) => ({
      id,
      active: true,
      livemode: false,
      type: 'recurring',
      recurring: { usage_type: 'licensed', interval: 'month', interval_count: 1 },
      unit_amount: 1000,
      currency: 'eur',
      billing_scheme: 'per_unit',
    }));
    provider.customerCreate.mockImplementation(async (input) => ({
      id: `cus_${input.metadata.ecarteo_client_id.replaceAll('-', '')}`,
    }));
    provider.checkoutCreate.mockImplementation(async (input) => {
      const id = `cs_${randomUUID().replaceAll('-', '')}`;
      const session = {
        ...input,
        id,
        status: 'open',
        url: `https://checkout.stripe.com/c/pay/${id}`,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
      };
      remoteSessions.set(id, session);
      return session;
    });
    provider.checkoutRetrieve.mockImplementation(async (id) => remoteSessions.get(id));
    provider.checkoutExpire.mockImplementation(async (id) => {
      const session = remoteSessions.get(id)!;
      session.status = 'expired';
      return session;
    });
    provider.subscriptionList.mockResolvedValue({ data: [], has_more: false });
    provider.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/test' });
  });
  afterAll(async () => {
    await closeWorkspaceDatabase();
    await sql.end();
    vi.unstubAllEnvs();
  });
  async function customer(): Promise<Account> {
    const id = randomUUID();
    await sql`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values (${id},${`${id}@billing.example.test`},now(),'{}')`;
    const [profile] = await sql`select * from public.profiles where id=${id}`;
    return { user: { id }, profile: profile as Account['profile'] };
  }
  it('rejects forged billing ownership and disabled profiles before provider requests', async () => {
    const account = await customer();
    await sql`update public.profiles set is_client_admin=false where id=${account.user.id}`;
    await expect(createCheckout(account, 'pilot')).rejects.toMatchObject({ status: 403 });
    expect(provider.customerCreate).not.toHaveBeenCalled();
    expect(provider.price).not.toHaveBeenCalled();
    await sql`update public.profiles set active=false,is_client_admin=true where id=${account.user.id}`;
    await expect(loadBilling(account)).rejects.toMatchObject({ status: 403 });
  });
  it('serializes concurrent checkouts, reuses one session and isolates the portal customer', async () => {
    const a = await customer();
    const b = await customer();
    const [first, retry] = await Promise.all([
      createCheckout(a, 'pilot'),
      createCheckout(a, 'pilot'),
    ]);
    expect(first.url).toBe(retry.url);
    expect(provider.customerCreate).toHaveBeenCalledTimes(1);
    expect(provider.checkoutCreate).toHaveBeenCalledTimes(1);
    await expect(createBillingPortal(b)).rejects.toMatchObject({
      code: 'BILLING_CUSTOMER_MISSING',
    });
    await createBillingPortal(a);
    expect(provider.portalCreate.mock.calls[0][0].customer).toBe(
      `cus_${a.profile.client_id!.replaceAll('-', '')}`,
    );
    await expect(createCheckout(a, 'annual')).rejects.toMatchObject({
      code: 'CHECKOUT_ALREADY_OPEN',
    });
    await cancelCheckout(a);
    expect((await loadBilling(a)).pendingCheckout).toBe(false);
  });
  it('keeps a creation reservation across a network failure and retries the same provider key', async () => {
    const account = await customer();
    provider.checkoutCreate.mockRejectedValueOnce(new Error('network response lost'));
    await expect(createCheckout(account, 'pilot')).rejects.toThrow('network response lost');
    const firstKey = provider.checkoutCreate.mock.calls[0][1].idempotencyKey;
    await createCheckout(account, 'pilot');
    expect(provider.checkoutCreate.mock.calls[1][1].idempotencyKey).toBe(firstKey);
    expect(provider.customerCreate).toHaveBeenCalledTimes(1);
  });
  it('refuses uncertain operations after the provider idempotency window', async () => {
    const account = await customer();
    provider.customerCreate.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(createCheckout(account, 'pilot')).rejects.toThrow();
    await sql`update app_private.billing_customers set provisioning_started_at=now()-interval '2 days' where client_id=${account.profile.client_id}`;
    await expect(createCheckout(account, 'pilot')).rejects.toMatchObject({
      code: 'BILLING_RECONCILIATION_REQUIRED',
    });
    expect(provider.customerCreate).toHaveBeenCalledTimes(1);
  });
  it('deduplicates concurrent webhook deliveries and fetches current state for old events', async () => {
    const account = await customer();
    await createCheckout(account, 'pilot');
    const customerId = `cus_${account.profile.client_id!.replaceAll('-', '')}`;
    const subscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
    provider.subscriptionRetrieve.mockResolvedValue({
      id: subscriptionId,
      customer: customerId,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: 'price_pilot' },
            current_period_end: Math.floor(Date.now() / 1000) + 86400,
          },
        ],
      },
    });
    const event = {
      id: `evt_${randomUUID()}`,
      type: 'customer.subscription.updated',
      livemode: false,
      data: { object: { id: subscriptionId, customer: customerId, status: 'past_due' } },
    } as Stripe.Event;
    await Promise.all([handleBillingWebhook(event), handleBillingWebhook(event)]);
    expect(provider.subscriptionRetrieve).toHaveBeenCalledTimes(1);
    expect((await loadBilling(account)).subscriptions[0].status).toBe('active');
    const [receipt] =
      await sql`select count(*) as n from app_private.billing_webhook_receipts where stripe_event_id=${event.id}`;
    expect(Number(receipt.n)).toBe(1);
    provider.subscriptionRetrieve.mockResolvedValueOnce({
      id: subscriptionId,
      customer: customerId,
      status: 'canceled',
      cancel_at_period_end: false,
      items: { data: [] },
    });
    await handleBillingWebhook({ ...event, id: `evt_${randomUUID()}` });
    expect((await loadBilling(account)).subscriptions[0].status).toBe('canceled');
  });
  it('does not create another subscription when provider state is newer than local webhooks', async () => {
    const account = await customer();
    await createCheckout(account, 'pilot');
    provider.subscriptionList.mockResolvedValueOnce({
      has_more: false,
      data: [
        {
          id: `sub_${randomUUID()}`,
          customer: `cus_${account.profile.client_id!.replaceAll('-', '')}`,
          status: 'past_due',
          cancel_at_period_end: false,
          items: { data: [] },
        },
      ],
    });
    await expect(createCheckout(account, 'pilot')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_EXISTS',
    });
    expect(provider.checkoutCreate).toHaveBeenCalledTimes(1);
  });
  it('denies direct authenticated database reads of private billing tables', async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select * from app_private.billing_customers`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
