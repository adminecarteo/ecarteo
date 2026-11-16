import { authorizedCleanup, operationalEvent } from '@/server/operations';
import { stagedUploadMaintenance } from '@/server/staged-upload-maintenance';

export const runtime = 'nodejs';

async function handle(request: Request, apply: boolean) {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
  if (!authorizedCleanup(request.headers.get('authorization')))
    return Response.json({ error: 'Not found' }, { status: 404, headers });
  try {
    return Response.json(await stagedUploadMaintenance(apply), { headers });
  } catch {
    operationalEvent('staged_cleanup_failed');
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}

export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
