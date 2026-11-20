import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { monitorConfiguration, runProductionMonitor } from '../scripts/lib/production-monitor.mjs';

const env = {
  ORIGIN: 'https://ecarteo.fr',
  HEALTH_TOKEN: 'health-fixture-'.repeat(4),
  CLEANUP_TOKEN: 'cleanup-fixture-'.repeat(4),
};
const ready = {
  status: 'ready',
  checks: { configuration: true, database: true, schema: true, storage: true },
};

function fixture(
  options: { eligible?: number; apply?: boolean; removed?: number; remaining?: number } = {},
) {
  let previews = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === '/api/ready') return Response.json(ready);
    if (path === '/api/maintenance/staged-uploads') {
      if (init?.method === 'POST') return Response.json({ removed: options.removed ?? 1 });
      return Response.json({
        eligible: previews++ ? (options.remaining ?? 0) : (options.eligible ?? 2),
      });
    }
    return new Response('<!doctype html><html><body>Public page</body></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  });
  const log = vi.fn<(message: string) => void>();
  const pause = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const config = monitorConfiguration({ ...env, APPLY: String(options.apply ?? false) });
  return { fetch, log, pause, config };
}

describe('sampled production monitor', () => {
  it('checks all public entry pages without sending tokens and keeps a preview read-only', async () => {
    const f = fixture();
    await expect(runProductionMonitor(f.config, f)).resolves.toMatchObject({
      status: 'ready',
      publicPages: 3,
      eligible: 2,
      removed: 0,
      apply: false,
    });
    const calls = f.fetch.mock.calls;
    expect(calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/ready',
      '/',
      '/login',
      '/signup',
      '/api/maintenance/staged-uploads',
    ]);
    expect(
      calls.every(([, options]) => options?.method === 'GET' && options.redirect === 'error'),
    ).toBe(true);
    expect(calls[0][1]?.headers).toEqual({ authorization: 'Bearer ' + env.HEALTH_TOKEN });
    expect(calls[4][1]?.headers).toEqual({ authorization: 'Bearer ' + env.CLEANUP_TOKEN });
    for (const [, options] of calls.slice(1, 4)) {
      expect(options?.headers).toEqual({ accept: 'text/html' });
      expect(options?.credentials).toBeUndefined();
    }
    expect(JSON.stringify(f.log.mock.calls)).not.toContain(env.HEALTH_TOKEN);
    expect(JSON.stringify(f.log.mock.calls)).not.toContain(env.CLEANUP_TOKEN);
  });

  it('allows one bounded cold-start retry', async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(new Response('provider detail not for logs', { status: 503 }));
    await expect(runProductionMonitor(f.config, f)).resolves.toMatchObject({ status: 'ready' });
    expect(f.pause).toHaveBeenCalledExactlyOnceWith(15_000, expect.any(AbortSignal));
    expect(f.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/ready'))).toHaveLength(
      2,
    );
    expect(JSON.stringify(f.log.mock.calls)).not.toContain('provider detail');
  });

  it('stops before cleanup when readiness remains unavailable', async () => {
    const f = fixture({ apply: true });
    f.fetch.mockImplementation(
      async () => new Response('private provider detail', { status: 503 }),
    );
    await expect(runProductionMonitor(f.config, f)).rejects.toMatchObject({
      code: 'readiness_failed',
    });
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(f.fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
    expect(f.log).not.toHaveBeenCalled();
  });

  it.each([
    [503, 'text/html'],
    [200, 'application/json'],
  ])(
    'fails on an unavailable or non-HTML public page (%s, %s) before mutation',
    async (status, type) => {
      const f = fixture({ apply: true });
      f.fetch.mockResolvedValueOnce(Response.json(ready));
      f.fetch.mockResolvedValueOnce(
        new Response('private detail', { status, headers: { 'content-type': type } }),
      );
      await expect(runProductionMonitor(f.config, f)).rejects.toMatchObject({
        code: 'public_entry_page_failed',
      });
      expect(f.fetch).toHaveBeenCalledTimes(2);
      expect(f.fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
    },
  );

  it('does not expose redirect or provider exception details', async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(Response.json(ready));
    f.fetch.mockRejectedValueOnce(new Error('https://other.test/?token=private-fixture'));
    await expect(runProductionMonitor(f.config, f)).rejects.toThrow('public_entry_page_failed');
    expect(JSON.stringify(f.log.mock.calls)).not.toContain('private-fixture');
  });

  it('only performs the explicit cleanup after all availability checks pass', async () => {
    const f = fixture({ apply: true, eligible: 1 });
    await expect(runProductionMonitor(f.config, f)).resolves.toMatchObject({
      removed: 1,
      apply: true,
    });
    expect(f.fetch.mock.calls.at(-1)).toEqual([
      'https://ecarteo.fr/api/maintenance/staged-uploads',
      expect.objectContaining({
        method: 'POST',
        headers: { authorization: 'Bearer ' + env.CLEANUP_TOKEN },
      }),
    ]);
    expect(f.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('fails a remaining cleanup backlog instead of reporting success', async () => {
    const f = fixture({ apply: true, eligible: 150, removed: 100, remaining: 50 });
    await expect(runProductionMonitor(f.config, f)).rejects.toMatchObject({
      code: 'cleanup_backlog_remaining',
    });
    expect(f.fetch.mock.calls.at(-1)?.[1]?.method).toBe('GET');
  });

  it('does not start new requests after its global deadline', async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort(new Error('private timeout context'));
    await expect(
      runProductionMonitor(f.config, { ...f, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'readiness_failed' });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.pause).not.toHaveBeenCalled();
  });

  it('fails the CLI with a sanitized status when the destination is unreviewed', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../scripts/check-production.mjs', import.meta.url))],
      {
        env: {
          ...process.env,
          ...env,
          ORIGIN: 'https://unreviewed.test/?private=fixture',
          APPLY: 'false',
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      event: 'production_monitor',
      status: 'unavailable',
      check: 'monitor_configuration_invalid',
    });
    expect(result.stdout + result.stderr).not.toContain(env.HEALTH_TOKEN);
    expect(result.stdout + result.stderr).not.toContain('private=fixture');
  });
});
