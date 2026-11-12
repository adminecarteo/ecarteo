// Stripe's zero-decimal charge currencies. ISK and UGX use a two-decimal API
// representation for compatibility, despite their zero-decimal display.
const zeroDecimal = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);
const threeDecimal = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);
export function billingAmount(amount: number, currency: string, locale: Locale = 'fr'): string {
  const code = currency.toLowerCase();
  const divisor = zeroDecimal.has(code) ? 1 : threeDecimal.has(code) ? 1_000 : 100;
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / divisor);
}
import type { Locale } from './i18n';
