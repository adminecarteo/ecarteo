import type { Locale } from './i18n';

/** Shared account feedback keeps validation, API responses and locale changes consistent. */
export const authMessages = {
  fields: ['Vérifiez les champs indiqués.', 'Check the highlighted fields.'],
  email: ['Saisissez une adresse email valide.', 'Enter a valid email address.'],
  emailLength: [
    'L’adresse email ne doit pas dépasser 254 caractères.',
    'The email address must not exceed 254 characters.',
  ],
  passwordMin: ['Utilisez au moins 12 caractères.', 'Use at least 12 characters.'],
  passwordBytes: [
    'Le mot de passe ne doit pas dépasser 72 octets.',
    'The password must not exceed 72 bytes.',
  ],
  passwordRequired: ['Saisissez votre mot de passe.', 'Enter your password.'],
  passwordLength: ['Le mot de passe est trop long.', 'The password is too long.'],
  name: ['Saisissez votre nom.', 'Enter your name.'],
  nameLength: [
    'Le nom ne doit pas dépasser 120 caractères.',
    'The name must not exceed 120 characters.',
  ],
  company: ['Saisissez le nom de votre organisation.', 'Enter your organisation’s name.'],
  companyLength: [
    'Le nom de l’organisation ne doit pas dépasser 250 caractères.',
    'The organisation name must not exceed 250 characters.',
  ],
  confirmation: ['Les mots de passe ne correspondent pas.', 'The passwords do not match.'],
  redirectLength: ['L’adresse de retour est trop longue.', 'The return address is too long.'],
  rateLimit: [
    'Trop de tentatives. Patientez 15 minutes avant de réessayer.',
    'Too many attempts. Wait 15 minutes before trying again.',
  ],
  providerRateLimit: [
    'Trop de tentatives. Patientez avant de réessayer.',
    'Too many attempts. Wait before trying again.',
  ],
  authUnavailable: [
    'Le service de connexion est temporairement indisponible. Patientez avant de réessayer.',
    'The authentication service is temporarily unavailable. Wait before trying again.',
  ],
  credentials: [
    'Connexion impossible. Vérifiez vos identifiants et la confirmation de votre email.',
    'Unable to sign in. Check your credentials and confirm your email address.',
  ],
  signupFailed: [
    'La demande n’a pas pu aboutir. Réessayez ou connectez-vous si vous avez déjà un compte.',
    'The request could not be completed. Try again or sign in if you already have an account.',
  ],
  signupSent: [
    'Si cette adresse peut être inscrite, un email de confirmation lui a été envoyé. Ouvrez le lien pour activer votre espace.',
    'If this address can be registered, a confirmation email has been sent. Open the link to activate your workspace.',
  ],
  deliveryUnavailable: [
    'L’envoi est temporairement indisponible. Patientez avant de réessayer.',
    'Email delivery is temporarily unavailable. Wait before trying again.',
  ],
  recoverySent: [
    'Si cette adresse correspond à un compte, vérifiez votre messagerie et vos courriers indésirables. Si le lien n’arrive pas, attendez quelques minutes avant de réessayer.',
    'If this address matches an account, check your inbox and spam folder. If the link does not arrive, wait a few minutes before trying again.',
  ],
  confirmationSent: [
    'Si cette adresse attend une confirmation, vérifiez votre messagerie et vos courriers indésirables. Si le lien n’arrive pas, attendez quelques minutes avant de réessayer.',
    'If this address is awaiting confirmation, check your inbox and spam folder. If the link does not arrive, wait a few minutes before trying again.',
  ],
  resetFailed: [
    'Le mot de passe n’a pas pu être modifié. Demandez un nouveau lien ou choisissez un autre mot de passe.',
    'The password could not be changed. Request a new link or choose another password.',
  ],
  resetUnconfirmed: [
    'La modification du mot de passe n’a pas pu être confirmée. Essayez de vous connecter avec le nouveau mot de passe ou demandez un nouveau lien de récupération.',
    'We could not confirm whether your password was changed. Try signing in with the new password or request a new recovery link.',
  ],
  revocationFailed: [
    'Votre mot de passe a été modifié, mais la fermeture de vos sessions a échoué. Réessayez la déconnexion ci-dessous.',
    'Your password was changed, but signing out your sessions failed. Try signing out again below.',
  ],
  connectionInterrupted: [
    'La connexion au service a été interrompue. Réessayez.',
    'The connection to the service was interrupted. Try again.',
  ],
  deliveryInterrupted: [
    'L’envoi a été interrompu. Réessayez.',
    'Sending was interrupted. Try again.',
  ],
  revocationUnavailable: [
    'La fermeture des sessions est toujours indisponible. Réessayez dans quelques instants.',
    'Signing out sessions is still unavailable. Try again in a few moments.',
  ],
} as const;

export function authText(key: keyof typeof authMessages, locale: Locale): string {
  return authMessages[key][locale === 'fr' ? 0 : 1];
}

/** Retain outcomes, including partial password-reset success, when changing language. */
export function translateAuthFeedback(
  message: string | undefined,
  locale: Locale,
): string | undefined {
  if (!message) return message;
  const pair = Object.values(authMessages).find(([fr, en]) => message === fr || message === en);
  return pair ? pair[locale === 'fr' ? 0 : 1] : message;
}
