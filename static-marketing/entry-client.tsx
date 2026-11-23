import 'vite/modulepreload-polyfill';
import { hydrateRoot } from 'react-dom/client';
import { PUBLIC_PAGE_PATHS, type PublicPagePath } from '@/lib/public-site';
import { MarketingApp } from './app';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@/app/globals.css';

const root = document.getElementById('marketing-root');
const path = root?.dataset.page as PublicPagePath | undefined;
if (!root || !path || !PUBLIC_PAGE_PATHS.includes(path)) {
  throw new Error('Unknown static marketing route.');
}
hydrateRoot(root, <MarketingApp path={path} />);
