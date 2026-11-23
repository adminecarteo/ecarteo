'use client';
import { useLocale } from '@/lib/locale-context';
import { LanguageSwitcher } from '@/components/language-switcher';
export default function NotFound() {
  const { copy } = useLocale();
  return (
    <main className="boot">
      <LanguageSwitcher />
      <h1>{copy('Page introuvable', 'Page not found')}</h1>
      <p>{copy('Cette page n’existe pas.', 'This page does not exist.')}</p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- The static marketing site needs a full document navigation. */}
      <a className="btn primary" href="/">
        {copy('Retour à l’accueil', 'Back to home')}
      </a>
    </main>
  );
}
