import 'server-only';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, supportedLocale } from '@/lib/locale';
import type { Locale } from '@/lib/i18n';

export async function getRequestLocale(): Promise<Locale> {
  return supportedLocale((await cookies()).get(LOCALE_COOKIE)?.value) ?? 'fr';
}
