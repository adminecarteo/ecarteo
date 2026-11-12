import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { authText, translateAuthFeedback } from '@/lib/auth-copy';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  forgot: vi.fn(),
  resend: vi.fn(),
  update: vi.fn(),
  signOut: vi.fn(),
  requireUser: vi.fn(),
  client: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/server/auth', () => ({
  createAuthClient: mocks.client,
  requireUser: mocks.requireUser,
}));
vi.mock('@/server/auth-rate-limit', () => ({ consumeAuthAttempt: mocks.limit }));
import { POST } from '@/app/api/auth/route';
const request = (body: unknown, origin = 'http://127.0.0.1:3000', language = 'fr') =>
  new Request('http://127.0.0.1:3000/api/auth', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'accept-language': language },
    body: JSON.stringify(body),
  });
describe('authentication endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_URL = 'http://127.0.0.1:3000';
    mocks.client.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signIn,
        signUp: mocks.signUp,
        resetPasswordForEmail: mocks.forgot,
        resend: mocks.resend,
        updateUser: mocks.update,
        signOut: mocks.signOut,
      },
    });
    mocks.limit.mockResolvedValue(true);
    mocks.signOut.mockResolvedValue({ error: null });
  });
  it('rejects cross-site login before contacting the provider', async () => {
    expect(
      (
        await POST(
          request(
            { action: 'login', email: 'test@example.com', password: 'password' },
            'https://evil.test',
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('uses generic credential errors without reflecting provider details', async () => {
    mocks.signIn.mockResolvedValue({
      error: { status: 400, message: 'user secret@example.com missing' },
    });
    const response = await POST(
      request({ action: 'login', email: 'test@example.com', password: 'password' }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('secret@example.com');
  });
  const authInputs = {
    login: { action: 'login', email: 'test@example.com', password: 'password' },
    signup: {
      action: 'signup',
      name: 'Camille Martin',
      company: 'Test Company',
      email: 'test@example.com',
      password: 'a-passphrase-1234',
      confirmPassword: 'a-passphrase-1234',
    },
    forgot: { action: 'forgot', email: 'test@example.com' },
    resend: { action: 'resend', email: 'test@example.com' },
  };
  const providerMethods = {
    login: mocks.signIn,
    signup: mocks.signUp,
    forgot: mocks.forgot,
    resend: mocks.resend,
  };
  it.each(['login', 'signup', 'forgot', 'resend'] as const)(
    'returns localized 503 for %s provider outages without reporting success or exposing details',
    async (action) => {
      for (const language of ['fr', 'en'] as const) {
        for (const error of [
          new AuthRetryableFetchError('secret provider endpoint', 0),
          { status: 503, message: 'secret provider endpoint' },
          { status: 0, message: 'secret provider endpoint' },
          { message: 'secret provider endpoint' },
        ]) {
          providerMethods[action].mockResolvedValue({ data: null, error });
          const response = await POST(request(authInputs[action], undefined, language));
          expect(response.status).toBe(503);
          expect(await response.json()).toEqual({
            error: authText(
              action === 'forgot' || action === 'resend'
                ? 'deliveryUnavailable'
                : 'authUnavailable',
              language,
            ),
          });
        }
      }
    },
  );
  it.each(['login', 'signup', 'forgot', 'resend'] as const)(
    'preserves provider rate limiting for %s',
    async (action) => {
      providerMethods[action].mockResolvedValue({
        error: { status: 429, message: 'private limit' },
      });
      const response = await POST(request(authInputs[action], undefined, 'en'));
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBeTruthy();
      expect(body.message).toBeUndefined();
      expect(body.redirect).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('private limit');
    },
  );
  it.each(['forgot', 'resend'] as const)(
    'keeps %s account-existence failures indistinguishable from successful delivery requests',
    async (action) => {
      providerMethods[action].mockResolvedValueOnce({ error: null });
      const success = await POST(request(authInputs[action], undefined, 'en'));
      providerMethods[action].mockResolvedValueOnce({
        error: { status: 400, message: 'secret@example.com does not exist' },
      });
      const absent = await POST(request(authInputs[action], undefined, 'en'));
      expect(success.status).toBe(200);
      expect(absent.status).toBe(200);
      expect(await absent.json()).toEqual(await success.json());
    },
  );
  it('reports an uncertain password update without claiming success, rejection or revoking sessions', async () => {
    mocks.requireUser.mockResolvedValue({ user: { id: 'user' } });
    const body = {
      action: 'reset',
      password: 'new-passphrase-1234',
      confirmPassword: 'new-passphrase-1234',
    };
    for (const language of ['fr', 'en'] as const) {
      for (const error of [new AuthRetryableFetchError('private failure', 0), { status: 503 }]) {
        mocks.update.mockResolvedValue({ error });
        const response = await POST(request(body, undefined, language));
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: authText('resetUnconfirmed', language) });
      }
    }
    mocks.update.mockRejectedValue(new TypeError('private network failure'));
    const thrown = await POST(request(body, undefined, 'en'));
    expect(thrown.status).toBe(503);
    expect(await thrown.json()).toEqual({ error: authText('resetUnconfirmed', 'en') });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(translateAuthFeedback(authText('resetUnconfirmed', 'en'), 'fr')).toBe(
      authText('resetUnconfirmed', 'fr'),
    );
  });
  it('keeps a definite rejected password update distinct from an uncertain outcome', async () => {
    mocks.requireUser.mockResolvedValue({ user: { id: 'user' } });
    mocks.update.mockResolvedValue({
      error: { status: 422, message: 'private validation detail' },
    });
    const response = await POST(
      request(
        {
          action: 'reset',
          password: 'new-passphrase-1234',
          confirmPassword: 'new-passphrase-1234',
        },
        undefined,
        'en',
      ),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: authText('resetFailed', 'en') });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it('returns English validation and enumeration-safe authentication feedback when requested', async () => {
    const invalid = await POST(
      request({ action: 'login', email: 'invalid', password: '' }, undefined, 'en'),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: 'Check the highlighted fields.',
      fieldErrors: { email: 'Enter a valid email address.', password: 'Enter your password.' },
    });
    expect(mocks.client).not.toHaveBeenCalled();
    mocks.signIn.mockResolvedValue({
      error: { status: 400, message: 'secret provider information' },
    });
    const failed = await POST(
      request(
        { action: 'login', email: 'test@example.com', password: 'password' },
        undefined,
        'en',
      ),
    );
    expect(await failed.json()).toEqual({
      error: 'Unable to sign in. Check your credentials and confirm your email address.',
    });
    mocks.forgot.mockResolvedValue({ error: null });
    const recovery = await POST(
      request({ action: 'forgot', email: 'test@example.com' }, undefined, 'en'),
    );
    expect(await recovery.json()).toEqual({
      message:
        'If an account matches this address, a reset link has been sent. Check your spam folder too.',
    });
  });
  it('localizes partial password reset success while preserving the retry flag', async () => {
    mocks.requireUser.mockResolvedValue({ user: { id: 'user' } });
    mocks.update.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: { message: 'provider failure' } });
    const response = await POST(
      request(
        {
          action: 'reset',
          password: 'new-passphrase-1234',
          confirmPassword: 'new-passphrase-1234',
        },
        undefined,
        'en',
      ),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      passwordUpdated: true,
      error:
        'Your password was changed, but signing out your sessions failed. Try signing out again below.',
    });
  });
  it('enforces the shared rate limit before provider authentication', async () => {
    mocks.limit.mockResolvedValue(false);
    expect(
      (await POST(request({ action: 'login', email: 'test@example.com', password: 'password' })))
        .status,
    ).toBe(429);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('does not accept a malicious post-login destination', async () => {
    mocks.signIn.mockResolvedValue({ error: null });
    const response = await POST(
      request({
        action: 'login',
        email: 'test@example.com',
        password: 'password',
        next: 'https://evil.test',
      }),
    );
    expect(await response.json()).toEqual({ redirect: '/app' });
  });
  it('passes only display metadata and leaves signup pending confirmation', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: { id: 'user' } }, error: null });
    const response = await POST(
      request({
        action: 'signup',
        name: 'Camille Martin',
        company: 'Test Company',
        email: 'test@example.com',
        password: 'a-passphrase-1234',
        confirmPassword: 'a-passphrase-1234',
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).redirect).toBeUndefined();
    expect(mocks.signUp.mock.calls[0][0].options.data).toEqual({
      display_name: 'Camille Martin',
      company_name: 'Test Company',
    });
  });
  it('verifies a live session before password updates and revokes sessions afterward', async () => {
    mocks.requireUser.mockResolvedValue({ user: { id: 'user' } });
    mocks.update.mockResolvedValue({ error: null });
    const response = await POST(
      request({
        action: 'reset',
        password: 'new-passphrase-1234',
        confirmPassword: 'new-passphrase-1234',
      }),
    );
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(await response.json()).toEqual({ redirect: '/login?notice=password-updated' });
  });
  it('reports a changed password separately from failed revocation and permits a revocation-only retry', async () => {
    mocks.requireUser.mockResolvedValue({ user: { id: 'user' } });
    mocks.update.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValueOnce({ error: { message: 'network failure' } });
    const first = await POST(
      request({
        action: 'reset',
        password: 'new-passphrase-1234',
        confirmPassword: 'new-passphrase-1234',
      }),
    );
    expect(first.status).toBe(503);
    expect(await first.json()).toMatchObject({ passwordUpdated: true });
    const retry = await POST(request({ action: 'revoke-sessions' }));
    expect(retry.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
