import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  single: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  signOut: vi.fn(),
  setCookie: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: mocks.setCookie }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser, signOut: mocks.signOut },
    from: mocks.from,
  }),
}));
vi.mock('@/server/config', () => ({
  authConfigured: () => true,
  authConfig: () => ({ url: 'http://127.0.0.1:55321', key: 'public-test-key' }),
}));

import { requireAccount, requireUser } from '@/server/auth';
import { apiError } from '@/server/http';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'fixture@example.test',
  email_confirmed_at: '2026-11-09T10:00:00Z',
  is_anonymous: false,
};
const profile = {
  id: user.id,
  display_name: 'Confirmed fixture',
  role: 'client',
  client_id: '22222222-2222-4222-8222-222222222222',
  active: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: profile, error: null, status: 200 });
});

describe('trusted authentication provider boundary', () => {
  it.each([
    new AuthRetryableFetchError('private connection details', 0),
    new AuthApiError('private provider response', 503, 'unexpected_failure'),
    { name: 'AuthRetryableFetchError', status: 408 },
    { name: 'AuthUnknownError' },
  ])('keeps provider outages distinct from expired sessions (%j)', async (error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    await expect(requireUser()).rejects.toMatchObject({
      status: 503,
      code: 'AUTH_SERVICE_UNAVAILABLE',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it.each([new AuthSessionMissingError(), new AuthApiError('Invalid token', 401, 'bad_jwt'), null])(
    'still rejects missing or invalid identities as unauthenticated (%j)',
    async (error) => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error });
      await expect(requireUser()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...user, email_confirmed_at: null },
    { ...user, is_anonymous: true },
  ])('continues denying unconfirmed or anonymous identities', async (identity) => {
    mocks.getUser.mockResolvedValue({ data: { user: identity }, error: null });
    await expect(requireUser()).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_CONFIRMED' });
  });

  it.each([0, 503])(
    'does not classify profile service failure %i as revoked account access',
    async (status) => {
      mocks.single.mockResolvedValue({
        data: null,
        error: { message: 'private provider details', code: '' },
        status,
      });
      const error = await requireAccount().catch((failure: unknown) => failure);
      expect(error).toMatchObject({ status: 503, code: 'AUTH_SERVICE_UNAVAILABLE' });
      const response = apiError(
        error,
        new Request('http://127.0.0.1/api/workspace', { headers: { 'Accept-Language': 'en' } }),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
      expect(await response.json()).toEqual({
        code: 'AUTH_SERVICE_UNAVAILABLE',
        error: 'Access verification is temporarily unavailable. Please try again in a moment.',
      });
      expect(mocks.signOut).not.toHaveBeenCalled();
    },
  );

  it('preserves missing-profile and disabled-profile denials', async () => {
    mocks.single.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
      status: 406,
    });
    await expect(requireAccount()).rejects.toMatchObject({
      status: 403,
      code: 'ACCOUNT_UNAVAILABLE',
    });
    mocks.single.mockResolvedValueOnce({
      data: { ...profile, active: false },
      error: null,
      status: 200,
    });
    await expect(requireAccount()).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_DISABLED' });
    mocks.single.mockResolvedValueOnce({
      data: { ...profile, role: 'untrusted' },
      error: null,
      status: 200,
    });
    await expect(requireAccount()).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_DISABLED' });
  });

  it('returns only a verified active profile queried for the authenticated user', async () => {
    await expect(requireAccount()).resolves.toEqual({
      user: { id: user.id, email: user.email },
      profile,
    });
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.eq).toHaveBeenCalledWith('id', user.id);
  });
});
