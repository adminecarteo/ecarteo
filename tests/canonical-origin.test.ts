import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server';

const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: provider.create }));
import { config, proxy } from '@/proxy';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('ECARTEO_DEPLOYMENT_TARGET', 'fullstack');
  vi.stubEnv('APP_URL', 'https://ecarteo.fr');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function request(path: string, host = 'app.ecarteo.fr', method = 'GET') {
  return new NextRequest(`https://${host}${path}`, { method, headers: { host } });
}

describe('production root-domain cutover', () => {
  it.each(['app.ecarteo.fr', 'www.ecarteo.fr'])(
    'redirects %s directly while retaining the path and encoded tracking values',
    async (host) => {
      const path = '/signup?utm_source=email&utm_campaign=launch%20test&utm_content=cta%2Bprimary';
      expect(doesProxyMatch({ config, url: `https://${host}${path}` })).toBe(true);
      const response = await proxy(request(path, host));
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`https://ecarteo.fr${path}`);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(provider.create).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'HEAD'])(
    'moves a %s email link before auth can consume its token',
    async (method) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fixture');
      const path = '/auth/confirm?token_hash=pkce_fixture%2Btoken&type=recovery';
      expect(doesProxyMatch({ config, url: `https://app.ecarteo.fr${path}` })).toBe(true);
      const response = await proxy(request(path, 'app.ecarteo.fr', method));
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`https://ecarteo.fr${path}`);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(provider.create).not.toHaveBeenCalled();
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'does not redirect or replay an unsafe %s request',
    async (method) => {
      const response = await proxy(request('/auth/signout', 'app.ecarteo.fr', method));
      expect(response.headers.get('location')).toBeNull();
      expect(provider.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['APP_URL', 'https://app.ecarteo.fr'],
    ['APP_URL', 'https://ecarteo-staging-zy4j.onrender.com'],
    ['APP_URL', 'https://ecarteo.fr.example.test'],
    ['APP_URL', ''],
    ['NODE_ENV', 'development'],
    ['ECARTEO_DEPLOYMENT_TARGET', 'frontend'],
    ['ECARTEO_DEPLOYMENT_TARGET', 'backend'],
  ])('does not activate when %s is %s', async (key, value) => {
    vi.stubEnv(key, value);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fixture');
    const response = await proxy(request('/signup'));
    expect(response.headers.get('location')).toBeNull();
    // Deployment before the cutover must not add public-page auth round trips.
    expect(provider.create).not.toHaveBeenCalled();
  });

  it.each([
    'ecarteo.fr',
    'ecarteo-staging-zy4j.onrender.com',
    'app.ecarteo.fr.example.test',
    'www.ecarteo.fr.example.test',
  ])('leaves the canonical host, staging and untrusted host %s alone', async (host) => {
    expect(doesProxyMatch({ config, url: `https://${host}/signup` })).toBe(false);
    expect((await proxy(request('/signup', host))).headers.get('location')).toBeNull();
  });

  it('does not trust a forwarded host to choose the redirect', async () => {
    const req = new NextRequest('https://ecarteo.fr/signup', {
      headers: { host: 'ecarteo.fr', 'x-forwarded-host': 'app.ecarteo.fr' },
    });
    expect((await proxy(req)).headers.get('location')).toBeNull();
  });

  it.each([
    '/api/attachments',
    '/api/auth',
    '/api/billing/webhook',
    '/_next/static/chunk.js',
    '/_next/image?url=%2Flogo.svg&w=128&q=75',
  ])(
    'keeps %s outside the host matcher, preserving upload and native rewrite boundaries',
    (path) => {
      expect(doesProxyMatch({ config, url: `https://app.ecarteo.fr${path}` })).toBe(false);
    },
  );
});
