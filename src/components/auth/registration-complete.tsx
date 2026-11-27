'use client';

import { useEffect } from 'react';
import { useLocale } from '@/lib/locale-context';
import { completeRegistration } from '@/lib/registration-analytics';
import styles from './auth.module.css';

export function RegistrationComplete() {
  const { copy } = useLocale();

  useEffect(() => {
    let active = true;
    void completeRegistration().then(({ next }) => {
      // A full navigation leaves the optional tag behind before the private app.
      if (active) window.location.replace(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={styles.formContent}>
      <h1>{copy('Ouverture de votre espace.', 'Opening your workspace.')}</h1>
      <p className={styles.description} role="status">
        {copy(
          'Votre lien a été traité. Nous ouvrons votre espace.',
          'Your link has been processed. We are opening your workspace.',
        )}
      </p>
      {/* Leave this document and its optional analytics runtime. */}
      <a href="/app">{copy('Continuer vers mon espace', 'Continue to my workspace')}</a>
    </div>
  );
}
