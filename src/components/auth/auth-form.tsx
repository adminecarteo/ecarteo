'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { getAuthInputSchema, type AuthMode, type AuthResult } from '@/lib/auth-schema';
import { useLocale } from '@/lib/locale-context';
import { authText, translateAuthFeedback } from '@/lib/auth-copy';
import styles from './auth.module.css';

const formContent = {
  fr: {
    login: {
      title: 'Heureux de vous retrouver.',
      description: 'Connectez-vous pour retrouver vos audits et suivre vos progrès.',
      submit: 'Se connecter',
    },
    signup: {
      title: 'Votre prochain progrès commence ici.',
      description:
        'Créez votre espace client pour centraliser vos audits, vos preuves et vos actions.',
      submit: 'Créer mon espace',
    },
    forgot: {
      title: 'Retrouvez votre accès.',
      description:
        'Indiquez votre adresse email. Nous vous enverrons un lien pour choisir un nouveau mot de passe.',
      submit: 'Envoyer le lien',
    },
    reset: {
      title: 'Un nouveau mot de passe.',
      description: 'Choisissez un mot de passe personnel pour sécuriser votre espace.',
      submit: 'Enregistrer le mot de passe',
    },
  },
  en: {
    login: {
      title: 'Welcome back.',
      description: 'Sign in to find your audits and track your progress.',
      submit: 'Sign in',
    },
    signup: {
      title: 'Your next improvement starts here.',
      description:
        'Create your customer workspace to bring your audits, evidence and actions together.',
      submit: 'Create my workspace',
    },
    forgot: {
      title: 'Regain access.',
      description: 'Enter your email address. We will send you a link to choose a new password.',
      submit: 'Send the link',
    },
    reset: {
      title: 'A new password.',
      description: 'Choose a personal password to secure your workspace.',
      submit: 'Save the password',
    },
  },
};
const notices: Record<string, readonly [string, string]> = {
  'password-updated': [
    'Votre mot de passe a été modifié. Vous pouvez vous reconnecter.',
    'Your password has been changed. You can sign in again.',
  ],
  'signed-out': ['Vous êtes déconnecté.', 'You have been signed out.'],
  'invalid-link': [
    'Ce lien est invalide ou a expiré. Demandez un nouveau lien de récupération ou de confirmation.',
    'This link is invalid or has expired. Request a new recovery or confirmation link.',
  ],
};
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function AuthForm({
  mode,
  configured,
  next = '/app',
  notice,
}: {
  mode: AuthMode;
  configured: boolean;
  next?: string;
  notice?: string;
}) {
  const { locale, copy } = useLocale();
  const text = (key: Parameters<typeof authText>[0]) => authText(key, locale);
  const feedback = (message: string | undefined) => translateAuthFeedback(message, locale);
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  const [values, setValues] = useState({
    name: '',
    company: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResult>({});
  const [resending, setResending] = useState(false);
  const content = formContent[locale][mode];

  async function send(body: unknown): Promise<AuthResult> {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': locale },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await response.json()) as AuthResult;
    if (data.redirect && response.ok) {
      window.location.assign(data.redirect);
    }
    return data;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !hydrated || !configured) return;
    const input =
      mode === 'signup'
        ? { action: mode, ...values }
        : mode === 'login'
          ? { action: mode, email: values.email.trim(), password: values.password, next }
          : mode === 'forgot'
            ? { action: mode, email: values.email.trim() }
            : { action: mode, password: values.password, confirmPassword: values.confirmPassword };
    if ('email' in input && typeof input.email === 'string') input.email = input.email.trim();
    const parsed = getAuthInputSchema(locale).safeParse(input);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        errors[String(issue.path[0] || 'form')] ||= [
          'invalid_type',
          'unrecognized_keys',
          'invalid_union',
        ].includes(issue.code)
          ? text('fields')
          : issue.message;
      setResult({ error: text('fields'), fieldErrors: errors });
      document.getElementById(`auth-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setResult({});
    try {
      const data = await send(parsed.data);
      setResult(data);
      if (data.error || data.message)
        setValues((previous) => ({ ...previous, password: '', confirmPassword: '' }));
    } catch {
      setResult({ error: text('connectionInterrupted') });
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (resending) return;
    setResending(true);
    try {
      setResult(await send({ action: 'resend', email: values.email.trim() }));
    } catch {
      setResult({ error: text('deliveryInterrupted') });
    } finally {
      setResending(false);
    }
  }
  async function revokeSessions() {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await send({ action: 'revoke-sessions' });
      setResult({ ...outcome, passwordUpdated: true });
    } catch {
      setResult({
        passwordUpdated: true,
        error: text('revocationUnavailable'),
      });
    } finally {
      setBusy(false);
    }
  }
  function field(name: keyof typeof values, label: string, type = 'text', autoComplete?: string) {
    const error = feedback(result.fieldErrors?.[name]);
    const isPassword = type === 'password';
    const help = name === 'password' && mode !== 'login';
    return (
      <div className={styles.field} key={name}>
        <label htmlFor={`auth-${name}`}>{label}</label>
        <div className={styles.inputWrap}>
          <input
            id={`auth-${name}`}
            name={name}
            type={isPassword && visible[name] ? 'text' : type}
            value={values[name]}
            autoComplete={autoComplete}
            required
            maxLength={name === 'email' ? 254 : name === 'company' ? 250 : 128}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `auth-${name}-error` : help ? 'password-help' : undefined}
            onChange={(event) => setValues({ ...values, [name]: event.target.value })}
          />
          {isPassword && (
            <button
              className={styles.reveal}
              type="button"
              aria-label={`${visible[name] ? copy('Masquer', 'Hide') : copy('Afficher', 'Show')} ${label.toLowerCase()}`}
              aria-pressed={Boolean(visible[name])}
              onClick={() => setVisible({ ...visible, [name]: !visible[name] })}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {visible[name] && <path d="m3 3 18 18" />}
              </svg>
            </button>
          )}
        </div>
        {help && (
          <span className={styles.hint} id="password-help">
            {copy(
              'Au moins 12 caractères. Une phrase de passe est bienvenue.',
              'At least 12 characters. A passphrase is welcome.',
            )}
          </span>
        )}
        {error && (
          <span className={styles.fieldError} id={`auth-${name}-error`}>
            {error}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={styles.formContent}>
      <h1>{content.title}</h1>
      <p className={styles.description}>{content.description}</p>
      {!configured && (
        <p className={styles.setup} role="status">
          {copy(
            'L’espace sécurisé est en cours d’activation. Les connexions et inscriptions seront disponibles après sa mise en service.',
            'The secure workspace is being activated. Sign-in and registration will be available once it is ready.',
          )}
        </p>
      )}
      {notice && notices[notice] && (
        <p className={styles.status} role="status">
          {copy(...notices[notice])}
        </p>
      )}
      {result.passwordUpdated ? (
        <div className={styles.error} role="alert">
          <p>{feedback(result.error)}</p>
          <button
            type="button"
            className={styles.textButton}
            onClick={revokeSessions}
            disabled={busy}
          >
            {busy
              ? copy('Déconnexion…', 'Signing out…')
              : copy('Fermer mes sessions', 'Sign out all sessions')}
          </button>
        </div>
      ) : result.message ? (
        <div className={styles.success} role="status">
          <h2>{copy('Consultez votre messagerie', 'Check your inbox')}</h2>
          <p>{feedback(result.message)}</p>
          {mode === 'signup' && (
            <button
              type="button"
              className={styles.textButton}
              onClick={resend}
              disabled={resending}
            >
              {resending
                ? copy('Envoi…', 'Sending…')
                : copy('Renvoyer la confirmation', 'Resend confirmation')}
            </button>
          )}
          <Link href="/login">{copy('Retour à la connexion', 'Back to sign in')}</Link>
        </div>
      ) : (
        <form method="post" action="/api/auth" onSubmit={submit} noValidate aria-busy={busy}>
          <noscript>
            <p className={styles.error}>
              {copy(
                'Activez JavaScript pour utiliser les formulaires de connexion sécurisés.',
                'Enable JavaScript to use the secure sign-in forms.',
              )}
            </p>
          </noscript>
          {result.error && (
            <p className={styles.error} role="alert">
              {feedback(result.error)}
            </p>
          )}
          {mode === 'signup' && (
            <>
              {field('name', copy('Votre nom', 'Your name'), 'text', 'name')}
              {field('company', copy('Organisation', 'Organisation'), 'text', 'organization')}
            </>
          )}
          {mode !== 'reset' &&
            field(
              'email',
              copy('Adresse email professionnelle', 'Work email address'),
              'email',
              'email',
            )}
          {mode !== 'forgot' &&
            field(
              'password',
              mode === 'reset'
                ? copy('Nouveau mot de passe', 'New password')
                : copy('Mot de passe', 'Password'),
              'password',
              mode === 'login' ? 'current-password' : 'new-password',
            )}
          {(mode === 'signup' || mode === 'reset') &&
            field(
              'confirmPassword',
              copy('Confirmer le mot de passe', 'Confirm password'),
              'password',
              'new-password',
            )}
          {mode === 'login' && (
            <Link className={styles.forgot} href="/forgot-password">
              {copy('Mot de passe oublié ?', 'Forgot your password?')}
            </Link>
          )}
          <button
            type="submit"
            className={styles.submit}
            disabled={busy || !configured || !hydrated}
          >
            <span className={busy ? styles.invisible : undefined}>{content.submit}</span>
            {busy && (
              <span className={styles.pending}>{copy('Veuillez patienter…', 'Please wait…')}</span>
            )}
          </button>
          {mode === 'signup' && (
            <p className={styles.hint}>
              {copy(
                'La création de votre espace ne souscrit aucune offre payante. Votre email doit être confirmé avant l’accès.',
                'Creating your workspace does not start a paid subscription. Confirm your email before accessing it.',
              )}
            </p>
          )}
        </form>
      )}
      <p className={styles.switch}>
        {mode === 'login' ? (
          <>
            {copy('Pas encore de compte ?', 'Don’t have an account yet?')}{' '}
            <Link href="/signup">{copy('Créer un compte', 'Create an account')}</Link>
          </>
        ) : mode === 'signup' ? (
          <>
            {copy('Déjà un compte ?', 'Already have an account?')}{' '}
            <Link href="/login">{copy('Se connecter', 'Sign in')}</Link>
          </>
        ) : (
          <Link href="/login">{copy('Retour à la connexion', 'Back to sign in')}</Link>
        )}
      </p>
    </div>
  );
}
