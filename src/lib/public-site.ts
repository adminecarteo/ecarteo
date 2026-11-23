import type { Metadata } from 'next';

/** The approved public origin; never derive canonical URLs from request headers. */
export const PUBLIC_SITE_ORIGIN = 'https://ecarteo.fr';
export const PUBLIC_PAGE_PATHS = [
  '/',
  '/methode',
  '/offres',
  '/mentions-legales',
  '/confidentialite',
  '/conditions',
] as const;

export type PublicPagePath = (typeof PUBLIC_PAGE_PATHS)[number];

/** Render builds the same image without APP_URL, then supplies it at runtime. */
export function publicIndexingEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    [PUBLIC_SITE_ORIGIN, `${PUBLIC_SITE_ORIGIN}/`].includes(process.env.APP_URL?.trim() ?? '') &&
    process.env.ECARTEO_DEPLOYMENT_TARGET?.trim() !== 'backend'
  );
}

export function publicPageMetadata(path: PublicPagePath): Metadata {
  const enabled = publicIndexingEnabled();
  return {
    alternates: { canonical: new URL(path, PUBLIC_SITE_ORIGIN).href },
    robots: { index: enabled, follow: enabled },
  };
}
