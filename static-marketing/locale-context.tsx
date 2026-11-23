import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n';
import { LOCALE_COOKIE, supportedLocale } from '@/lib/locale';

type LocaleValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  copy: (french: string, english: string) => string;
};
const LocaleContext = createContext<LocaleValue | null>(null);
const preferenceEvent = 'ecarteo-marketing-locale';
let volatilePreference: Locale | undefined;

function persistedPreference(): Locale | undefined {
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return supportedLocale(cookie?.slice(LOCALE_COOKIE.length + 1));
}

function readPreference(): Locale {
  if (volatilePreference) return volatilePreference;
  try {
    return persistedPreference() ?? 'fr';
  } catch {
    return 'fr';
  }
}

function subscribe(update: () => void) {
  window.addEventListener(preferenceEvent, update);
  window.addEventListener('focus', update);
  return () => {
    window.removeEventListener(preferenceEvent, update);
    window.removeEventListener('focus', update);
  };
}

function frenchSnapshot(): Locale {
  return 'fr';
}

export function StaticLocaleProvider({ children }: { children: ReactNode }) {
  // The first hydration uses the exact French prerender; the saved cookie is restored afterward.
  const locale = useSyncExternalStore(subscribe, readPreference, frenchSnapshot);
  const setLocale = useCallback((next: Locale) => {
    if (!supportedLocale(next)) return;
    volatilePreference = next;
    try {
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
      // Successful persistence keeps the cookie authoritative, including changes in another tab.
      if (persistedPreference() === next) volatilePreference = undefined;
    } catch {
      // Switching still works for this page when the browser disallows preference cookies.
    }
    window.dispatchEvent(new Event(preferenceEvent));
  }, []);
  const value = useMemo(
    () => ({ locale, setLocale, copy: (fr: string, en: string) => (locale === 'fr' ? fr : en) }),
    [locale, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('Static marketing requires its locale provider.');
  return value;
}
