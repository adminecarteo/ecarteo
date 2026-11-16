import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from 'next/experimental/testing/server';
import { backendOrigin } from '@/lib/deployment-target';

const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: provider.create }));
import { config as proxyConfig, proxy } from '@/proxy';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

function frontend() {
  vi.stubEnv('ECARTEO_DEPLOYMENT_TARGET', 'frontend');
  vi.stubEnv('ECARTEO_BACKEND_ORIGIN', 'https://backend.example.test');
  vi.stubEnv('APP_URL', 'https://app.example.test');
  for (const key of [
    'DATABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_CA_CERT',
    'OPS_HEALTH_TOKEN',
    'OPS_CLEANUP_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_BILLING_PLANS',
  ])
    vi.stubEnv(key, '');
}

describe('split deployment routing', () => {
  it('sends API and auth paths to the backend before colocated route handlers', async () => {
    frontend();
    const { default: nextConfig } = await import('../next.config');
    const routes = await nextConfig.rewrites!();
    expect(routes).toEqual({
      beforeFiles: [
        { source: '/api/:path*', destination: 'https://backend.example.test/api/:path*' },
        { source: '/auth/:path*', destination: 'https://backend.example.test/auth/:path*' },
      ],
      afterFiles: [],
      fallback: [],
    });
    for (const source of ['/api/:path*', '/auth/:path*']) {
      expect((await nextConfig.headers!()).find((rule) => rule.source === source)?.headers).toEqual(
        expect.arrayContaining([
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'x-vercel-enable-rewrite-caching', value: '0' },
        ]),
      );
    }
  });

  it.each([
    '/api/attachments',
    '/api/attachments/file-id',
    '/api/auth',
    '/api/session',
    '/api/billing/webhook',
    '/auth/confirm?token_hash=opaque&type=signup',
    '/auth/signout',
  ])('keeps %s outside Vercel Routing Middleware', (url) => {
    expect(unstable_doesProxyMatch({ config: proxyConfig, nextConfig: {}, url })).toBe(false);
  });

  it.each(['/app', '/app/team', '/reset-password'])(
    'keeps page refresh coverage for monolithic %s',
    (url) => {
      expect(unstable_doesProxyMatch({ config: proxyConfig, nextConfig: {}, url })).toBe(true);
    },
  );

  it('does not contact Supabase from frontend page middleware', async () => {
    frontend();
    const response = await proxy(new NextRequest('https://app.example.test/app'));
    expect(provider.create).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('fails closed for a missing backend, redirect loop, or frontend secrets', () => {
    frontend();
    vi.stubEnv('ECARTEO_BACKEND_ORIGIN', '');
    expect(() => backendOrigin()).toThrow('required');
    vi.stubEnv('ECARTEO_BACKEND_ORIGIN', 'https://app.example.test');
    expect(() => backendOrigin()).toThrow('differ');
    vi.stubEnv('ECARTEO_BACKEND_ORIGIN', 'https://backend.example.test');
    vi.stubEnv('DATABASE_URL', 'synthetic-not-a-real-credential');
    expect(() => backendOrigin()).toThrow('only');
  });

  it('leaves backend and local fullstack deployments without external rewrites', async () => {
    vi.stubEnv('ECARTEO_DEPLOYMENT_TARGET', 'backend');
    vi.stubEnv('ECARTEO_BACKEND_ORIGIN', '');
    const { default: nextConfig } = await import('../next.config');
    expect(await nextConfig.rewrites!()).toEqual({ beforeFiles: [], afterFiles: [], fallback: [] });
  });
});
