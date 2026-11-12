import { authorizedMonitor, operationalEvent, readiness } from '@/server/operations';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
  if (!authorizedMonitor(request.headers.get('authorization')))
    return Response.json({ error: 'Not found' }, { status: 404, headers });
  try {
    const result = await readiness();
    if (result.status !== 'ready') operationalEvent('readiness_failed');
    return Response.json(result, { status: result.status === 'ready' ? 200 : 503, headers });
  } catch {
    operationalEvent('readiness_failed');
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
