'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ConsoleProvider, useConsole, NAV, type ConsoleProviderProps } from '@/lib/console-context';
import { Button } from './ui';
import { BrandMark } from './brand-mark';
import { WorkspaceNavigation } from './workspace-navigation';
import Dashboard from '@/features/dashboard';
const loading = () => (
  <div className="boot" aria-busy="true">
    <span className="loader" />
  </div>
);
const Scenarios = dynamic(() => import('@/features/scenarios'), { loading });
const Missions = dynamic(() => import('@/features/missions'), { loading });
const Scoring = dynamic(() => import('@/features/scoring'), { loading });
const EvidenceVault = dynamic(() => import('@/features/evidence'), { loading });
const Reports = dynamic(() => import('@/features/reports'), { loading });
const Retest = dynamic(() => import('@/features/retest'), { loading });
const Library = dynamic(() => import('@/features/library'), { loading });
export default function ConsoleApp(props: Omit<ConsoleProviderProps, 'children'>) {
  return (
    <ConsoleProvider key={props.actor.id} {...props}>
      <AppShell />
    </ConsoleProvider>
  );
}
export { ConsoleApp };
function AppShell() {
  const {
    state,
    actor,
    role,
    locale,
    setLocale,
    view,
    t,
    busy,
    theme,
    setTheme,
    reload,
    refreshing,
    refreshError,
    prepareSignOut,
  } = useConsole();
  const [expanded, setExpanded] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const views = {
    tableau: Dashboard,
    scenarios: Scenarios,
    missions: Missions,
    notation: Scoring,
    preuves: EvidenceVault,
    rapport: Reports,
    retest: Retest,
    bibliotheque: Library,
  };
  const Screen = views[view];
  const counts: Record<string, number> = {
    notation: state.missions.filter((m) => m.status === 'review').length,
    missions: state.missions.filter((m) => m.status === 'todo' || m.status === 'doing').length,
  };
  return (
    <>
      <a className="skip-link" href="#main">
        {locale === 'fr' ? 'Aller au contenu' : 'Skip to content'}
      </a>
      {busy && (
        <div
          className="busy-indicator"
          role="progressbar"
          aria-label={locale === 'fr' ? 'Enregistrement' : 'Saving'}
        />
      )}
      <div className="app">
        <aside
          className={`side ${expanded ? 'expanded' : ''}`}
          onBlur={(event) => {
            if (expanded && !event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
          }}
          onKeyDown={(event) => {
            if (expanded && event.key === 'Escape') {
              setExpanded(false);
              menuButton.current?.focus();
            }
          }}
        >
          <div className="brand-row">
            <div className="brand">
              <div className="tile">
                <Logo />
              </div>
              <div>
                <b>Écartéo</b>
                <small>{locale === 'fr' ? 'Console d’audit' : 'Audit console'}</small>
              </div>
            </div>
            <button
              ref={menuButton}
              className="theme-button mobile-menu"
              aria-expanded={expanded}
              aria-controls="console-nav console-account"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (locale === 'fr' ? 'Fermer' : 'Close') : 'Menu'}
            </button>
          </div>
          <nav className="nav" id="console-nav" aria-label={t('sections')}>
            {NAV.filter((n) => n.roles.includes(role)).map((n) => (
              <Link
                href={`/app?view=${n.id}`}
                key={n.id}
                aria-current={view === n.id ? 'page' : undefined}
                onClick={() => setExpanded(false)}
              >
                <span>{t(`nav_${n.id}`)}</span>
                {counts[n.id] > 0 && <span className="cnt num">{counts[n.id]}</span>}
              </Link>
            ))}
            {(role === 'client' || role === 'qualite') && (
              <Link href="/app/requests">
                {locale === 'fr' ? 'Demandes d’audit' : 'Audit requests'}
              </Link>
            )}
            {role === 'qualite' && (
              <Link href="/app/team">
                {locale === 'fr' ? 'Équipe et accès' : 'Team and access'}
              </Link>
            )}
            {role === 'client' && (
              <Link href="/app/billing">{locale === 'fr' ? 'Facturation' : 'Billing'}</Link>
            )}
          </nav>
          <div className="side-foot" id="console-account">
            <div className="side-controls">
              <div>
                <label>{t('langLabel')}</label>
                <div className="langseg" role="group" aria-label={t('langLabel')}>
                  {(['fr', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      lang={l}
                      aria-pressed={l === locale}
                      onClick={() => setLocale(l)}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="theme-button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                aria-label={locale === 'fr' ? 'Changer le thème' : 'Change theme'}
              >
                {theme === 'light'
                  ? locale === 'fr'
                    ? 'Sombre'
                    : 'Dark'
                  : locale === 'fr'
                    ? 'Clair'
                    : 'Light'}
              </button>
            </div>
            <div className="local-note">
              <strong>{actor.name}</strong>
              <br />
              {role === 'qualite'
                ? locale === 'fr'
                  ? 'Responsable qualité'
                  : 'Quality manager'
                : role === 'operateur'
                  ? locale === 'fr'
                    ? 'Opérateur'
                    : 'Auditor'
                  : locale === 'fr'
                    ? 'Espace client'
                    : 'Client account'}
            </div>
            <button className="lnk" disabled={refreshing || busy} onClick={() => void reload()}>
              {refreshing
                ? locale === 'fr'
                  ? 'Actualisation…'
                  : 'Refreshing…'
                : locale === 'fr'
                  ? 'Actualiser les données'
                  : 'Refresh workspace'}
            </button>
            <form action="/auth/signout" method="post" noValidate onSubmit={prepareSignOut}>
              <button className="lnk" type="submit">
                {locale === 'fr' ? 'Se déconnecter' : 'Sign out'}
              </button>
            </form>
          </div>
        </aside>
        <main id="main" tabIndex={-1}>
          {refreshError && (
            <div className="callout warn" role="alert">
              <p>{refreshError}</p>
              <p>
                {locale === 'fr'
                  ? 'Les dernières données chargées restent affichées.'
                  : 'The most recently loaded data is still shown.'}
              </p>
              <Button size="sm" disabled={refreshing || busy} onClick={() => void reload()}>
                {locale === 'fr' ? 'Réessayer' : 'Retry'}
              </Button>
            </div>
          )}
          <Screen key={`${view}-${role}`} />
          {view !== 'bibliotheque' && <WorkspaceNavigation />}
        </main>
      </div>
    </>
  );
}
export function Logo() {
  return <BrandMark size={28} />;
}
