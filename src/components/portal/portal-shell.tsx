'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useLocale } from '@/lib/locale-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import styles from './portal.module.css';

export function PortalShell({
  title,
  description,
  quality = false,
  children,
}: {
  title: string;
  description: string;
  quality?: boolean;
  children?: ReactNode;
}) {
  const { locale, copy } = useLocale();
  return (
    <div className={styles.page} lang={locale}>
      <div className={styles.shell}>
        <nav
          className={styles.nav}
          aria-label={copy('Navigation de l’espace', 'Workspace navigation')}
        >
          <Link className={styles.brand} href="/app">
            Écartéo
          </Link>
          <Link href="/app">Console</Link>
          <Link href="/app/requests">{copy('Demandes d’audit', 'Audit requests')}</Link>
          {quality && <Link href="/app/team">{copy('Équipe et accès', 'Team and access')}</Link>}
          <LanguageSwitcher />
        </nav>
        <main>
          <header className={styles.heading}>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
