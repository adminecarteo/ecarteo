import type { Locale } from './i18n';

const englishErrors: Record<string, string> = {
  ACCOUNT_ALREADY_ASSIGNED: 'This account already has access. Manage its existing profile.',
  ACCOUNT_DISABLED: 'Your access is unavailable. Contact your Écartéo representative.',
  ACCOUNT_UNAVAILABLE: 'Your access is unavailable. Contact your Écartéo representative.',
  AUTH_NOT_CONFIGURED: 'Sign-in is not enabled yet. Please try again after setup is complete.',
  AUTH_SERVICE_UNAVAILABLE:
    'Access verification is temporarily unavailable. Please try again in a moment.',
  BILLING_ACCOUNT_REVIEW: 'Your billing account needs to be reviewed by Écartéo.',
  BILLING_CONFIG_INVALID: 'Billing is temporarily unavailable.',
  BILLING_CONFIRMATION_PENDING: 'Your subscription is being confirmed. Refresh in a moment.',
  BILLING_CUSTOMER_MISMATCH: 'Billing synchronization needs to be checked.',
  BILLING_CUSTOMER_MISSING: 'Your organization does not have a billing account yet.',
  BILLING_FORBIDDEN: 'Only an administrator of your organization can manage billing.',
  BILLING_NOT_CONFIGURED:
    'Online subscriptions are not available yet. You can still request a quoted audit.',
  BILLING_PLAN_INVALID: 'Select an available plan.',
  BILLING_PRICE_UNAVAILABLE: 'This plan is unavailable. Contact Écartéo.',
  BILLING_RECONCILIATION_REQUIRED:
    'Écartéo must check an earlier payment request before you continue.',
  BILLING_REDIRECT_INVALID: 'The payment link is unavailable. Please try again.',
  CHECKOUT_ALREADY_OPEN: 'Cancel the current payment request before choosing another plan.',
  CHECKOUT_CHANGED: 'The payment request changed. Refresh the page.',
  CHECKOUT_COMPLETED: 'Payment is complete. Manage your subscription in the billing portal.',
  CHECKOUT_UNCERTAIN: 'Resume your previous payment request to check its status first.',
  CLIENT_NOT_FOUND: 'Organization not found.',
  CONTENT_TYPE: 'Invalid request format.',
  DATABASE_NOT_CONFIGURED: 'Database configuration is required.',
  DELETE_FAILED: 'The file could not be deleted. Please try again.',
  DOWNLOAD_FAILED: 'The file could not be downloaded. Please try again.',
  EMAIL_NOT_CONFIRMED: 'Confirm your email address to access your workspace.',
  EMPTY_BODY: 'The request is empty.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  IDEMPOTENCY_CONFLICT: 'This request key has already been used for different information.',
  INVALID_ATTACHMENT:
    'The uploaded file is missing, expired or does not match this request. Upload it again.',
  INVALID_BILLING_REQUEST: 'The billing request is invalid.',
  INVALID_COMMAND: 'The command or its request key is invalid.',
  INVALID_CONTENT_TYPE: 'The file format is invalid.',
  INVALID_CURSOR: 'The pagination link is invalid. Return to the first page.',
  INVALID_INPUT: 'Check the form fields and try again.',
  INVALID_JSON: 'The request is invalid.',
  INVALID_MISSION: 'The mission is invalid.',
  INVALID_OPERATOR: 'Choose an active operator.',
  INVALID_ORIGIN: 'This request is not allowed. Reload the page.',
  INVALID_QUERY: 'The search or pagination request is invalid.',
  INVALID_REQUEST: 'The command or its request key is invalid.',
  INVALID_STATE: 'This mission can no longer accept files.',
  INVALID_UPLOAD: 'Choose a file and a mission.',
  INVITATION_INVALID:
    'This invitation is invalid, expired or intended for a different confirmed email address.',
  INVITATION_LIMIT: 'The daily invitation limit has been reached. Try again tomorrow.',
  INVITATION_UNAVAILABLE: 'This invitation was already accepted or could not be found.',
  MEMBER_NOT_FOUND: 'Member not found.',
  NOT_FOUND: 'This item could not be found.',
  PAST_DATE: 'Choose a future date.',
  REASON_REQUIRED: 'Enter a reason for declining the request.',
  REQUEST_CLOSED: 'This request is already closed.',
  REQUEST_LIMIT: 'The daily request limit has been reached. Contact Écartéo.',
  REQUEST_NOT_FOUND: 'Request not found.',
  SELF_DISABLE: 'You cannot disable your own account.',
  STALE_MEMBER: 'This profile changed. Refresh the page before trying again.',
  STALE_REQUEST: 'This request changed. Refresh the list.',
  STORAGE_NOT_CONFIGURED: 'Private file storage needs to be configured.',
  SUBSCRIPTION_EXISTS: 'A subscription already exists. Manage it in the billing portal.',
  TOO_LARGE: 'The file or request is too large.',
  UNAUTHENTICATED: 'Your session has expired. Sign in again.',
  UPLOAD_FAILED: 'The file could not be uploaded. Please try again.',
  UPLOAD_LIMIT: 'Too many files are awaiting attachment. Complete or remove pending uploads first.',
};

/** Server-owned errors only: never use this to translate customer content. */
export function localizedErrorMessage(
  code: string | undefined,
  frenchMessage: string,
  locale: Locale,
): string {
  // Domain errors already carry the exact French and English explanation.
  const separator = frenchMessage.indexOf(' / ');
  if (separator >= 0)
    return locale === 'fr' ? frenchMessage.slice(0, separator) : frenchMessage.slice(separator + 3);
  if (locale === 'fr') return frenchMessage;
  return (
    englishErrors[code ?? ''] ??
    'The request could not be completed. Please try again or contact Écartéo.'
  );
}
