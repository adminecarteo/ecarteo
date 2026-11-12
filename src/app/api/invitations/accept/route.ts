import { requireUser } from '@/server/auth';
import { acceptInvitation } from '@/server/accounts-requests';
import { assertSameOrigin, json, readJson } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return json(
      await acceptInvitation((await requireUser()).user.id, await readJson(request, 8192)),
    );
  } catch (error) {
    return workspaceError(error, request);
  }
}
