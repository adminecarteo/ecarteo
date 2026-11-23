import type { MetadataRoute } from 'next';
import { PUBLIC_SITE_ORIGIN, publicIndexingEnabled } from '@/lib/public-site';

// APP_URL is runtime-only in the shared Docker image; do not freeze build-time rules.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (!publicIndexingEnabled()) return { rules: { userAgent: '*', disallow: '/' } };

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/api/', '/auth/'],
    },
    // Login/signup/recovery forms remain crawlable so crawlers can read their noindex tags.
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  };
}
