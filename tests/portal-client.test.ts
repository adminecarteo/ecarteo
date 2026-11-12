import { afterEach, describe, it, expect, vi } from 'vitest';
import { portalRequest } from '@/lib/portal-client';
afterEach(() => vi.unstubAllGlobals());
describe('portal request transport', () => {
  it('rejects malformed successful responses instead of rendering an invalid state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>upstream unavailable</html>', { status: 200 })),
    );
    await expect(portalRequest('/api/team')).rejects.toThrow('Réponse invalide');
  });
  it('sends bounded authenticated same-origin JSON with no browser cache', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    await expect(portalRequest('/api/team', 'PATCH', { id: 'member' })).resolves.toEqual({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/team',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        body: '{"id":"member"}',
      }),
    );
  });
});
