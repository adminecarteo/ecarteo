import 'server-only';
import Stripe from 'stripe';
import { z } from 'zod';
import { AppError } from './http';

const planSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,49}$/),
    name: z.string().trim().min(1).max(100),
    priceId: z.string().regex(/^price_[a-zA-Z0-9]+$/),
  })
  .strict();
const plansSchema = z
  .array(planSchema)
  .max(12)
  .refine(
    (plans) =>
      new Set(plans.map((plan) => plan.id)).size === plans.length &&
      new Set(plans.map((plan) => plan.priceId)).size === plans.length,
  );
export type BillingPlan = z.infer<typeof planSchema>;

export function billingConfig() {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !webhookSecret) return null;
  let plans: BillingPlan[];
  try {
    plans = plansSchema.parse(JSON.parse(process.env.STRIPE_BILLING_PLANS || '[]'));
    if (!/^(sk|rk)_(test|live)_[a-zA-Z0-9]+$/.test(key) || !webhookSecret.startsWith('whsec_'))
      throw new Error('Invalid configuration');
  } catch {
    throw new AppError(
      503,
      'BILLING_CONFIG_INVALID',
      'La facturation est temporairement indisponible.',
    );
  }
  return { key, webhookSecret, plans, live: /^(sk|rk)_live_/.test(key) };
}

export function requireBillingConfig() {
  const config = billingConfig();
  if (!config)
    throw new AppError(
      503,
      'BILLING_NOT_CONFIGURED',
      'La souscription en ligne n’est pas encore disponible. Vos audits sur devis restent accessibles.',
    );
  return config;
}

export function stripeClient() {
  const { key } = requireBillingConfig();
  // The installed SDK pins its matching stable API version. No preview API is used.
  return new Stripe(key, { timeout: 8_000, maxNetworkRetries: 0 });
}

export function stripeRedirect(value: string | null, kind: 'checkout' | 'portal'): string {
  const url = new URL(value || 'https://invalid.invalid');
  const host = kind === 'checkout' ? 'checkout.stripe.com' : 'billing.stripe.com';
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password)
    throw new AppError(
      503,
      'BILLING_REDIRECT_INVALID',
      'Le lien de paiement est indisponible. Réessayez.',
    );
  return url.href;
}
