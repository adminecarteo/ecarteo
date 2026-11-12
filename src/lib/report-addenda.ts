import { SESSION_EXPIRED_EVENT } from './workspace-client';
import type { Locale } from './i18n';

export interface ReportAddendum {
  id: string;
  body: string;
  created_at: string;
}

export async function fetchReportAddenda(
  missionId: string,
  locale: Locale = 'fr',
): Promise<ReportAddendum[]> {
  const response = await fetch(`/api/reports/${encodeURIComponent(missionId)}/addenda`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept-Language': locale },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401 && typeof window !== 'undefined')
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  if (!response.ok)
    throw new Error(
      locale === 'fr'
        ? 'Les compléments du rapport sont indisponibles.'
        : 'Report supplements are unavailable.',
    );
  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('addenda' in payload) ||
    !Array.isArray(payload.addenda) ||
    !payload.addenda.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.body === 'string' &&
        typeof item.created_at === 'string',
    )
  )
    throw new Error(locale === 'fr' ? 'Réponse du serveur invalide.' : 'Invalid server response.');
  return payload.addenda;
}
