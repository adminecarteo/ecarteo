import { requireAccount } from '@/server/auth';
import { listRequests, createRequest, reviewRequest } from '@/server/accounts-requests';
import { assertSameOrigin, json, readJson } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return json(
      await listRequests(
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
      await createRequest((await requireAccount()).user.id, await readJson(request, 16384)),
      201,
    );
  } catch (error) {
    return workspaceError(error, request);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    return json(
      await reviewRequest((await requireAccount()).user.id, await readJson(request, 8192)),
    );
  } catch (error) {
    return workspaceError(error, request);
  }
}
