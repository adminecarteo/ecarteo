import { requireAccount } from '@/server/auth';
import { uploadAttachment } from '@/server/workspace';
import { assertSameOrigin, json, readBody, AppError } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const account = await requireAccount();
    const contentType = request.headers.get('content-type');
    if (!contentType?.startsWith('multipart/form-data;'))
      throw new AppError(415, 'INVALID_CONTENT_TYPE', 'Le format du fichier est invalide.');
    const bytes = await readBody(request, 11 * 1024 * 1024);
    const form = await new Response(bytes as BodyInit, {
      headers: { 'Content-Type': contentType },
    }).formData();
    const file = form.get('file');
    const missionId = form.get('missionId');
    if (!(file instanceof File) || typeof missionId !== 'string')
      throw new AppError(400, 'INVALID_UPLOAD', 'Choisissez un fichier et une mission.');
    return json(await uploadAttachment(account, missionId, file), 201);
  } catch (error) {
    return workspaceError(error, request);
  }
}
