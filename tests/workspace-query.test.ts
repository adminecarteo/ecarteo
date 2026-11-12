import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { workspaceQueryParams, workspaceQuerySchema } from '@/lib/workspace-query';
import { SCENARIO_TEMPLATES, SECTOR_GUIDES } from '@/domain/scenario-library';
import { commandSchema } from '@/server/command-schema';
vi.mock('server-only', () => ({}));
import { decodeWorkspaceCursor } from '@/server/workspace-query';

describe('workspace pagination boundary', () => {
  it('bounds page sizes, search, and identifiers before database access', () => {
    for (const input of [
      { limit: 101 },
      { limit: 0 },
      { client: 'other-company' },
      { q: 'x'.repeat(121) },
    ])
      expect(workspaceQuerySchema.safeParse(input).success).toBe(false);
    expect(
      workspaceQuerySchema.parse(
        workspaceQueryParams(new URLSearchParams('view=rapport&client=all&q=hotel')),
      ),
    ).toMatchObject({ q: 'hotel', limit: 40 });
  });
  it('preserves submillisecond timestamps and rejects tampered cursor shapes', () => {
    const value = { at: '2026-11-09T12:10:20.123456Z', id: randomUUID(), kind: 'm' };
    expect(decodeWorkspaceCursor(Buffer.from(JSON.stringify(value)).toString('base64url'))).toEqual(
      value,
    );
    for (const raw of [
      'invalid',
      Buffer.from(JSON.stringify({ ...value, id: 'bad' })).toString('base64url'),
    ])
      expect(() => decodeWorkspaceCursor(raw)).toThrow();
  });
});
describe('operational starter library', () => {
  it('provides twelve usable draft commands across four sector review guides without preapproval', () => {
    expect(SCENARIO_TEMPLATES).toHaveLength(12);
    expect(new Set(SCENARIO_TEMPLATES.map((t) => t.id)).size).toBe(12);
    for (const sector of SECTOR_GUIDES)
      expect(SCENARIO_TEMPLATES.filter((t) => t.sector === sector.id)).toHaveLength(3);
    for (const template of SCENARIO_TEMPLATES)
      expect(
        commandSchema.safeParse({
          type: 'scenario.create',
          draft: { ...template.draft, clientId: randomUUID() },
        }).success,
      ).toBe(true);
  });
});
