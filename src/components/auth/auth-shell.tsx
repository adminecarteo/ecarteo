'use client';

import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { BrandMark } from '@/components/brand-mark';
import styles from './auth.module.css';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { locale, copy } = useLocale();
  return (
    <div className={styles.page} lang={locale}>
      <a className={styles.skip} href="#auth-content">
        {copy('Aller au formulaire', 'Skip to the form')}
      </a>
      <div className={styles.shell}>
        <aside className={styles.brandPanel}>
          <Link
            href="/"
            className={styles.logo}
            aria-label={copy('Écartéo — Accueil', 'Écartéo — Home')}
          >
            <BrandMark inverted />
            <span>Écartéo</span>
          </Link>
          <div>
            <h2>
              {copy(
                'Chaque progrès commence par un constat.',
                'Every improvement begins with an observation.',
              )}
            </h2>
            <ol className={styles.steps}>
              {[
                [
                  copy('Observer', 'Observe'),
                  copy(
                    'Tester votre parcours comme un vrai client.',
                    'Test your journey as a real customer.',
                  ),
                ],
                [
                  copy('Documenter', 'Document'),
                  copy('Relier chaque constat à une preuve.', 'Link each finding to evidence.'),
                ],
                [
                  copy('Corriger', 'Improve'),
                  copy(
                    'Transformer les écarts en actions concrètes.',
                    'Turn gaps into practical actions.',
                  ),
                ],
                [
                  copy('Mesurer', 'Measure'),
                  copy('Retester et suivre les progrès.', 'Retest and track progress.'),
                ],
              ].map(([title, body], i) => (
                <li key={title}>
                  <span className={styles.number}>{i + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Link className={styles.homeLink} href="/">
            {copy('Retour au site', 'Back to the website')}
          </Link>
        </aside>
        <main id="auth-content" className={styles.formPanel}>
          <LanguageSwitcher className={styles.languageSwitcher} />
          {children}
        </main>
      </div>
    </div>
  );
}
