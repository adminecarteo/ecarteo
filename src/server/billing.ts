import 'server-only';
import type Stripe from 'stripe';
import { z } from 'zod';
import type { Account } from './auth';
import type { BillingOverview } from '@/lib/billing-types';
import { database, type Transaction } from './database';
import { trustedAccess } from './accounts-requests';
import { siteOrigin } from './config';
import { AppError } from './http';
import {
  billingConfig,
  requireBillingConfig,
  stripeClient,
  stripeRedirect,
} from './billing-config';

const TERMINAL = new Set(['canceled', 'incomplete_expired']);
export const billingActionSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('checkout'), plan: z.string().regex(/^[a-z][a-z0-9-]{0,49}$/) })
    .strict(),
  z.object({ action: z.literal('portal') }).strict(),
  z.object({ action: z.literal('cancel-checkout') }).strict(),
]);
type Customer = {
  client_id: string;
  stripe_customer_id: string | null;
  livemode: boolean;
  deleted_at: Date | null;
  provisioning_started_at: Date;
};
type Checkout = {
  id: string;
  client_id: string;
  plan_key: string;
  price_id: string;
  stripe_session_id: string | null;
  checkout_url: string | null;
  status: string;
  created_at: Date;
  expires_at: Date | null;
};

async function owner(tx: Transaction, account: Account) {
  const profile = await trustedAccess(tx, account.user.id);
  if (profile.role !== 'client' || !profile.client_id || !profile.is_client_admin)
    throw new AppError(
      403,
      'BILLING_FORBIDDEN',
      'Seul un administrateur de votre organisation peut gérer la facturation.',
    );
  await tx`select pg_advisory_xact_lock(hashtextextended(${`billing:${profile.client_id}`}, 0))`;
  return profile.client_id;
}

function assertCustomer(customer: Customer, live: boolean) {
  if (customer.livemode !== live || customer.deleted_at)
    throw new AppError(
      409,
      'BILLING_ACCOUNT_REVIEW',
      'Votre compte de facturation nécessite une vérification par Écartéo.',
    );
}
function assertRetryWindow(started: Date) {
  // Stripe retains idempotency keys for at least 24 hours. Never retry an unknown
  // remote creation after that window: an operator must reconcile it first.
  if (Date.now() - new Date(started).getTime() > 23 * 60 * 60 * 1_000)
    throw new AppError(
      409,
      'BILLING_RECONCILIATION_REQUIRED',
      'Une demande précédente doit être vérifiée par Écartéo avant de continuer.',
    );
}
function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id;
}
function iso(value: unknown): string | null {
  return value == null ? null : new Date(value as string | number | Date).toISOString();
}

async function priceDetails(priceId: string) {
  const price = await stripeClient().prices.retrieve(priceId);
  if (
    !price.active ||
    price.type !== 'recurring' ||
    !price.recurring ||
    price.recurring.usage_type !== 'licensed' ||
    price.unit_amount == null ||
    price.billing_scheme !== 'per_unit' ||
    price.livemode !== requireBillingConfig().live
  )
    throw new AppError(
      503,
      'BILLING_PRICE_UNAVAILABLE',
      'Cette offre n’est pas disponible à la souscription. Contactez Écartéo.',
    );
  return {
    amount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring.interval,
    intervalCount: price.recurring.interval_count,
  };
}

export async function loadBilling(account: Account): Promise<BillingOverview> {
  const config = billingConfig();
  const state = await database().begin(async (tx) => {
    const clientId = await owner(tx, account);
    const [customer] = await tx<
      Customer[]
    >`select * from app_private.billing_customers where client_id=${clientId}`;
    if (customer && config) assertCustomer(customer, config.live);
    const subscriptions =
      await tx`select stripe_subscription_id,status,price_id,cancel_at_period_end,current_period_end
      from app_private.billing_subscriptions where client_id=${clientId} order by updated_at desc limit 25`;
    const pending =
      await tx`select id from app_private.billing_checkout_sessions where client_id=${clientId} and status in ('creating','open') limit 1`;
    return {
      hasCustomer: Boolean(customer?.stripe_customer_id),
      pendingCheckout: pending.length > 0,
      subscriptions: subscriptions.map((row) => ({
        id: String(row.stripe_subscription_id),
        status: String(row.status),
        plan: config?.plans.find((plan) => plan.priceId === row.price_id)?.name || '',
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        periodEnd: iso(row.current_period_end),
      })),
    };
  });
  const plans = config
    ? await Promise.all(
        config.plans.map(async (plan) => ({
          id: plan.id,
          name: plan.name,
          ...(await priceDetails(plan.priceId)),
        })),
      )
    : [];
  return { enabled: Boolean(config), canManage: true, plans, ...state };
}

async function ensureCustomer(account: Account): Promise<void> {
  const config = requireBillingConfig();
  // Commit the creation reservation BEFORE contacting Stripe. Network errors leave
  // a durable reservation so retries reuse the exact same idempotency key.
  await database().begin(async (tx) => {
    const clientId = await owner(tx, account);
    await tx`insert into app_private.billing_customers(client_id,livemode) values (${clientId},${config.live}) on conflict do nothing`;
  });
  await database().begin(async (tx) => {
    const clientId = await owner(tx, account);
    const [customer] = await tx<
      Customer[]
    >`select * from app_private.billing_customers where client_id=${clientId} for update`;
    assertCustomer(customer, config.live);
    if (customer.stripe_customer_id) return;
    assertRetryWindow(customer.provisioning_started_at);
    // Stable metadata-only payload avoids changed emails/names breaking retries.
    const remote = await stripeClient().customers.create(
      { metadata: { ecarteo_client_id: clientId } },
      { idempotencyKey: `ecarteo-customer-${clientId}` },
    );
    await tx`update app_private.billing_customers set stripe_customer_id=${remote.id} where client_id=${clientId}`;
  });
}

async function updateSubscription(
  tx: Transaction,
  clientId: string,
  subscription: Stripe.Subscription,
  customerId: string,
) {
  if (idOf(subscription.customer) !== customerId)
    throw new AppError(
      409,
      'BILLING_CUSTOMER_MISMATCH',
      'La synchronisation de facturation doit être vérifiée.',
    );
  const item = subscription.items.data[0];
  await tx`insert into app_private.billing_subscriptions
    (stripe_subscription_id,client_id,status,price_id,cancel_at_period_end,current_period_end)
    values (${subscription.id},${clientId},${subscription.status},${item?.price.id ?? null},${subscription.cancel_at_period_end},${item ? new Date(item.current_period_end * 1_000) : null})
    on conflict (stripe_subscription_id) do update set status=excluded.status,price_id=excluded.price_id,
      cancel_at_period_end=excluded.cancel_at_period_end,current_period_end=excluded.current_period_end,updated_at=now()
    where app_private.billing_subscriptions.client_id=excluded.client_id`;
}

async function assertNoSubscription(tx: Transaction, clientId: string, customerId: string) {
  // Fetch current provider state, not only the potentially delayed webhook mirror.
  const subscriptions = await stripeClient().subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  });
  if (subscriptions.has_more)
    throw new AppError(
      409,
      'BILLING_ACCOUNT_REVIEW',
      'Contactez Écartéo pour vérifier votre abonnement.',
    );
  for (const subscription of subscriptions.data)
    await updateSubscription(tx, clientId, subscription, customerId);
  if (subscriptions.data.some((subscription) => !TERMINAL.has(subscription.status)))
    throw new AppError(
      409,
      'SUBSCRIPTION_EXISTS',
      'Un abonnement existe déjà. Gérez-le dans le portail de facturation.',
    );
}

export async function createCheckout(account: Account, planId: string): Promise<{ url: string }> {
  const config = requireBillingConfig();
  const plan = config.plans.find((candidate) => candidate.id === planId);
  if (!plan) throw new AppError(400, 'BILLING_PLAN_INVALID', 'Sélectionnez une offre disponible.');
  // Reject non-administrators before even making a read-only Stripe request.
  await database().begin(async (tx) => {
    await owner(tx, account);
  });
  await priceDetails(plan.priceId);
  await ensureCustomer(account);
  await database().begin(async (tx) => {
    const clientId = await owner(tx, account);
    const [customer] = await tx<
      Customer[]
    >`select * from app_private.billing_customers where client_id=${clientId}`;
    assertCustomer(customer, config.live);
    await assertNoSubscription(tx, clientId, customer.stripe_customer_id!);
    const [pending] = await tx<
      Checkout[]
    >`select * from app_private.billing_checkout_sessions where client_id=${clientId} and status in ('creating','open') for update`;
    if (pending?.stripe_session_id) {
      const remote = await stripeClient().checkout.sessions.retrieve(pending.stripe_session_id);
      if (remote.status === 'complete')
        throw new AppError(
          409,
          'BILLING_CONFIRMATION_PENDING',
          'Votre souscription est en cours de confirmation. Actualisez dans quelques instants.',
        );
      if (remote.status === 'expired')
        await tx`update app_private.billing_checkout_sessions set status='expired' where id=${pending.id}`;
      else if (pending.plan_key !== planId || pending.price_id !== plan.priceId)
        throw new AppError(
          409,
          'CHECKOUT_ALREADY_OPEN',
          'Annulez la demande de paiement en cours avant de changer d’offre.',
        );
      else return;
    } else if (pending) {
      assertRetryWindow(pending.created_at);
      if (pending.plan_key !== planId || pending.price_id !== plan.priceId)
        throw new AppError(
          409,
          'CHECKOUT_ALREADY_OPEN',
          'Reprenez la demande de paiement précédente avant de changer d’offre.',
        );
      return;
    }
    await tx`insert into app_private.billing_checkout_sessions (client_id,plan_key,price_id,created_by)
      values (${clientId},${planId},${plan.priceId},${account.user.id})`;
  });
  return database().begin(async (tx) => {
    const clientId = await owner(tx, account);
    const [customer] = await tx<
      Customer[]
    >`select * from app_private.billing_customers where client_id=${clientId}`;
    assertCustomer(customer, config.live);
    const [pending] = await tx<
      Checkout[]
    >`select * from app_private.billing_checkout_sessions where client_id=${clientId} and status in ('creating','open') for update`;
    if (!pending || pending.plan_key !== planId)
      throw new AppError(409, 'CHECKOUT_CHANGED', 'La demande a changé. Actualisez la page.');
    if (pending.checkout_url) return { url: stripeRedirect(pending.checkout_url, 'checkout') };
    assertRetryWindow(pending.created_at);
    const origin = siteOrigin();
    const remote = await stripeClient().checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customer.stripe_customer_id!,
        client_reference_id: clientId,
        line_items: [{ price: pending.price_id, quantity: 1 }],
        success_url: `${origin}/app/billing?checkout=returned`,
        cancel_url: `${origin}/app/billing?checkout=canceled`,
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true },
        customer_update: { name: 'auto', address: 'auto' },
        metadata: { ecarteo_client_id: clientId, ecarteo_checkout_id: pending.id },
        subscription_data: { metadata: { ecarteo_client_id: clientId } },
      },
      { idempotencyKey: `ecarteo-checkout-${pending.id}` },
    );
    const url = stripeRedirect(remote.url, 'checkout');
    await tx`update app_private.billing_checkout_sessions set stripe_session_id=${remote.id},checkout_url=${url},status='open',expires_at=${new Date(remote.expires_at * 1_000)} where id=${pending.id}`;
    return { url };
  });
}

export async function createBillingPortal(account: Account): Promise<{ url: string }> {
  const config = requireBillingConfig();
  return database().begin(async (tx) => {
    const clientId = await owner(tx, account);
    const [customer] = await tx<
      Customer[]
    >`select * from app_private.billing_customers where client_id=${clientId}`;
    if (!customer?.stripe_customer_id)
      throw new AppError(
        409,
        'BILLING_CUSTOMER_MISSING',
        'Aucun compte de facturation n’est encore associé à votre organisation.',
      );
    assertCustomer(customer, config.live);
    const session = await stripeClient().billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${siteOrigin()}/app/billing`,
    });
    return { url: stripeRedirect(session.url, 'portal') };
  });
}

export async function cancelCheckout(account: Account): Promise<{ canceled: boolean }> {
  const config = requireBillingConfig();
  return database().begin(async (tx) => {
    const clientId = await owner(tx, account);
    const [customer] = await tx<
      Customer[]
    >`select * from app_private.billing_customers where client_id=${clientId}`;
    if (customer) assertCustomer(customer, config.live);
    const [pending] = await tx<
      Checkout[]
    >`select * from app_private.billing_checkout_sessions where client_id=${clientId} and status in ('creating','open') for update`;
    if (!pending) return { canceled: true };
    if (!pending.stripe_session_id)
      throw new AppError(
        409,
        'CHECKOUT_UNCERTAIN',
        'Reprenez d’abord votre demande précédente pour vérifier son état.',
      );
    const remote = await stripeClient().checkout.sessions.retrieve(pending.stripe_session_id);
    if (remote.status === 'complete')
      throw new AppError(
        409,
        'CHECKOUT_COMPLETED',
        'Le paiement est terminé. Gérez l’abonnement dans le portail de facturation.',
      );
    if (remote.status === 'open') await stripeClient().checkout.sessions.expire(remote.id);
    await tx`update app_private.billing_checkout_sessions set status='expired' where id=${pending.id}`;
    return { canceled: true };
  });
}

export function verifyBillingWebhook(payload: Uint8Array, signature: string | null): Stripe.Event {
  const config = requireBillingConfig();
  if (!signature) throw new AppError(400, 'WEBHOOK_SIGNATURE', 'Invalid webhook signature.');
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      Buffer.from(payload),
      signature,
      config.webhookSecret,
      300,
    );
  } catch {
    throw new AppError(400, 'WEBHOOK_SIGNATURE', 'Invalid webhook signature.');
  }
  if (event.livemode !== config.live)
    throw new AppError(400, 'WEBHOOK_MODE', 'Webhook mode does not match this environment.');
  return event;
}

const supportedEvents = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.deleted',
]);
export async function handleBillingWebhook(event: Stripe.Event): Promise<void> {
  if (!supportedEvents.has(event.type)) return;
  const object = event.data.object;
  if (!('id' in object) || typeof object.id !== 'string')
    throw new AppError(400, 'WEBHOOK_OBJECT', 'Missing billing object.');
  const customerId =
    event.type === 'customer.deleted'
      ? object.id
      : 'customer' in object
        ? idOf(object.customer as string | { id: string } | null)
        : undefined;
  if (!customerId) throw new AppError(400, 'WEBHOOK_CUSTOMER', 'Missing billing customer.');
  await database().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`billing-event:${event.id}`}, 0))`;
    if (
      (
        await tx`select 1 from app_private.billing_webhook_receipts where stripe_event_id=${event.id}`
      ).length
    )
      return;
    const [customer] = await tx<
      Customer[]
    >`select * from app_private.billing_customers where stripe_customer_id=${customerId}`;
    // Unrelated Stripe customers do not grant app access and need no mirror.
    // A freshly created Checkout event may race our DB commit; retrieve by the
    // server-created customer's metadata to distinguish that case and retry.
    if (!customer) {
      if (event.type !== 'customer.deleted') {
        const remote = await stripeClient().customers.retrieve(customerId);
        if (!remote.deleted && remote.metadata.ecarteo_client_id)
          throw new AppError(
            503,
            'BILLING_MAPPING_PENDING',
            'Billing mapping is not available yet.',
          );
      }
      return;
    }
    if (customer.livemode !== event.livemode)
      throw new AppError(400, 'WEBHOOK_MODE', 'Webhook mode mismatch.');
    await tx`select pg_advisory_xact_lock(hashtextextended(${`billing:${customer.client_id}`}, 0))`;
    if (event.type === 'customer.deleted') {
      await tx`update app_private.billing_customers set deleted_at=now() where client_id=${customer.client_id}`;
    } else if (event.type.startsWith('customer.subscription.')) {
      // Read current provider state while holding the tenant lock. Reordered
      // deliveries cannot overwrite a newer subscription with an old snapshot.
      const latest = await stripeClient().subscriptions.retrieve(object.id);
      await updateSubscription(tx, customer.client_id, latest, customerId);
    } else {
      const session = await stripeClient().checkout.sessions.retrieve(object.id);
      if (idOf(session.customer) !== customerId)
        throw new AppError(400, 'WEBHOOK_CUSTOMER', 'Customer mismatch.');
      const checkoutId = session.metadata?.ecarteo_checkout_id;
      if (checkoutId && z.uuid().safeParse(checkoutId).success) {
        const [reservation] = await tx<
          Checkout[]
        >`select * from app_private.billing_checkout_sessions where id=${checkoutId} and client_id=${customer.client_id}`;
        if (
          reservation &&
          (!reservation.stripe_session_id || reservation.stripe_session_id === session.id)
        ) {
          await tx`update app_private.billing_checkout_sessions set stripe_session_id=${session.id}, status=${session.status || 'open'}, expires_at=${new Date(session.expires_at * 1_000)} where id=${reservation.id}`;
          const subscriptionId = idOf(session.subscription);
          if (subscriptionId)
            await updateSubscription(
              tx,
              customer.client_id,
              await stripeClient().subscriptions.retrieve(subscriptionId),
              customerId,
            );
        }
      }
    }
    await tx`insert into app_private.billing_webhook_receipts(stripe_event_id,event_type) values (${event.id},${event.type})`;
  });
}
