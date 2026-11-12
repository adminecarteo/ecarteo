import 'server-only';
import { WorkspaceError } from './workspace';
import { apiError, json } from './http';
import { requestLocale } from '@/lib/locale';
import { localizedErrorMessage } from '@/lib/api-error-messages';

export function workspaceError(error: unknown, request?: Request) {
  if (error instanceof WorkspaceError)
    return json(
      {
        error: localizedErrorMessage(error.code, error.message, requestLocale(request)),
        code: error.code,
      },
      error.status,
    );
  return apiError(error, request);
}
