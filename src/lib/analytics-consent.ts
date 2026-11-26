import { PUBLIC_PAGE_PATHS, PUBLIC_SITE_ORIGIN, type PublicPagePath } from './public-site';

export const GA4_MEASUREMENT_ID = 'G-X9BFFJ9M78';
export const CONSENT_STORAGE_KEY = 'ecarteo.cookie-consent.v1';
export const CONSENT_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
export type ConsentChoice = 'accepted' | 'refused' | null;

type ConsentRecord = {
  version: 1;
  analytics: boolean;
  savedAt: number;
  expiresAt: number;
};
type AnalyticsWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  'ga-disable-G-X9BFFJ9M78'?: boolean;
};

const pageTitles: Record<PublicPagePath, string> = {
  '/': 'Écartéo — Accueil',
  '/methode': 'Écartéo — Méthode',
  '/offres': 'Écartéo — Offres',
  '/mentions-legales': 'Écartéo — Mentions légales',
  '/confidentialite': 'Écartéo — Confidentialité',
  '/conditions': 'Écartéo — Conditions',
};
const deniedConsent = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
};

let memoryChoice: ConsentRecord | null = null;
let storageUnavailable = false;
let script: HTMLScriptElement | null = null;
let tagLoaded = false;
let configured = false;
let lastPage: string | null = null;
let initialized = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function browser(): AnalyticsWindow | null {
  return typeof window === 'undefined' ? null : (window as AnalyticsWindow);
}

function validRecord(value: unknown): value is ConsentRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ConsentRecord>;
  return (
    record.version === 1 &&
    typeof record.analytics === 'boolean' &&
    typeof record.savedAt === 'number' &&
    Number.isFinite(record.savedAt) &&
    record.savedAt <= Date.now() &&
    typeof record.expiresAt === 'number' &&
    record.expiresAt === record.savedAt + CONSENT_LIFETIME_MS &&
    record.expiresAt > Date.now()
  );
}

function storedRecord(): ConsentRecord | null {
  const target = browser();
  if (!target) return null;
  if (storageUnavailable) return validRecord(memoryChoice) ? memoryChoice : null;
  let stored: string | null;
  try {
    stored = target.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    // Browsers can deny storage entirely; an explicit choice still works for this page.
    return validRecord(memoryChoice) ? memoryChoice : null;
  }
  if (!stored) return null;
  try {
    const record: unknown = JSON.parse(stored);
    return validRecord(record) ? record : null;
  } catch {
    return null;
  }
}

/** Stable primitive snapshots are safe for React's useSyncExternalStore and SSR. */
export function readConsent(): ConsentChoice {
  const record = storedRecord();
  return record ? (record.analytics ? 'accepted' : 'refused') : null;
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publicPath(): PublicPagePath | null {
  const target = browser();
  if (!target || target.location.origin !== PUBLIC_SITE_ORIGIN) return null;
  const path = target.location.pathname.replace(/\/$/, '') || '/';
  return PUBLIC_PAGE_PATHS.includes(path as PublicPagePath) ? (path as PublicPagePath) : null;
}

function allowed(): boolean {
  return initialized > 0 && readConsent() === 'accepted' && publicPath() !== null;
}

function clearAnalyticsCookies(target: AnalyticsWindow): void {
  // Do not touch the login session or the language preference.
  const names = target.document.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('=')[0])
    .filter((name) => /^_ga(?:_|$)/.test(name));
  for (const name of names) {
    const expired = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    target.document.cookie = expired;
    target.document.cookie = `${expired}; Domain=${target.location.hostname}`;
    if (target.location.hostname === 'ecarteo.fr') {
      target.document.cookie = `${expired}; Domain=.ecarteo.fr`;
    }
  }
}

function stopAnalytics(): void {
  const target = browser();
  if (!target) return;
  // Disable collection before notifying a previously loaded tag of withdrawal.
  target['ga-disable-G-X9BFFJ9M78'] = true;
  if (configured) target.gtag?.('consent', 'update', deniedConsent);
  configured = false;
  lastPage = null;
  if (!tagLoaded) {
    if (script) {
      script.onload = null;
      script.onerror = null;
      script.remove();
      script = null;
    }
    // A removed async script can finish downloading. Never leave measurement commands
    // queued for it to execute after the visitor has withdrawn consent.
    if (target.dataLayer) target.dataLayer.length = 0;
  }
  clearAnalyticsCookies(target);
}

function configureAnalytics(target: AnalyticsWindow, path: PublicPagePath): void {
  if (configured) return;
  // These commands must precede loading gtag.js: a tag can otherwise initialize
  // its default page_view before the script's load callback runs.
  target.gtag?.('set', {
    send_page_view: false,
    page_location: `${PUBLIC_SITE_ORIGIN}${path}`,
    page_title: pageTitles[path],
    page_referrer: '',
  });
  target.gtag?.('consent', 'update', { ...deniedConsent, analytics_storage: 'granted' });
  target.gtag?.('js', new Date());
  target.gtag?.('config', GA4_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: 'none',
    cookie_expires: CONSENT_LIFETIME_MS / 1000,
    cookie_update: false,
    cookie_flags: 'SameSite=Lax;Secure',
    page_location: `${PUBLIC_SITE_ORIGIN}${path}`,
    page_title: pageTitles[path],
    page_referrer: '',
    ignore_referrer: true,
  });
  configured = true;
}

/** Only public pages are measured; query strings, fragments and referrers never leave the site. */
export function trackPublicPage(): void {
  const target = browser();
  const path = publicPath();
  if (!target || !allowed() || !path) {
    stopAnalytics();
    return;
  }
  if (!tagLoaded) return;
  target['ga-disable-G-X9BFFJ9M78'] = false;
  configureAnalytics(target, path);
  if (lastPage === path) return;
  // Override the tag's page context as well as this event, so later automatic
  // engagement events cannot fall back to a URL containing a query or token.
  const page = {
    page_location: `${PUBLIC_SITE_ORIGIN}${path}`,
    page_title: pageTitles[path],
    page_referrer: '',
  };
  target.gtag?.('set', page);
  target.gtag?.('event', 'page_view', { ...page, send_to: GA4_MEASUREMENT_ID });
  lastPage = path;
}

function synchronizeAnalytics(): void {
  const target = browser();
  if (!target) return;
  if (!allowed()) {
    stopAnalytics();
    return;
  }
  target['ga-disable-G-X9BFFJ9M78'] = false;
  if (tagLoaded) {
    trackPublicPage();
    return;
  }
  if (script) return;
  target.dataLayer ??= [];
  target.gtag ??= function () {
    // Google's command queue uses the standard arguments object, not a data event.
    // eslint-disable-next-line prefer-rest-params
    target.dataLayer?.push(arguments);
  };
  target.gtag('consent', 'default', deniedConsent);
  target.gtag('set', 'ads_data_redaction', true);
  target.gtag('set', 'url_passthrough', false);
  const path = publicPath();
  if (!path) return;
  configureAnalytics(target, path);
  script = target.document.createElement('script');
  script.id = 'ecarteo-ga4';
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
  script.onload = () => {
    tagLoaded = true;
    trackPublicPage();
  };
  script.onerror = () => {
    script?.remove();
    script = null;
    // Keep the site usable if a network failure or content blocker prevents analytics.
    target['ga-disable-G-X9BFFJ9M78'] = true;
  };
  target.document.head.appendChild(script);
}

function armExpiry(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  const record = storedRecord();
  if (!record || !initialized) return;
  expiryTimer = setTimeout(refreshConsent, Math.min(record.expiresAt - Date.now(), 2_147_483_647));
}

function refreshConsent(): void {
  synchronizeAnalytics();
  armExpiry();
  listeners.forEach((listener) => listener());
}

export function saveConsent(analytics: boolean): void {
  const target = browser();
  if (!target) return;
  const savedAt = Date.now();
  const record: ConsentRecord = {
    version: 1,
    analytics,
    savedAt,
    expiresAt: savedAt + CONSENT_LIFETIME_MS,
  };
  memoryChoice = record;
  try {
    target.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
    // A full storage quota can reject a new refusal while retaining an older grant.
    // Removing it prevents that older grant from reappearing on the next page.
    try {
      target.localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // Some browsers deny all storage access; the page-local choice remains authoritative.
    }
  }
  refreshConsent();
}

function storageChanged(event: StorageEvent): void {
  if (event.key !== CONSENT_STORAGE_KEY && event.key !== null) return;
  storageUnavailable = false;
  memoryChoice = null;
  refreshConsent();
}

/** Mount only with the public marketing shell; cleanup disables a surviving tag. */
export function initializeAnalytics(): () => void {
  const target = browser();
  if (!target) return () => {};
  initialized += 1;
  if (initialized === 1) {
    target.addEventListener('storage', storageChanged);
    target.addEventListener('focus', refreshConsent);
    target.addEventListener('popstate', refreshConsent);
    target.document.addEventListener('visibilitychange', refreshConsent);
  }
  refreshConsent();
  return () => {
    initialized = Math.max(0, initialized - 1);
    if (initialized) return;
    target.removeEventListener('storage', storageChanged);
    target.removeEventListener('focus', refreshConsent);
    target.removeEventListener('popstate', refreshConsent);
    target.document.removeEventListener('visibilitychange', refreshConsent);
    if (expiryTimer) clearTimeout(expiryTimer);
    stopAnalytics();
  };
}
