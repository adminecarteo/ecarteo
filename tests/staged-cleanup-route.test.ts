import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/server/staged-upload-maintenance', () => ({ stagedUploadMaintenance: vi.fn() }));
import { GET, POST } from '@/app/api/maintenance/staged-uploads/route';
import { stagedUploadMaintenance } from '@/server/staged-upload-maintenance';

const token = 'c'.repeat(48);
const request = (authorization?: string, method = 'GET') =>
  new Request('https://app.example.test/api/maintenance/staged-uploads', {
    method,
    headers: authorization ? { authorization } : undefined,
  });
beforeEach(() => {
  vi.stubEnv('OPS_CLEANUP_TOKEN', token);
  vi.stubEnv('OPS_HEALTH_TOKEN', 'h'.repeat(48));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('returns 404 before touching storage or the database for both unauthorized operations', async () => {
  expect((await GET(request())).status).toBe(404);
  expect((await POST(request('Bearer ' + 'h'.repeat(48), 'POST'))).status).toBe(404);
  expect(stagedUploadMaintenance).not.toHaveBeenCalled();
});
it('previews on GET and returns aggregate counts for an authorized POST', async () => {
  const run = vi.mocked(stagedUploadMaintenance);
  run.mockResolvedValueOnce({ eligible: 2 }).mockResolvedValueOnce({ removed: 2 });
  const preview = await GET(request('Bearer ' + token));
  expect(await preview.json()).toEqual({ eligible: 2 });
  expect(preview.headers.get('cache-control')).toContain('no-store');
  expect(await (await POST(request('Bearer ' + token, 'POST'))).json()).toEqual({ removed: 2 });
  expect(run.mock.calls).toEqual([[false], [true]]);
});
it('reports a failed batch without disclosing provider errors or object names', async () => {
  vi.mocked(stagedUploadMaintenance).mockRejectedValue(new Error('private-path-fixture'));
  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const response = await POST(request('Bearer ' + token, 'POST'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'unavailable' });
  expect(logger.mock.calls.flat().join(' ')).not.toContain('private-path-fixture');
});
