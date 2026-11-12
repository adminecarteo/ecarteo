import type { Actor, AppState, Command } from '@/domain/types';
import type { Locale } from './i18n';
import { validateAttachment } from './attachment-validation';
import { workspaceSchema } from './state-schema';
import type { WorkspaceQueryInput, WorkspacePage, WorkspaceSummary } from './workspace-query';

export interface WorkspaceOperator {
  id: string;
  name: string;
}
export interface WorkspaceResponse {
  state: AppState;
  actor: Actor;
  operators: WorkspaceOperator[];
  page?: WorkspacePage;
  summary?: WorkspaceSummary;
  etag?: string;
}
export interface AttachmentMetadata {
  fileId: string;
  file: string;
  mimeType: string;
  size: number;
}
export const SESSION_EXPIRED_EVENT = 'ecarteo:session-expired';

export class WorkspaceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'WorkspaceApiError';
  }
}

export function uncertainOutcome(error: unknown): boolean {
  return error instanceof WorkspaceApiError && (error.status === 0 || error.status >= 500);
}

function language(locale?: Locale): Locale {
  return (
    locale ??
    (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'fr')
  );
}

async function request(path: string, init: RequestInit = {}, locale?: Locale): Promise<Response> {
  const selectedLocale = language(locale);
  const headers = new Headers(init.headers);
  headers.set('Accept-Language', selectedLocale);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(path === '/api/attachments' ? 90_000 : 30_000),
    });
  } catch {
    throw new WorkspaceApiError(
      selectedLocale === 'fr'
        ? 'Connexion interrompue. Vérifiez votre connexion avant de réessayer.'
        : 'Connection interrupted. Check your connection before trying again.',
      0,
    );
  }
  if (response.ok || response.status === 304) return response;
  let message =
    selectedLocale === 'fr'
      ? 'La demande n’a pas abouti. Réessayez.'
      : 'The request failed. Please try again.';
  let code: string | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      if ('error' in body && typeof body.error === 'string') message = body.error;
      if ('code' in body && typeof body.code === 'string') code = body.code;
    }
  } catch {
    /* Non-JSON failures still receive an actionable fallback message. */
  }
  if (
    (response.status === 401 ||
      (response.status === 403 &&
        ['ACCOUNT_UNAVAILABLE', 'ACCOUNT_DISABLED', 'EMAIL_NOT_CONFIRMED'].includes(code || ''))) &&
    typeof window !== 'undefined'
  )
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  throw new WorkspaceApiError(message, response.status, code);
}

function validState(value: unknown): asserts value is AppState {
  if (!workspaceSchema.safeParse(value).success)
    throw new WorkspaceApiError(
      language() === 'fr' ? 'Réponse du serveur invalide.' : 'Invalid server response.',
      502,
    );
}

async function readJSON(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new WorkspaceApiError(
      language() === 'fr' ? 'Réponse du serveur invalide.' : 'Invalid server response.',
      502,
    );
  }
}

export async function fetchWorkspace(
  locale?: Locale,
  query: WorkspaceQueryInput = {},
  previous?: WorkspaceResponse,
): Promise<WorkspaceResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const response = await request(
    `/api/workspace${params.size ? `?${params}` : ''}`,
    { headers: previous?.etag ? { 'If-None-Match': previous.etag } : {} },
    locale,
  );
  if (response.status === 304 && previous) return previous;
  const payload = await readJSON(response);
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('state' in payload) ||
    !('actor' in payload) ||
    !('operators' in payload)
  )
    throw new WorkspaceApiError(
      language() === 'fr' ? 'Réponse du serveur invalide.' : 'Invalid server response.',
      502,
    );
  validState(payload.state);
  const actor = payload.actor;
  if (
    !actor ||
    typeof actor !== 'object' ||
    !('id' in actor) ||
    typeof actor.id !== 'string' ||
    !('name' in actor) ||
    typeof actor.name !== 'string' ||
    !('role' in actor) ||
    !['qualite', 'operateur', 'client'].includes(String(actor.role)) ||
    !Array.isArray(payload.operators) ||
    !payload.operators.every(
      (operator) =>
        operator && typeof operator.id === 'string' && typeof operator.name === 'string',
    )
  )
    throw new WorkspaceApiError(
      language() === 'fr' ? 'Réponse du serveur invalide.' : 'Invalid server response.',
      502,
    );
  return { ...(payload as WorkspaceResponse), etag: response.headers.get('ETag') ?? undefined };
}

export async function submitCommand(
  command: Command,
  idempotencyKey: string,
  locale?: Locale,
  query?: WorkspaceQueryInput,
): Promise<{
  state: AppState;
  entityId?: string;
  page?: WorkspacePage;
  summary?: WorkspaceSummary;
}> {
  const response = await request(
    '/api/commands',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, idempotencyKey, ...(query ? { query } : {}) }),
    },
    locale,
  );
  const payload = await readJSON(response);
  if (!payload || typeof payload !== 'object' || !('state' in payload))
    throw new WorkspaceApiError(
      language() === 'fr' ? 'Réponse du serveur invalide.' : 'Invalid server response.',
      502,
    );
  validState(payload.state);
  if ('entityId' in payload && typeof payload.entityId !== 'string')
    throw new WorkspaceApiError(
      language() === 'fr' ? 'Réponse du serveur invalide.' : 'Invalid server response.',
      502,
    );
  return payload as { state: AppState; entityId?: string };
}

export async function saveAttachment(file: File, missionId: string): Promise<AttachmentMetadata> {
  await validateAttachment(file, language());
  const form = new FormData();
  form.set('file', file);
  form.set('missionId', missionId);
  const response = await request('/api/attachments', { method: 'POST', body: form });
  const payload = await readJSON(response);
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('fileId' in payload) ||
    typeof payload.fileId !== 'string' ||
    !('file' in payload) ||
    typeof payload.file !== 'string' ||
    !('mimeType' in payload) ||
    typeof payload.mimeType !== 'string' ||
    !('size' in payload) ||
    typeof payload.size !== 'number'
  )
    throw new WorkspaceApiError(
      language() === 'fr' ? 'Réponse du serveur invalide.' : 'Invalid server response.',
      502,
    );
  return payload as AttachmentMetadata;
}

export async function getAttachment(fileId: string): Promise<Blob | undefined> {
  try {
    return await (await request(`/api/attachments/${encodeURIComponent(fileId)}`)).blob();
  } catch (error) {
    if (error instanceof WorkspaceApiError && error.status === 404) return undefined;
    throw error;
  }
}

/** The server refuses deletion when an attachment is already linked to evidence. */
export async function removeAttachment(fileId: string): Promise<void> {
  await request(`/api/attachments/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}
