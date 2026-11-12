import { requireAccount } from '@/server/auth';
import { listOrganizations } from '@/server/accounts-requests';
import { json } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return json(
      await listOrganizations(
        (await requireAccount()).user.id,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return workspaceError(error, request);
  }
}
