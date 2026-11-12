import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { requestLocale } from '@/lib/locale';
import { localizedErrorMessage } from '@/lib/api-error-messages';
import { apiError, AppError } from '@/server/http';

describe('language preference across server boundaries', () => {
  it('uses explicit supported API language, then the saved preference, without trusting arbitrary values', () => {
    const request = (headers: Record<string, string>) =>
      new Request('http://127.0.0.1/api/workspace', { headers });
    expect(requestLocale(request({ 'Accept-Language': 'en', cookie: 'ecarteo-locale=fr' }))).toBe(
      'en',
    );
    expect(
      requestLocale(request({ 'Accept-Language': 'en-US,en;q=0.9', cookie: 'ecarteo-locale=fr' })),
    ).toBe('fr');
    expect(
      requestLocale(request({ cookie: 'other=value; ecarteo-locale=en; another=value' })),
    ).toBe('en');
    expect(
      requestLocale(request({ cookie: 'ecarteo-locale=<script>', 'Accept-Language': 'de' })),
    ).toBe('fr');
    expect(requestLocale()).toBe('fr');
  });

  it('returns the precise domain explanation in only the selected language', () => {
    const message = 'Rechargez les notes. / Reload the saved ratings.';
    expect(localizedErrorMessage('SCORING_CONFLICT', message, 'fr')).toBe('Rechargez les notes.');
    expect(localizedErrorMessage('SCORING_CONFLICT', message, 'en')).toBe(
      'Reload the saved ratings.',
    );
  });

  it('localizes API errors while preserving the authorization status and error code', async () => {
    const denied = new AppError(403, 'FORBIDDEN', 'Cette opération n’est pas autorisée.');
    const response = apiError(
      denied,
      new Request('http://127.0.0.1/api/team', { headers: { 'Accept-Language': 'en' } }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({
      code: 'FORBIDDEN',
      error: 'You do not have permission to perform this action.',
    });
    expect(await apiError(denied).json()).toEqual({ code: 'FORBIDDEN', error: denied.message });
  });
});
