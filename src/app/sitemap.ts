import type { MetadataRoute } from 'next';
import { PUBLIC_PAGE_PATHS, PUBLIC_SITE_ORIGIN, publicIndexingEnabled } from '@/lib/public-site';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!publicIndexingEnabled()) return [];
  // No invented modification dates or cookie-dependent language URLs.
  return PUBLIC_PAGE_PATHS.map((path) => ({ url: new URL(path, PUBLIC_SITE_ORIGIN).href }));
}
