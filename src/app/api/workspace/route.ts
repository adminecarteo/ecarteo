import { requireAccount } from '@/server/auth';
import { loadWorkspace } from '@/server/workspace';
import { json, privateHeaders } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';
import { createHash } from 'node:crypto';
import { workspaceQueryParams } from '@/lib/workspace-query';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const workspace = await loadWorkspace(
      await requireAccount(),
      workspaceQueryParams(new URL(request.url).searchParams),
    );
    const etag = `"${createHash('sha256').update(JSON.stringify(workspace)).digest('hex')}"`;
    if (request.headers.get('if-none-match') === etag)
      return new Response(null, { status: 304, headers: { ...privateHeaders, ETag: etag } });
    const response = json(workspace);
    response.headers.set('ETag', etag);
    return response;
  } catch (error) {
    return workspaceError(error, request);
  }
}
