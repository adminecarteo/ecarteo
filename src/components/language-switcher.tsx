'use client';

import { useSyncExternalStore } from 'react';
import { useLocale } from '@/lib/locale-context';
import styles from './language-switcher.module.css';

const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, copy } = useLocale();
  // A new document can display its server-rendered text before the click handler is ready.
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  return (
    <div
      className={`${styles.switcher} ${className}`}
      role="group"
      aria-label={copy('Langue', 'Language')}
    >
      {(['fr', 'en'] as const).map((language) => (
        <button
          key={language}
          type="button"
          lang={language}
          title={language === 'fr' ? 'Français' : 'English'}
          aria-label={language === 'fr' ? 'FR — Français' : 'EN — English'}
          aria-pressed={locale === language}
          disabled={!hydrated}
          onClick={() => setLocale(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
