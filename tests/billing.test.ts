import { afterEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
vi.mock('server-only', () => ({}));
import { billingConfig, stripeRedirect } from '@/server/billing-config';
import { billingActionSchema, verifyBillingWebhook } from '@/server/billing';
import { billingAmount } from '@/lib/billing-format';

afterEach(() => vi.unstubAllEnvs());
describe('billing input and provider boundary', () => {
  it('disables billing until both server credentials are configured', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect(billingConfig()).toBeNull();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_1234567890');
    expect(billingConfig()).toBeNull();
  });
  it('rejects duplicate configured plans and browser-selected customer, price or amount', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_1234567890');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_testsecret');
    vi.stubEnv(
      'STRIPE_BILLING_PLANS',
      JSON.stringify([
        { id: 'pilot', name: 'Pilot', priceId: 'price_one' },
        { id: 'pilot', name: 'Pilot duplicate', priceId: 'price_two' },
      ]),
    );
    expect(() => billingConfig()).toThrow();
    expect(
      billingActionSchema.safeParse({ action: 'checkout', plan: 'pilot', customer: 'cus_other' })
        .success,
    ).toBe(false);
    expect(
      billingActionSchema.safeParse({
        action: 'checkout',
        plan: 'pilot',
        amount: 1,
        priceId: 'price_other',
      }).success,
    ).toBe(false);
    expect(billingActionSchema.safeParse({ action: 'portal', clientId: 'other' }).success).toBe(
      false,
    );
  });
  it('restricts hosted redirects to their exact HTTPS Stripe origin', () => {
    expect(stripeRedirect('https://checkout.stripe.com/c/pay/cs_test', 'checkout')).toContain(
      'checkout.stripe.com',
    );
    for (const url of [
      'https://checkout.stripe.com.evil.example/a',
      'http://checkout.stripe.com/a',
      'https://evil.example/a',
      'https://user:password@checkout.stripe.com/a',
    ])
      expect(() => stripeRedirect(url, 'checkout')).toThrow();
  });
  it('verifies raw payloads, rejects altered bodies, expired signatures and mixed modes', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_1234567890');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_testsecret');
    vi.stubEnv('STRIPE_BILLING_PLANS', '[]');
    const stripe = new Stripe('sk_test_1234567890');
    const payload = JSON.stringify({
      id: 'evt_test',
      type: 'customer.subscription.updated',
      livemode: false,
      data: { object: { id: 'sub_test', customer: 'cus_test' } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_testsecret',
    });
    expect(verifyBillingWebhook(Buffer.from(payload), signature).id).toBe('evt_test');
    expect(() => verifyBillingWebhook(Buffer.from(`${payload} `), signature)).toThrow();
    expect(() => verifyBillingWebhook(Buffer.from(payload), null)).toThrow();
    const expired = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_testsecret',
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });
    expect(() => verifyBillingWebhook(Buffer.from(payload), expired)).toThrow();
    const live = payload.replace('"livemode":false', '"livemode":true');
    const liveSignature = stripe.webhooks.generateTestHeaderString({
      payload: live,
      secret: 'whsec_testsecret',
    });
    expect(() => verifyBillingWebhook(Buffer.from(live), liveSignature)).toThrow();
  });
  it('formats Stripe minor amounts for two, zero and three decimal currencies', () => {
    expect(billingAmount(1250, 'eur')).toContain('12,50');
    expect(billingAmount(1250, 'jpy')).toContain('1 250');
    expect(billingAmount(1250, 'bhd')).toContain('1,250');
    expect(billingAmount(125000, 'isk')).toContain('1 250');
  });
});
