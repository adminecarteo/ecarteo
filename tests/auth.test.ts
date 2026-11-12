import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { authInputSchema, getAuthInputSchema, safeNext } from '@/lib/auth-schema';
import { authText, translateAuthFeedback } from '@/lib/auth-copy';
import { AppError, assertSameOrigin, readJson } from '@/server/http';

describe('authentication boundaries', () => {
  beforeEach(() => {
    process.env.APP_URL = 'http://127.0.0.1:3000';
  });
  it('only preserves internal console return destinations', () => {
    expect(safeNext('/app?view=rapport&id=abc')).toBe('/app?view=rapport&id=abc');
    for (const value of [
      'https://evil.test',
      '//evil.test',
      '/app/../../evil',
      '/application',
      '/app\\evil.test',
      '/auth/signout',
      '/app\n',
    ])
      expect(safeNext(value)).toBe('/app');
  });
  it('blocks cross-origin and originless mutations', () => {
    for (const origin of ['https://evil.test', null])
      expect(() =>
        assertSameOrigin(
          new Request('http://127.0.0.1:3000/api/auth', {
            method: 'POST',
            headers: origin ? { origin } : {},
          }),
        ),
      ).toThrow(AppError);
    expect(() =>
      assertSameOrigin(
        new Request('http://127.0.0.1:3000/api/auth', {
          method: 'POST',
          headers: { origin: 'http://127.0.0.1:3000' },
        }),
      ),
    ).not.toThrow();
  });
  it('rejects extra role/tenant fields at signup and enforces password confirmation', () => {
    const input = {
      action: 'signup',
      name: 'Camille Martin',
      company: 'Test Company',
      email: 'camille@example.com',
      password: 'a-passphrase-1234',
      confirmPassword: 'a-passphrase-1234',
    };
    expect(authInputSchema.safeParse(input).success).toBe(true);
    expect(authInputSchema.safeParse({ ...input, role: 'qualite' }).success).toBe(false);
    expect(authInputSchema.safeParse({ ...input, confirmPassword: 'different' }).success).toBe(
      false,
    );
    expect(
      authInputSchema.safeParse({ ...input, password: 'short', confirmPassword: 'short' }).success,
    ).toBe(false);
  });
  it('limits password bytes while accepting spaces and non-ASCII phrases', () => {
    expect(
      authInputSchema.safeParse({
        action: 'reset',
        password: 'une phrase très longue',
        confirmPassword: 'une phrase très longue',
      }).success,
    ).toBe(true);
    expect(
      authInputSchema.safeParse({
        action: 'reset',
        password: '界'.repeat(25),
        confirmPassword: '界'.repeat(25),
      }).success,
    ).toBe(false);
  });
  it('localizes validation without changing the accepted authentication payload', () => {
    const input = {
      action: 'signup',
      name: '',
      company: '',
      email: 'invalid',
      password: 'short',
      confirmPassword: 'different',
    };
    const english = getAuthInputSchema('en').safeParse(input);
    const french = getAuthInputSchema('fr').safeParse(input);
    expect(english.success).toBe(false);
    expect(french.success).toBe(false);
    if (!english.success && !french.success) {
      expect(english.error.issues.map((issue) => issue.message)).toContain(
        'Enter a valid email address.',
      );
      expect(english.error.issues.map((issue) => issue.message)).toContain(
        'The passwords do not match.',
      );
      expect(french.error.issues.map((issue) => issue.message)).toContain(
        'Saisissez une adresse email valide.',
      );
      expect(english.error.issues.map((issue) => issue.path)).toEqual(
        french.error.issues.map((issue) => issue.path),
      );
    }
  });
  it('translates stored feedback in both directions without losing outcomes', () => {
    expect(translateAuthFeedback(authText('revocationFailed', 'fr'), 'en')).toBe(
      authText('revocationFailed', 'en'),
    );
    expect(translateAuthFeedback(authText('signupSent', 'en'), 'fr')).toBe(
      authText('signupSent', 'fr'),
    );
    expect(translateAuthFeedback(undefined, 'en')).toBeUndefined();
  });
  it('rejects malformed and oversized bodies, including chunked bodies', async () => {
    const request = (body: string) =>
      new Request('http://127.0.0.1:3000/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
    await expect(readJson(request('{oops}'))).rejects.toMatchObject({ status: 400 });
    await expect(
      readJson(request(JSON.stringify({ text: 'x'.repeat(100) })), 20),
    ).rejects.toMatchObject({ status: 413 });
    await expect(readJson(request('{"hello":"world"}'))).resolves.toEqual({ hello: 'world' });
  });
});
