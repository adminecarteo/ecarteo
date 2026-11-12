'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { portalRequest } from '@/lib/portal-client';
import styles from './portal.module.css';

export function JoinPanel({ email }: { email: string | null }) {
  const { copy } = useLocale();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const raw = window.location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{43}$/.test(raw)) setToken(raw);
  }, []);
  if (!email)
    return (
      <section className={styles.card}>
        <h2>{copy('Confirmez votre identité', 'Confirm your identity')}</h2>
        <p className={styles.muted}>
          {copy(
            'Créez un compte ou connectez-vous avec l’adresse email à laquelle cette invitation est destinée. Confirmez votre email, puis rouvrez ce lien d’invitation pour rejoindre l’espace.',
            'Create an account or sign in using the email address this invitation was sent to. Confirm your email, then reopen this invitation link to join the workspace.',
          )}
        </p>
        <div className={styles.actions}>
          <Link className="btn primary" href="/signup" target="_blank" rel="noopener noreferrer">
            {copy('Créer un compte', 'Create an account')}
          </Link>
          <Link
            className="btn"
            href="/login?next=%2Fapp%2Fjoin"
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy('Se connecter', 'Sign in')}
          </Link>
          <button className="btn" onClick={() => window.location.reload()}>
            {copy('J’ai confirmé mon compte', 'I have confirmed my account')}
          </button>
        </div>
      </section>
    );
  return (
    <section className={styles.card}>
      <h2>{copy('Accepter l’invitation', 'Accept the invitation')}</h2>
      <p className={styles.muted}>
        {copy('Compte connecté :', 'Signed in as:')} {email}.{' '}
        {copy(
          'Seule l’adresse prévue par votre invitation peut rejoindre cet espace.',
          'Only the email address specified in your invitation can join this workspace.',
        )}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!token && (
        <p className={styles.message}>
          {copy(
            'Rouvrez le lien complet transmis par Écartéo. Il contient votre code personnel après le caractère #.',
            'Reopen the complete link from Écartéo. It contains your personal code after the # character.',
          )}
        </p>
      )}
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError('');
          try {
            await portalRequest('/api/invitations/accept', 'POST', { token, displayName: name });
            window.history.replaceState(null, '', '/app/join');
            router.replace('/app');
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : copy('Réessayez.', 'Please try again.'));
            setPending(false);
          }
        }}
      >
        <label className={styles.field}>
          {copy('Votre nom', 'Your name')}
          <input
            required
            value={name}
            minLength={2}
            maxLength={120}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={pending || !token}>
          {pending
            ? copy('Validation…', 'Confirming…')
            : copy('Rejoindre l’espace', 'Join the workspace')}
        </button>
      </form>
    </section>
  );
}
