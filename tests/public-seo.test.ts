import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import robots, { dynamic as robotsMode } from '@/app/robots';
import sitemap, { dynamic as sitemapMode } from '@/app/sitemap';
import { publicPageMetadata } from '@/lib/public-site';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('APP_URL', 'https://ecarteo.fr');
  vi.stubEnv('ECARTEO_DEPLOYMENT_TARGET', 'fullstack');
});
afterEach(() => vi.unstubAllEnvs());

describe('public search discovery', () => {
  it('allows public pages and assets, excludes protected handlers and advertises the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/app', '/api/', '/auth/'] },
      sitemap: 'https://ecarteo.fr/sitemap.xml',
    });
    // Auth forms are deliberately not disallowed: Google must be able to read noindex.
    const rules = robots().rules;
    expect(Array.isArray(rules)).toBe(false);
    expect((rules as { disallow: string[] }).disallow).not.toContain('/login');
    expect((rules as { disallow: string[] }).disallow).not.toContain('/signup');
  });

  it('lists only the six canonical public pages without auth URLs or fabricated dates', () => {
    expect(sitemap()).toEqual([
      { url: 'https://ecarteo.fr/' },
      { url: 'https://ecarteo.fr/methode' },
      { url: 'https://ecarteo.fr/offres' },
      { url: 'https://ecarteo.fr/mentions-legales' },
      { url: 'https://ecarteo.fr/confidentialite' },
      { url: 'https://ecarteo.fr/conditions' },
    ]);
    expect(publicPageMetadata('/offres')).toEqual({
      alternates: { canonical: 'https://ecarteo.fr/offres' },
      robots: { index: true, follow: true },
    });
  });

  it.each([
    ['APP_URL', 'https://ecarteo-staging-zy4j.onrender.com'],
    ['APP_URL', 'http://127.0.0.1:3000'],
    ['APP_URL', 'https://ecarteo.fr.example.test'],
    ['APP_URL', 'https://ecarteo.fr@preview.example.test'],
    ['APP_URL', 'https://ecarteo.fr?preview=true'],
    ['APP_URL', ''],
    ['NODE_ENV', 'development'],
    ['ECARTEO_DEPLOYMENT_TARGET', 'backend'],
  ])('keeps previews out of search when %s is %s', (key, value) => {
    vi.stubEnv(key, value);
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(sitemap()).toEqual([]);
    expect(publicPageMetadata('/methode')).toEqual({
      alternates: { canonical: 'https://ecarteo.fr/methode' },
      robots: { index: false, follow: false },
    });
  });

  it('uses runtime configuration rather than the shared Docker build environment', () => {
    expect(robotsMode).toBe('force-dynamic');
    expect(sitemapMode).toBe('force-dynamic');
    vi.stubEnv('APP_URL', '');
    expect(sitemap()).toHaveLength(0);
    vi.stubEnv('APP_URL', 'https://ecarteo.fr/');
    expect(sitemap()).toHaveLength(6);
    expect(robots().sitemap).toBe('https://ecarteo.fr/sitemap.xml');
  });
});
