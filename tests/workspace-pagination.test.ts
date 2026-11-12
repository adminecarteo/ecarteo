import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
vi.mock('server-only', () => ({}));
import { loadWorkspace, executeWorkspaceCommand } from '@/server/workspace';
import { closeWorkspaceDatabase } from '@/server/database';
import { SCENARIO_TEMPLATES } from '@/domain/scenario-library';

const url = process.env.ECARTEO_TEST_DATABASE_URL;
describe.skipIf(!url)('bounded workspace history with real RLS', () => {
  let db: ReturnType<typeof postgres>;
  const quality = randomUUID(),
    client = randomUUID(),
    tenant = randomUUID(),
    otherTenant = randomUUID();
  const scenarioIds: string[] = [];
  const operator = randomUUID();
  const account = { user: { id: quality } };
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(url!).hostname))
      throw Error('Disposable localhost database required');
    process.env.DATABASE_URL = url!;
    db = postgres(url!, { max: 2, prepare: false });
    await db`insert into public.clients(id,name) values(${tenant},'Pagination hotel'),(${otherTenant},'Other tenant')`;
    for (const [id, role, cid] of [
      [quality, 'qualite', null],
      [client, 'client', otherTenant],
      [operator, 'operateur', null],
    ] as const) {
      await db`insert into auth.users(id,email) values(${id},${`${id}@pagination.test`})`;
      await db`insert into public.profiles(id,display_name,role,client_id) values(${id},'Pagination tester',${role},${cid})`;
      await db`update auth.users set email_confirmed_at=now() where id=${id}`;
    }
    for (let i = 0; i < 5; i++) {
      const result = await executeWorkspaceCommand(
        account,
        {
          type: 'scenario.create',
          draft: {
            ...SCENARIO_TEMPLATES[0].draft,
            clientId: tenant,
            title: `Pagination journey ${i}`,
          },
        },
        { idempotencyKey: randomUUID() },
      );
      scenarioIds.push(result.entityId!);
    }
    await db`update public.scenarios set created_at='2026-11-09T10:00:00.123456Z' where client_id=${tenant}`;
  });
  afterAll(async () => {
    await closeWorkspaceDatabase();
    if (db) await db.end({ timeout: 5 });
  });
  it('walks equal-timestamp keysets without duplication or omission', async () => {
    let cursor: string | undefined;
    const seen: string[] = [];
    do {
      const result = await loadWorkspace(account, { client: tenant, limit: 2, cursor });
      expect(result.state.scenarios.length).toBeLessThanOrEqual(2);
      seen.push(...result.state.scenarios.map((s) => s.id));
      cursor = result.page!.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.sort()).toEqual([...scenarioIds].sort());
  });
  it('searches on the server and includes an authorized deep-linked item outside the page', async () => {
    const found = await loadWorkspace(account, { client: tenant, q: 'journey 3', limit: 1 });
    expect(found.state.scenarios.map((s) => s.title)).toEqual(['Pagination journey 3']);
    const focus = await loadWorkspace(account, { client: tenant, id: scenarioIds[0], limit: 1 });
    expect(focus.state.scenarios.map((s) => s.id)).toContain(scenarioIds[0]);
    expect(focus.page?.count).toBe(1);
  });
  it('cannot leak another tenant through search, selection or summaries', async () => {
    const result = await loadWorkspace(
      { user: { id: client } },
      { client: tenant, id: scenarioIds[0], q: 'Pagination', limit: 100 },
    );
    expect(result.state.scenarios).toEqual([]);
    expect(result.state.missions).toEqual([]);
    expect(result.state.clients).toEqual([]);
    expect(result.summary).toMatchObject({ completed: 0, openActions: 0, averageScore: null });
  });
  it('mutates a deep-linked draft without reading or returning unrelated history', async () => {
    const result = await executeWorkspaceCommand(
      account,
      { type: 'scenario.approve', id: scenarioIds[0] },
      { idempotencyKey: randomUUID(), query: { client: tenant, id: scenarioIds[0], limit: 1 } },
    );
    expect(result.state.scenarios.find((s) => s.id === scenarioIds[0])?.status).toBe('validated');
    expect(result.state.scenarios.length).toBeLessThanOrEqual(2);
  });
  it('rejects invalid response pagination before any mutation is committed', async () => {
    const key = randomUUID();
    await expect(
      executeWorkspaceCommand(
        account,
        { type: 'scenario.approve', id: scenarioIds[1] },
        { idempotencyKey: key, query: { cursor: 'broken' } },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    const rows = await db`select status from public.scenarios where id=${scenarioIds[1]}`;
    expect(rows[0].status).toBe('draft');
    expect(
      await db`select idempotency_key from app_private.command_receipts where actor_id=${quality} and idempotency_key=${key}`,
    ).toHaveLength(0);
  });
  it('does not let newer drafts crowd reports out of their history page', async () => {
    const scenarioPage = await loadWorkspace(account, {
      client: tenant,
      view: 'scenarios',
      limit: 2,
    });
    expect(scenarioPage.page?.count).toBe(2);
    const reportPage = await loadWorkspace(account, { client: tenant, view: 'rapport', limit: 2 });
    expect(reportPage.page?.count).toBe(0);
    expect(reportPage.state.scenarios).toEqual([]);
  });
  it('includes a newly scheduled mission in its scenario planner and keeps totals independent of the report page', async () => {
    const result = await executeWorkspaceCommand(
      account,
      { type: 'mission.create', scenarioId: scenarioIds[0], operator, date: '2030-12-01' },
      {
        idempotencyKey: randomUUID(),
        query: { client: tenant, view: 'scenarios', id: scenarioIds[0], limit: 1 },
      },
    );
    expect(result.state.missions.map((m) => m.id)).toContain(result.entityId);
    await executeWorkspaceCommand(
      account,
      { type: 'mission.timer', id: result.entityId!, running: true },
      { idempotencyKey: randomUUID() },
    );
    const dashboard = await loadWorkspace(account, { client: tenant, view: 'tableau' });
    expect(dashboard.state.missions).toEqual([]);
    expect(dashboard.summary?.inProgress).toBe(1);
  });
});
