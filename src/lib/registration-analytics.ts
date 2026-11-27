import {
  CONSENT_LIFETIME_MS,
  CONSENT_STORAGE_KEY,
  GA4_MEASUREMENT_ID,
  getConsentRecord,
  subscribeConsent,
  type ConsentRecord,
} from './analytics-consent';
import { PUBLIC_SITE_ORIGIN } from './public-site';

type Completion = { next: '/app' | '/app/requests' };
type RegistrationWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  'ga-disable-G-X9BFFJ9M78'?: boolean;
};

const completionPath = '/registration-complete';
const maximumWaitMs = 3_000;
const deniedConsent = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
};
const pageContext = {
  page_location: `${PUBLIC_SITE_ORIGIN}${completionPath}`,
  page_title: 'Écartéo — Inscription confirmée',
  page_referrer: '',
};
let completion: Promise<Completion> | null = null;

function isCompletionPage(target: RegistrationWindow): boolean {
  return (
    target.location.origin === PUBLIC_SITE_ORIGIN &&
    target.location.pathname === completionPath &&
    target.location.search === '' &&
    target.location.hash === ''
  );
}

function sameAcceptedProof(proof: Readonly<ConsentRecord> | null): boolean {
  const current = getConsentRecord();
  return (
    proof?.analytics === true &&
    current?.analytics === true &&
    current.savedAt === proof.savedAt &&
    current.expiresAt === proof.expiresAt
  );
}

function debugVisit(target: RegistrationWindow): boolean {
  try {
    return target.sessionStorage.getItem('ecarteo.analytics.debug') === '1';
  } catch {
    return false;
  }
}

function clearAnalyticsCookies(target: RegistrationWindow): void {
  const names = target.document.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('=')[0])
    .filter((name) => /^_ga(?:_|$)/.test(name));
  for (const name of names) {
    const expired = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    target.document.cookie = expired;
    target.document.cookie = `${expired}; Domain=ecarteo.fr`;
    target.document.cookie = `${expired}; Domain=.ecarteo.fr`;
  }
}

function runCompletion(target: RegistrationWindow): Promise<Completion> {
  return new Promise((resolve) => {
    const proof = getConsentRecord();
    const abort = new AbortController();
    const deadline = Date.now() + maximumWaitMs;
    let next: Completion['next'] = '/app';
    let finished = false;
    let withdrawn = false;
    let loaded = false;
    let claimSettled = false;
    let eventSent = false;
    let script: HTMLScriptElement | null = null;
    let unsubscribe: (() => void) | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    function disable(): void {
      target['ga-disable-G-X9BFFJ9M78'] = true;
      if (script) {
        script.onload = null;
        script.onerror = null;
        script.remove();
        script = null;
      }
      // A removed async script may still finish loading. Its queue must not
      // contain a configuration or conversion that can run after cancellation.
      if (!loaded && target.dataLayer) target.dataLayer.length = 0;
      if (withdrawn) {
        if (loaded) target.gtag?.('consent', 'update', deniedConsent);
        clearAnalyticsCookies(target);
      }
    }

    function finish(): void {
      if (finished) return;
      finished = true;
      if (proof?.analytics && getConsentRecord()?.analytics !== true) withdrawn = true;
      abort.abort();
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
      unsubscribe?.();
      target.removeEventListener('storage', consentChanged);
      target.removeEventListener('pagehide', finish);
      disable();
      resolve({ next });
    }

    function consentChanged(event?: StorageEvent): void {
      if (event && event.key !== CONSENT_STORAGE_KEY && event.key !== null) return;
      // A changed record in another tab invalidates the proof used by this claim,
      // including when this tab's storage has become unavailable.
      if (event || !sameAcceptedProof(proof)) {
        withdrawn = true;
        disable();
        // Let the already-started claim consume its receipt even after refusal.
        // It cannot enable collection again, and the global deadline still applies.
        if (claimSettled) finish();
      }
    }

    function mayTrack(): boolean {
      return !finished && !withdrawn && isCompletionPage(target) && sameAcceptedProof(proof);
    }

    function sendRegistration(): void {
      loaded = true;
      if (!mayTrack()) {
        finish();
        return;
      }
      if (eventSent) return;
      eventSent = true;
      // Never attach an account ID, receipt, email, user properties or auth URL.
      target.gtag?.('event', 'sign_up', {
        method: 'email',
        send_to: GA4_MEASUREMENT_ID,
        ...pageContext,
        ...(debugVisit(target) ? { debug_mode: true } : {}),
        event_callback: finish,
        event_timeout: Math.max(1, deadline - Date.now()),
      });
    }

    function loadRegistrationTag(): void {
      if (!mayTrack()) {
        finish();
        return;
      }
      target['ga-disable-G-X9BFFJ9M78'] = false;
      target.dataLayer ??= [];
      target.gtag ??= function () {
        // eslint-disable-next-line prefer-rest-params
        target.dataLayer?.push(arguments);
      };
      target.gtag('consent', 'default', deniedConsent);
      target.gtag('set', { ...pageContext, send_page_view: false });
      target.gtag('set', 'ads_data_redaction', true);
      target.gtag('set', 'url_passthrough', false);
      target.gtag('consent', 'update', { ...deniedConsent, analytics_storage: 'granted' });
      target.gtag('js', new Date());
      target.gtag('config', GA4_MEASUREMENT_ID, {
        ...pageContext,
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_domain: 'none',
        cookie_expires: CONSENT_LIFETIME_MS / 1000,
        cookie_update: false,
        cookie_flags: 'SameSite=Lax;Secure',
        ignore_referrer: true,
      });
      // Configure before inserting: configuring onload allows an automatic raw
      // page_view to race ahead of send_page_view:false in the real Google tag.
      script = target.document.createElement('script');
      script.id = 'ecarteo-ga4-registration';
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
      script.onload = sendRegistration;
      script.onerror = finish;
      target.document.head.appendChild(script);
    }

    const deadlineTimer = setTimeout(finish, maximumWaitMs);
    target.addEventListener('pagehide', finish);
    if (proof?.analytics) {
      unsubscribe = subscribeConsent(consentChanged);
      target.addEventListener('storage', consentChanged);
      expiryTimer = setTimeout(
        consentChanged,
        Math.min(proof.expiresAt - Date.now(), maximumWaitMs),
      );
    }

    // The server consumes a one-use, HttpOnly signup receipt even when consent
    // is absent. Neither a normal login nor a later grant can replay this event.
    void Promise.resolve()
      .then(() =>
        target.fetch('/api/analytics/registration', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent: proof }),
          signal: abort.signal,
        }),
      )
      .then(async (response) => {
        if (finished || !response.ok) {
          finish();
          return;
        }
        const decision: unknown = await response.json();
        if (finished) return;
        claimSettled = true;
        if (!decision || typeof decision !== 'object') {
          finish();
          return;
        }
        const data = decision as { track?: unknown; next?: unknown };
        if (data.next === '/app/requests') next = data.next;
        if (data.track === true && mayTrack()) loadRegistrationTag();
        else finish();
      })
      .catch(finish);
  });
}

/** One coordinator per document prevents StrictMode/remounts from consuming the receipt twice. */
export function completeRegistration(): Promise<Completion> {
  if (typeof window === 'undefined') return Promise.resolve({ next: '/app' });
  if (window.location.pathname !== completionPath) return Promise.resolve({ next: '/app' });
  completion ??= runCompletion(window as RegistrationWindow);
  return completion;
}
