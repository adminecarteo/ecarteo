'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useLocale } from '@/lib/locale-context';
import { BrandMark } from '@/components/brand-mark';
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
  const pathname = usePathname();
  return (
    <div className={styles.page} lang={locale}>
      <div className={styles.shell}>
        <header className={styles.navBar}>
          <Link className={styles.brand} href="/app">
            <BrandMark size={28} />
            Écartéo
          </Link>
          <nav
            className={styles.nav}
            aria-label={copy('Navigation de l’espace', 'Workspace navigation')}
          >
            <Link href="/app">Console</Link>
            <Link
              href="/app/requests"
              aria-current={pathname === '/app/requests' ? 'page' : undefined}
            >
              {copy('Demandes d’audit', 'Audit requests')}
            </Link>
            {quality && (
              <Link href="/app/team" aria-current={pathname === '/app/team' ? 'page' : undefined}>
                {copy('Équipe et accès', 'Team and access')}
              </Link>
            )}
          </nav>
          <LanguageSwitcher />
        </header>
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
