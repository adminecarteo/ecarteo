import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  requireUser: vi.fn(),
  begin: vi.fn(),
  issue: vi.fn(),
  claim: vi.fn(),
  read: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('@/server/auth', () => ({
  createAuthClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
  requireUser: mocks.requireUser,
}));
vi.mock('@/server/config', () => ({ siteOrigin: () => 'https://ecarteo.fr' }));
vi.mock('@/server/registration-analytics', () => ({
  beginRegistrationVerification: mocks.begin,
  issueRegistrationReceipt: mocks.issue,
  claimRegistrationReceipt: mocks.claim,
  readRegistrationReceipt: mocks.read,
  clearRegistrationReceipt: mocks.clear,
}));

import { GET } from '@/app/auth/confirm/route';
import { POST } from '@/app/api/analytics/registration/route';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  user_metadata: { audit_offer: 'flash' },
};
const verificationTime = '2026-11-27 14:00:00+00';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verifyOtp.mockResolvedValue({ data: { user }, error: null });
  mocks.requireUser.mockResolvedValue({ user });
  mocks.begin.mockResolvedValue(verificationTime);
  mocks.issue.mockResolvedValue(true);
  mocks.read.mockResolvedValue('opaque-http-only-receipt');
  mocks.claim.mockResolvedValue({ track: true, next: '/app/requests' });
});

describe('explicit signup confirmation handoff', () => {
  it('opens a clean receipt-bound document only after successful signup verification', async () => {
    const response = await GET(
      new Request('https://ecarteo.fr/auth/confirm?token_hash=private-token&type=signup'),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://ecarteo.fr/registration-complete');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(mocks.issue).toHaveBeenCalledWith(user.id, verificationTime, '/app/requests');
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.verifyOtp.mock.invocationCallOrder[0],
    );
    expect(mocks.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.issue.mock.invocationCallOrder[0],
    );
    expect(JSON.stringify([...response.headers])).not.toContain('private-token');
  });

  it.each(['recovery', 'email'])(
    'does not treat %s verification as a new registration',
    async (type) => {
      const response = await GET(
        new Request(`https://ecarteo.fr/auth/confirm?token_hash=fixture&type=${type}`),
      );
      expect(mocks.begin).not.toHaveBeenCalled();
      expect(mocks.issue).not.toHaveBeenCalled();
      expect(response.headers.get('Location')).toBe(
        type === 'recovery'
          ? 'https://ecarteo.fr/reset-password'
          : 'https://ecarteo.fr/app/requests',
      );
    },
  );

  it('does not mint a receipt for a failed or replayed verification link', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    const response = await GET(
      new Request('https://ecarteo.fr/auth/confirm?token_hash=used&type=signup'),
    );
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(response.headers.get('Location')).toBe('https://ecarteo.fr/login?notice=invalid-link');
  });

  it.each([false, 'unavailable'])(
    'preserves normal activated-account access if receipt creation returns %s',
    async (outcome) => {
      if (outcome === 'unavailable')
        mocks.issue.mockRejectedValue(new Error('optional database outage'));
      else mocks.issue.mockResolvedValue(false);
      const response = await GET(
        new Request('https://ecarteo.fr/auth/confirm?token_hash=valid&type=signup'),
      );
      expect(response.headers.get('Location')).toBe('https://ecarteo.fr/app/requests');
    },
  );

  it('continues email verification when the analytics clock cannot be obtained', async () => {
    mocks.begin.mockResolvedValue(null);
    mocks.issue.mockResolvedValue(false);
    const response = await GET(
      new Request('https://ecarteo.fr/auth/confirm?token_hash=valid&type=signup'),
    );
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(response.headers.get('Location')).toBe('https://ecarteo.fr/app/requests');
  });
});

const request = (body: unknown, origin = 'https://ecarteo.fr') =>
  new Request('https://ecarteo.fr/api/analytics/registration', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('registration analytics claim endpoint', () => {
  it('returns only dispatch permission and a safe next path, then clears the receipt', async () => {
    const consent = { version: 1, analytics: true, savedAt: 1, expiresAt: 2 };
    const response = await POST(request({ consent }));
    expect(await response.json()).toEqual({ track: true, next: '/app/requests' });
    expect(mocks.claim).toHaveBeenCalledWith(user.id, 'opaque-http-only-receipt', consent);
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('rejects cross-origin claims without consuming or clearing a receipt', async () => {
    const response = await POST(request({ consent: null }, 'https://foreign.example.test'));
    expect(response.status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it.each([{}, { unexpected: 'form contents' }, { text: 'x'.repeat(2_000) }])(
    'settles missing, malformed or oversized consent as refusal',
    async (body) => {
      mocks.claim.mockResolvedValue({ track: false, next: '/app' });
      const response = await POST(request(body));
      expect(mocks.claim).toHaveBeenCalledWith(user.id, 'opaque-http-only-receipt', null);
      expect(await response.json()).toEqual({ track: false, next: '/app' });
      expect(mocks.clear).toHaveBeenCalledOnce();
    },
  );

  it('direct entry without a receipt does not perform an auth or analytics claim', async () => {
    mocks.read.mockResolvedValue(undefined);
    const response = await POST(request({ consent: null }));
    expect(await response.json()).toEqual({ track: false, next: '/app' });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it.each(['auth', 'database'])(
    'optional %s failure never claims success or breaks registration access',
    async (stage) => {
      if (stage === 'auth') mocks.requireUser.mockRejectedValue(new Error('session unavailable'));
      else mocks.claim.mockRejectedValue(new Error('database unavailable'));
      const response = await POST(request({ consent: null }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ track: false, next: '/app' });
      expect(mocks.clear).toHaveBeenCalledOnce();
    },
  );
});
