import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), account: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: mocks.user, requireAccount: mocks.account }));
import { GET } from '@/app/api/session/route';
import { AppError } from '@/server/http';

const id = '7439c220-4f26-4f42-9434-373e053bb7ef';
const request = (query = '') =>
  new Request(`https://frontend.example.test/api/session${query}`, {
    headers: { 'Accept-Language': 'en' },
  });
describe('session bootstrap endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns only verified account fields and forbids caching', async () => {
    const profile = { id, display_name: 'Quality', role: 'qualite', client_id: null, active: true };
    mocks.account.mockResolvedValue({
      user: { id, email: 'quality@example.test', access_token: 'must-not-leak' },
      profile: { ...profile, private_internal_field: 'must-not-leak' },
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id, email: 'quality@example.test' }, profile });
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(mocks.account).toHaveBeenCalledOnce();
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it('supports confirmed invitation/recovery users without querying an application profile', async () => {
    mocks.user.mockResolvedValue({
      user: { id, email: 'invitee@example.test', user_metadata: { private: true } },
      client: { auth: { secret: 'must-not-leak' } },
    });
    const response = await GET(request('?mode=user'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id, email: 'invitee@example.test' } });
    expect(mocks.account).not.toHaveBeenCalled();
  });

  it.each(['?mode=admin', '?mode=user&mode=account', '?userId=someone-else'])(
    'rejects unsupported identity selectors: %s',
    async (query) => {
      expect((await GET(request(query))).status).toBe(400);
      expect(mocks.account).not.toHaveBeenCalled();
      expect(mocks.user).not.toHaveBeenCalled();
    },
  );

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'ACCOUNT_DISABLED'],
    [503, 'AUTH_SERVICE_UNAVAILABLE'],
  ])('preserves account authorization/outage status %s', async (status, code) => {
    mocks.account.mockRejectedValue(new AppError(status as number, code as string, 'Safe failure'));
    const response = await GET(request('?mode=account'));
    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('does not convert an unconfirmed identity into an authenticated bootstrap', async () => {
    mocks.user.mockRejectedValue(new AppError(403, 'EMAIL_NOT_CONFIRMED', 'Confirm your email'));
    const response = await GET(request('?mode=user'));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('EMAIL_NOT_CONFIRMED');
  });

  it('sanitizes unexpected provider failures', async () => {
    mocks.user.mockRejectedValue(new Error('provider-secret-or-connection-detail'));
    const response = await GET(request('?mode=user'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('provider-secret');
  });
});
