import 'server-only';
import { siteOrigin } from './config';
import { operationalEvent } from './operations';
import { requestLocale } from '@/lib/locale';
import { localizedErrorMessage } from '@/lib/api-error-messages';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = siteOrigin();
  if (origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError(
      403,
      'INVALID_ORIGIN',
      'Cette requête n’est pas autorisée. Rechargez la page.',
    );
  }
}
export async function readJson(request: Request, maxBytes = 128 * 1024): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new AppError(415, 'CONTENT_TYPE', 'Format de requête invalide.');
  const bytes = await readBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'La requête est invalide.');
  }
}
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') || '0') > maxBytes)
    throw new AppError(413, 'TOO_LARGE', 'Le fichier ou la requête est trop volumineux.');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'EMPTY_BODY', 'La requête est vide.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError(413, 'TOO_LARGE', 'Le fichier ou la requête est trop volumineux.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: privateHeaders });
}
export function apiError(error: unknown, request?: Request) {
  const locale = requestLocale(request);
  if (error instanceof AppError)
    return json(
      { error: localizedErrorMessage(error.code, error.message, locale), code: error.code },
      error.status,
    );
  // Log only diagnostic class/code, never request bodies, tokens, files or credentials.
  operationalEvent('request_failed', {
    category: error instanceof Error ? error.name : 'UnknownError',
  });
  return json(
    {
      error:
        locale === 'fr'
          ? 'Le service est temporairement indisponible. Réessayez dans quelques instants.'
          : 'The service is temporarily unavailable. Please try again in a moment.',
    },
    503,
  );
}
