import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedState } from '@/domain/seed';
import {
  fetchWorkspace,
  getAttachment,
  saveAttachment,
  submitCommand,
  uncertainOutcome,
  WorkspaceApiError,
  SESSION_EXPIRED_EVENT,
} from '@/lib/workspace-client';
import { validateAttachment } from '@/lib/attachment-validation';

const command = { type: 'action.toggle' as const, id: 'a4', done: true };
const key = '31437590-1c83-43af-8dc0-38f828691360';
afterEach(() => vi.unstubAllGlobals());

describe('authenticated workspace transport', () => {
  it('hides an open workspace when the trusted account is disabled', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: 'Access disabled', code: 'ACCOUNT_DISABLED' }, { status: 403 }),
        ),
    );
    await expect(fetchWorkspace()).rejects.toMatchObject({ status: 403 });
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SESSION_EXPIRED_EVENT);
  });
  it('preserves the logical idempotency key when a caller retries an unknown result', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json({ state: createSeedState(), entityId: 'a4' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(submitCommand(command, key, 'en')).rejects.toMatchObject({ status: 0 });
    await expect(submitCommand(command, key, 'en')).resolves.toMatchObject({ entityId: 'a4' });
    const calls = fetcher.mock.calls.map(([, options]) => options as RequestInit);
    expect(calls.map((options) => JSON.parse(options.body as string).idempotencyKey)).toEqual([
      key,
      key,
    ]);
    expect(
      calls.every(
        (options) => options.credentials === 'same-origin' && options.cache === 'no-store',
      ),
    ).toBe(true);
    expect(new Headers(calls[1].headers).get('Accept-Language')).toBe('en');
  });

  it('retains status and safe error text from a rejected command', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: 'Observation changed in another tab.', code: 'NOTE_CONFLICT' },
            { status: 409 },
          ),
        ),
    );
    await expect(submitCommand(command, key)).rejects.toMatchObject({
      status: 409,
      code: 'NOTE_CONFLICT',
      message: 'Observation changed in another tab.',
    });
    expect(uncertainOutcome(new WorkspaceApiError('Conflict', 409))).toBe(false);
    expect(uncertainOutcome(new WorkspaceApiError('Unknown', 503))).toBe(true);
  });

  it('treats a malformed success body as an unknown outcome instead of enabling a duplicate retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>proxy failure</html>', { status: 200 })),
    );
    await expect(submitCommand(command, key)).rejects.toMatchObject({ status: 502 });
  });

  it('requires an authenticated actor and typed workspace response', async () => {
    const state = createSeedState();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          state,
          actor: { id: 'quality-user', role: 'qualite', name: 'Quality user' },
          operators: [{ id: 'operator-user', name: 'Auditor' }],
        }),
      ),
    );
    await expect(fetchWorkspace()).resolves.toMatchObject({
      actor: { id: 'quality-user' },
      operators: [{ id: 'operator-user' }],
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ state, actor: { name: 'Missing identity' }, operators: [] }),
        ),
    );
    await expect(fetchWorkspace()).rejects.toMatchObject({ status: 502 });
  });

  it('binds an uploaded file to its mission without sending a client-side role', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        fileId: 'attachment-id',
        file: 'evidence.txt',
        mimeType: 'text/plain',
        size: 5,
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      saveAttachment(new File(['proof'], 'evidence.txt', { type: 'text/plain' }), 'mission-id'),
    ).resolves.toMatchObject({ fileId: 'attachment-id' });
    const body = fetcher.mock.calls[0][1].body as FormData;
    expect(body.get('missionId')).toBe('mission-id');
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.has('actor')).toBe(false);
    expect(body.has('role')).toBe(false);
  });

  it('does not expose a missing attachment and preserves authorization failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Not found' }, { status: 404 })),
    );
    await expect(getAttachment('missing')).resolves.toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 })),
    );
    await expect(getAttachment('forbidden')).rejects.toMatchObject({ status: 403 });
  });

  it('rejects mismatched image signatures and supports EML with an empty browser MIME', async () => {
    await expect(
      validateAttachment(new File(['not an image'], 'evidence.png', { type: 'image/png' })),
    ).rejects.toThrow('format');
    await expect(
      validateAttachment(new File(['From: audit@example.test\n\nTest'], 'message.eml')),
    ).resolves.toBeUndefined();
    await expect(
      validateAttachment(new File(['<svg/>'], 'evidence.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('Unsupported');
  });
});
