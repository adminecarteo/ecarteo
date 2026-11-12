'use client';

import { useLocale } from '@/lib/locale-context';
import styles from './language-switcher.module.css';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, copy } = useLocale();
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
          aria-label={language === 'fr' ? 'Français' : 'English'}
          aria-pressed={locale === language}
          onClick={() => setLocale(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
