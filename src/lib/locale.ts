import type { Locale } from './i18n';

export const LOCALE_COOKIE = 'ecarteo-locale';

export function supportedLocale(value: string | null | undefined): Locale | undefined {
  return value === 'en' || value === 'fr' ? value : undefined;
}

/** Explicit API language takes precedence; browser navigation uses the saved cookie. */
export function requestLocale(request?: Request): Locale {
  const language = request?.headers.get('accept-language')?.trim().toLowerCase();
  if (language === 'en' || language === 'fr') return language;
  const cookie = request?.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return supportedLocale(cookie?.slice(LOCALE_COOKIE.length + 1)) ?? 'fr';
}
