import { renderToString } from 'react-dom/server';
import {
  PUBLIC_PAGE_PATHS,
  PUBLIC_SITE_ORIGIN,
  publicIndexingEnabled,
  publicSiteVerification,
  type PublicPagePath,
} from '@/lib/public-site';
import { MarketingApp } from './app';
import { pageMetadata } from './metadata';

export function render(path: PublicPagePath) {
  if (!PUBLIC_PAGE_PATHS.includes(path)) throw new Error('Refusing to prerender a private route.');
  return {
    html: renderToString(<MarketingApp path={path} />),
    ...pageMetadata(path, 'fr'),
    canonical: new URL(path, PUBLIC_SITE_ORIGIN).href,
  };
}

export function configuration() {
  return {
    paths: PUBLIC_PAGE_PATHS,
    origin: PUBLIC_SITE_ORIGIN,
    index: publicIndexingEnabled(),
    google: publicSiteVerification()?.google,
  };
}
