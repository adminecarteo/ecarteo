'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  initializeAnalytics,
  readConsent,
  saveConsent,
  subscribeConsent,
} from '@/lib/analytics-consent';
import { useLocale } from '@/lib/locale-context';
import styles from './cookie-consent.module.css';

function serverConsent() {
  return null;
}

function subscribeHydration() {
  return () => {};
}

/** One owner for the public-site banner, preference dialog and footer control. */
export function CookieConsent() {
  const { copy } = useLocale();
  const consent = useSyncExternalStore(subscribeConsent, readConsent, serverConsent);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const manageButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => initializeAnalytics(), []);

  function showPreferences() {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAnalytics(readConsent() === 'accepted');
    setOpen(true);
  }

  function choose(enabled: boolean) {
    saveConsent(enabled);
    setAnnouncement(
      copy('Vos choix de cookies ont été enregistrés.', 'Your cookie choices have been saved.'),
    );
    setOpen(false);
    if (!open) manageButton.current?.focus({ preventScroll: true });
  }

  const accept = copy('Accepter', 'Accept');
  const refuse = copy('Refuser', 'Refuse');
  const manage = copy('Gérer les cookies', 'Manage cookies');

  return (
    <div ref={setPortal} className={styles.root}>
      <button ref={manageButton} type="button" className={styles.manage} onClick={showPreferences}>
        {manage}
      </button>
      <span className={styles.srOnly} role="status">
        {announcement}
      </span>

      {hydrated && consent === null && (
        <section className={styles.banner} aria-label={copy('Choix des cookies', 'Cookie choices')}>
          <div className={styles.copy}>
            <h2>{copy('Vos cookies, votre choix.', 'Your cookies, your choice.')}</h2>
            <p>
              {copy(
                'Avec votre accord, Google Analytics nous aide à comprendre les visites des pages publiques. Les cookies nécessaires restent actifs. Refuser ne change pas votre accès au site.',
                'With your permission, Google Analytics helps us understand visits to our public pages. Necessary cookies stay active. Refusing does not change your access to the site.',
              )}{' '}
              <a href="/confidentialite">{copy('En savoir plus', 'Learn more')}</a>
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.choice} onClick={() => choose(true)}>
              {accept}
            </button>
            <button type="button" className={styles.choice} onClick={() => choose(false)}>
              {refuse}
            </button>
            <button type="button" className={styles.choice} onClick={showPreferences}>
              {copy('Personnaliser', 'Customise')}
            </button>
          </div>
        </section>
      )}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal container={portal}>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.dialog}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              closeButton.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = returnFocus.current?.isConnected
                ? returnFocus.current
                : manageButton.current;
              target?.focus({ preventScroll: true });
            }}
          >
            <div className={styles.dialogHeading}>
              <Dialog.Title>{manage}</Dialog.Title>
              <Dialog.Close
                ref={closeButton}
                type="button"
                className={styles.close}
                aria-label={copy('Fermer', 'Close')}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </Dialog.Close>
            </div>
            <Dialog.Description className={styles.description}>
              {copy(
                'Vous pouvez modifier ou retirer votre accord à tout moment depuis le pied de page. Votre choix est conservé pendant six mois dans ce navigateur.',
                'You can change or withdraw your permission at any time from the footer. Your choice is saved for six months in this browser.',
              )}
            </Dialog.Description>

            <div className={styles.category}>
              <div className={styles.categoryHeading}>
                <h3>{copy('Cookies nécessaires', 'Necessary cookies')}</h3>
                <span className={styles.required}>{copy('Toujours actifs', 'Always active')}</span>
              </div>
              <p>
                {copy(
                  'Ils conservent votre choix de cookies, votre langue et la sécurité de votre session. Ils sont nécessaires au fonctionnement du service.',
                  'These remember your cookie choice and language, and keep your session secure. They are needed for the service to work.',
                )}
              </p>
            </div>
            <div className={styles.category}>
              <label className={styles.analyticsOption}>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  aria-describedby="analytics-description"
                />
                <span>
                  {copy(
                    'Mesure d’audience (Google Analytics)',
                    'Audience measurement (Google Analytics)',
                  )}
                </span>
              </label>
              <p id="analytics-description">
                {copy(
                  'Cette option mesure les pages publiques consultées pour nous aider à améliorer le site. Elle ne suit pas les pages de connexion ni votre espace d’audit. Google reçoit les données de visite uniquement après votre accord.',
                  'This option measures visits to public pages to help us improve the site. It does not track sign-in pages or your audit workspace. Google receives visit data only after you agree.',
                )}
              </p>
            </div>
            <a className={styles.privacy} href="/confidentialite">
              {copy('Lire la notice de confidentialité', 'Read the privacy notice')}
            </a>
            <div className={styles.dialogActions}>
              <div className={styles.equalChoices}>
                <button type="button" className={styles.choice} onClick={() => choose(true)}>
                  {accept}
                </button>
                <button type="button" className={styles.choice} onClick={() => choose(false)}>
                  {refuse}
                </button>
              </div>
              <button
                type="button"
                className={`${styles.choice} ${styles.save}`}
                onClick={() => choose(analytics)}
              >
                {copy('Enregistrer mes choix', 'Save my choices')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
