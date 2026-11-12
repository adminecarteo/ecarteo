import { requireAccount } from '@/server/auth';
import {
  listTeam,
  createInvitation,
  updateMember,
  revokeInvitation,
} from '@/server/accounts-requests';
import { assertSameOrigin, json, readJson } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return json(
      await listTeam(
        (await requireAccount()).user.id,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return workspaceError(error, request);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return json(
      await createInvitation((await requireAccount()).user.id, await readJson(request, 8192)),
      201,
    );
  } catch (error) {
    return workspaceError(error, request);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await updateMember((await requireAccount()).user.id, await readJson(request, 8192));
    return json({ ok: true });
  } catch (error) {
    return workspaceError(error, request);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await revokeInvitation((await requireAccount()).user.id, await readJson(request, 8192));
    return json({ ok: true });
  } catch (error) {
    return workspaceError(error, request);
  }
}
