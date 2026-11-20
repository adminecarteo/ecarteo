'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing/site';
import { useLocale } from '@/lib/locale-context';
import { legalContent, legalRoutes, type LegalPageKind } from './content';
import styles from './legal.module.css';

export function LegalPage({ kind, publisher }: { kind: LegalPageKind; publisher: ReactNode }) {
  const { locale, copy } = useLocale();
  const content = legalContent[locale][kind];
  return (
    <MarketingShell publisher={publisher}>
      <article className={styles.document}>
        <header className={styles.introduction}>
          <p className={styles.eyebrow}>
            {copy('Informations sur le service', 'Service information')}
          </p>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          <p className={styles.updated}>
            {copy('Version du 20 novembre 2026', 'Version dated 20 November 2026')}
          </p>
        </header>
        <nav
          className={styles.documents}
          aria-label={copy('Documents du service', 'Service documents')}
        >
          {(Object.keys(legalRoutes) as LegalPageKind[]).map((page) => (
            <Link
              key={page}
              href={legalRoutes[page]}
              aria-current={page === kind ? 'page' : undefined}
            >
              {legalContent[locale][page].title}
            </Link>
          ))}
        </nav>
        {content.sections.map((section, index) => (
          <section
            className={styles.section}
            key={section.title}
            aria-labelledby={`legal-section-${index}`}
          >
            <h2 id={`legal-section-${index}`}>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items && (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section className={styles.contact} aria-labelledby="legal-contact">
          <h2 id="legal-contact">{copy('Nous contacter', 'Contact us')}</h2>
          <a href="mailto:admin-dev@ecarteo.fr">admin-dev@ecarteo.fr</a>
          <p>INTERTRAD · 91 rue du Faubourg Saint-Honoré, 75008 Paris, France</p>
        </section>
        {kind !== 'terms' && (
          <nav
            className={styles.references}
            aria-label={copy(
              'Sources et informations complémentaires',
              'Sources and further information',
            )}
          >
            {kind === 'publisher' && (
              <a href="https://annuaire-entreprises.data.gouv.fr/entreprise/intertrad-827584566">
                {copy(
                  'Intertrad : Annuaire des entreprises',
                  'Intertrad: French business register',
                )}
              </a>
            )}
            <a href="https://render.com/terms">
              {copy('Informations légales Render', 'Render legal information')}
            </a>
            <a href="https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq">
              {copy('Supabase : régions et transferts', 'Supabase: regions and transfers')}
            </a>
            {kind === 'privacy' && (
              <a href="https://www.cnil.fr/fr/mes-demarches/les-droits-pour-maitriser-vos-donnees-personnelles">
                {copy('CNIL : vos droits', 'CNIL: your rights')}
              </a>
            )}
          </nav>
        )}
      </article>
    </MarketingShell>
  );
}
