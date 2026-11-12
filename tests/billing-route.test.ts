import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  load: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
  cancel: vi.fn(),
  verify: vi.fn(),
  webhook: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireAccount: mocks.account }));
vi.mock('@/server/billing', async (original) => ({
  ...(await original<typeof import('@/server/billing')>()),
  loadBilling: mocks.load,
  createCheckout: mocks.checkout,
  createBillingPortal: mocks.portal,
  cancelCheckout: mocks.cancel,
  verifyBillingWebhook: mocks.verify,
  handleBillingWebhook: mocks.webhook,
}));
import { AppError } from '@/server/http';
import { GET, POST } from '@/app/api/billing/route';
import { POST as webhookPOST } from '@/app/api/billing/webhook/route';
function request(body: unknown, origin = 'http://127.0.0.1:3000') {
  return new Request('http://127.0.0.1:3000/api/billing', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
describe('billing HTTP boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_URL = 'http://127.0.0.1:3000';
    mocks.account.mockResolvedValue({ user: { id: 'verified-user' } });
  });
  it('rejects cross-origin requests before authentication or provider calls', async () => {
    const result = await POST(
      request({ action: 'checkout', plan: 'pilot' }, 'https://evil.example'),
    );
    expect(result.status).toBe(403);
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it('refuses injected tenant and price selections', async () => {
    const result = await POST(
      request({ action: 'checkout', plan: 'pilot', clientId: 'other', priceId: 'price_other' }),
    );
    expect(result.status).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it('uses the verified account and forbids shared caching', async () => {
    mocks.checkout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
    const result = await POST(request({ action: 'checkout', plan: 'pilot' }));
    expect(mocks.checkout).toHaveBeenCalledWith({ user: { id: 'verified-user' } }, 'pilot');
    expect(result.headers.get('cache-control')).toContain('private, no-store');
    mocks.account.mockRejectedValue(new AppError(401, 'UNAUTHENTICATED', 'Sign in'));
    expect((await GET(new Request('http://127.0.0.1:3000/api/billing'))).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('passes exact raw webhook bytes to verification without requiring browser authentication', async () => {
    const body = '{ "id": "evt_example", "data": {"value":1} }\n';
    const event = { id: 'evt_example' };
    mocks.verify.mockReturnValue(event);
    const result = await webhookPOST(
      new Request('http://127.0.0.1:3000/api/billing/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 't=123,v1=signature' },
        body,
      }),
    );
    expect(result.status).toBe(200);
    expect(Buffer.from(mocks.verify.mock.calls[0][0]).toString()).toBe(body);
    expect(mocks.verify.mock.calls[0][1]).toBe('t=123,v1=signature');
    expect(mocks.webhook).toHaveBeenCalledWith(event);
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it('rejects invalid signatures and oversized webhooks without processing them', async () => {
    mocks.verify.mockImplementation(() => {
      throw new AppError(400, 'WEBHOOK_SIGNATURE', 'Invalid webhook signature.');
    });
    expect(
      (
        await webhookPOST(
          new Request('http://127.0.0.1:3000/api/billing/webhook', { method: 'POST', body: '{}' }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.webhook).not.toHaveBeenCalled();
    mocks.verify.mockClear();
    expect(
      (
        await webhookPOST(
          new Request('http://127.0.0.1:3000/api/billing/webhook', {
            method: 'POST',
            headers: { 'content-length': '1048577' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(413);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('returns a retryable failure when webhook processing has not committed', async () => {
    mocks.verify.mockReturnValue({ id: 'evt_example' });
    mocks.webhook.mockRejectedValue(
      new AppError(503, 'BILLING_MAPPING_PENDING', 'Mapping pending.'),
    );
    const result = await webhookPOST(
      new Request('http://127.0.0.1:3000/api/billing/webhook', { method: 'POST', body: '{}' }),
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ code: 'BILLING_MAPPING_PENDING' });
  });
});
