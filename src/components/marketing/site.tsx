'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { getOffers } from './content';
import { useLocale } from '@/lib/locale-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import styles from './marketing.module.css';
import { BrandMark } from '@/components/brand-mark';

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ActionLink({
  href,
  children,
  secondary = false,
  light = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  light?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${styles.action} ${secondary ? styles.secondaryAction : styles.primaryAction} ${light ? styles.lightAction : ''}`}
    >
      {children}
      <Arrow />
    </Link>
  );
}

export function MarketingShell({
  publisher,
  current,
  children,
}: {
  publisher?: ReactNode;
  current?: 'methode' | 'offres';
  children: ReactNode;
}) {
  const { locale, copy } = useLocale();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const menu = mobileMenu.current;
    function closeOutside(event: Event) {
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target))
        menu.open = false;
    }
    // WebKit can blur the summary before it dispatches a tap to a menu link.
    // Dismiss only when the pointer or keyboard focus actually moves outside.
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, []);
  return (
    <div className={styles.site} lang={locale}>
      <div className={styles.pageFrame}>
        <a href="#contenu" className={styles.skipLink}>
          {copy('Aller au contenu', 'Skip to content')}
        </a>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link
              href="/"
              className={styles.brand}
              aria-label={copy('Écartéo, accueil', 'Écartéo, home')}
            >
              <BrandMark />
              <span>Écartéo</span>
            </Link>
            <nav
              className={styles.desktopNav}
              aria-label={copy('Navigation principale', 'Main navigation')}
            >
              <Link href="/methode" aria-current={current === 'methode' ? 'page' : undefined}>
                {copy('Méthode', 'Method')}
              </Link>
              <Link href="/offres" aria-current={current === 'offres' ? 'page' : undefined}>
                {copy('Offres', 'Offers')}
              </Link>
            </nav>
            <LanguageSwitcher className={styles.languageSwitcher} />
            <div className={styles.accountNav}>
              <Link href="/login" className={styles.loginLink}>
                {copy('Se connecter', 'Sign in')}
              </Link>
              <Link href="/signup" className={styles.headerSignup}>
                {copy('Créer un compte', 'Create an account')}
                <Arrow />
              </Link>
            </div>
            <details
              ref={mobileMenu}
              className={styles.mobileNav}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || !event.currentTarget.open) return;
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }}
            >
              <summary>
                Menu<span aria-hidden="true">＋</span>
              </summary>
              <nav aria-label={copy('Navigation mobile', 'Mobile navigation')}>
                <Link href="/methode" aria-current={current === 'methode' ? 'page' : undefined}>
                  {copy('La méthode', 'Our method')}
                </Link>
                <Link href="/offres" aria-current={current === 'offres' ? 'page' : undefined}>
                  {copy('Les offres', 'Our offers')}
                </Link>
                <Link href="/login">{copy('Se connecter', 'Sign in')}</Link>
                <Link href="/signup">{copy('Créer un compte', 'Create an account')}</Link>
              </nav>
            </details>
          </div>
        </header>
        <main id="contenu" className={styles.main}>
          {children}
        </main>
        <FinalCallout />
        {publisher}
      </div>
    </div>
  );
}

export function ProcessIcon({
  kind,
}: {
  kind: 'observation' | 'preuve' | 'action' | 'retest' | 'flash' | 'globe';
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'observation' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      )}
      {kind === 'preuve' && (
        <>
          <path d="M6 3h9l4 4v14H6zM15 3v5h4M9 11h7M9 14h7M9 17h4" />
        </>
      )}
      {kind === 'action' && (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </>
      )}
      {kind === 'retest' && (
        <>
          <path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6M4 16a8 8 0 0 0 14 2l3-3m0 6v-6h-6" />
        </>
      )}
      {kind === 'flash' && (
        <path d="m13 2-8 12h6l-1 8 9-13h-6l1-7z" fill="currentColor" stroke="none" />
      )}
      {kind === 'globe' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18M5 6.5h14M5 17.5h14" />
        </>
      )}
    </svg>
  );
}

export function AuditPreview() {
  const { copy } = useLocale();
  const rows = [
    {
      kind: 'observation',
      title: copy('Observation', 'Observation'),
      text: copy(
        'Un prospect demande une chambre accessible via le formulaire de l’hôtel. Après deux jours, il attend toujours une réponse.',
        'A guest asks for an accessible room through the hotel form. Two days later, they are still waiting for a reply.',
      ),
    },
    {
      kind: 'preuve',
      title: copy('Preuve', 'Evidence'),
      text: copy(
        'L’accusé de réception horodaté et la boîte de test permettent de vérifier le délai.',
        'The timestamped confirmation and the test inbox show how long the guest waited.',
      ),
    },
    {
      kind: 'action',
      title: copy('Action', 'Action'),
      text: copy(
        'La réception désigne une personne pour traiter chaque demande dans la journée.',
        'Reception assigns each enquiry to someone responsible for replying that day.',
      ),
    },
    {
      kind: 'retest',
      title: copy('Retest', 'Retest'),
      text: copy(
        'Une nouvelle demande reçoit une réponse en trois heures, avec les équipements disponibles.',
        'A repeat enquiry gets a reply in three hours with details of the accessible facilities.',
      ),
    },
  ] as const;
  return (
    <figure className={styles.preview} aria-labelledby="preview-caption">
      <figcaption id="preview-caption">
        <span>{copy('Exemple illustratif', 'Illustrative example')}</span>
        <strong>{copy('Réserver une chambre accessible', 'Booking an accessible room')}</strong>
      </figcaption>
      <ol>
        {rows.map((row) => (
          <li key={row.kind}>
            <span className={styles.iconTile}>
              <ProcessIcon kind={row.kind} />
            </span>
            <div>
              <h3>{row.title}</h3>
              <p>{row.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function OffersOverview() {
  const { locale, copy } = useLocale();
  const offers = getOffers(locale);
  return (
    <div className={styles.offersList}>
      {offers.map((offer, index) => (
        <article className={styles.offerRow} key={offer.id}>
          <span className={styles.iconTile}>
            <ProcessIcon kind={(['flash', 'retest', 'globe'] as const)[index]} />
          </span>
          <h3>{offer.name}</h3>
          <p>{offer.description}</p>
          <Link href={`/offres#${offer.id}`} className={styles.offerLink}>
            {copy('Découvrir', 'Explore')}
            <span className={styles.srOnly}> {offer.name}</span>
          </Link>
        </article>
      ))}
    </div>
  );
}

export function FinalCallout() {
  const { copy } = useLocale();
  return (
    <footer className={styles.finalCallout}>
      <Link
        href="/"
        className={`${styles.brand} ${styles.invertedBrand}`}
        aria-label={copy('Écartéo, accueil', 'Écartéo, home')}
      >
        <BrandMark inverted />
        <span>Écartéo</span>
      </Link>
      <p>
        {copy('Prêt à auditer votre parcours client ?', 'Ready to audit your customer journey?')}
      </p>
      <ActionLink href="/signup">{copy('Créer mon espace', 'Create my workspace')}</ActionLink>
    </footer>
  );
}
