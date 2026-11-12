'use client';
import { SESSION_EXPIRED_EVENT } from './workspace-client';

export async function portalRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  timeout = 30_000,
): Promise<T> {
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'Accept-Language': english ? 'en' : 'fr',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(
      english
        ? 'Connection interrupted. Check your connection and try again.'
        : 'Connexion interrompue. Vérifiez votre connexion puis réessayez.',
    );
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('INVALID_RESPONSE');
    data = parsed as Record<string, unknown>;
  } catch {
    if (response.status === 401 && typeof window !== 'undefined')
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error(
      english
        ? 'Invalid server response. Please try again.'
        : 'Réponse invalide du serveur. Réessayez.',
    );
  }
  if (!response.ok) {
    if (
      (response.status === 401 ||
        (response.status === 403 &&
          ['ACCOUNT_DISABLED', 'ACCOUNT_UNAVAILABLE', 'EMAIL_NOT_CONFIRMED'].includes(
            typeof data.code === 'string' ? data.code : '',
          ))) &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : english
          ? 'The request failed. Please try again.'
          : 'La demande a échoué. Réessayez.',
    );
  }
  return data as T;
}
