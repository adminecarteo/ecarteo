import type { Metadata } from 'next';
import { LocaleProvider } from '@/lib/locale-context';
import { getRequestLocale } from '@/server/locale';
import { publicIndexingEnabled, publicSiteVerification } from '@/lib/public-site';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title:
      locale === 'fr'
        ? 'Écartéo · Mesurez l’écart. Corrigez l’expérience.'
        : 'Écartéo · Measure the gap. Improve the experience.',
    description:
      locale === 'fr'
        ? 'Mesurez l’écart. Corrigez l’expérience. Console de pilotage des audits multicanaux.'
        : 'Measure the gap. Improve the experience. Manage evidence-based customer journey audits.',
    robots: { index: publicIndexingEnabled(), follow: publicIndexingEnabled() },
    verification: publicSiteVerification(),
  };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
