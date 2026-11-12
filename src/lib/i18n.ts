import messages from '@/data/translations.json';
import type { Localized } from '@/domain/types';
export type Locale = 'fr' | 'en';
export function translate(locale: Locale, key: string, ...args: unknown[]): string {
  if (key === 'evN')
    return locale === 'fr'
      ? `${args[0]} preuve${Number(args[0]) > 1 ? 's' : ''}`
      : `${args[0]} evidence item${Number(args[0]) !== 1 ? 's' : ''}`;
  const dictionary: Record<string, string> = messages[locale];
  return (dictionary[key] ?? key).replace(/\{(\d+)\}/g, (_, index) =>
    String(args[Number(index)] ?? ''),
  );
}
export function localize(locale: Locale, value: Localized | null | undefined): string {
  return typeof value === 'string' ? value : (value?.[locale] ?? value?.fr ?? '');
}
export function formatDate(value: string, locale: Locale, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? ({ hour: '2-digit', minute: '2-digit', timeZoneName: 'short' } as const) : {}),
    timeZone: 'Europe/Paris',
  }).format(date);
}
export function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
