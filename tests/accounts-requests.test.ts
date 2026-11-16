import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { invitationSchema, requestSchema, memberSchema } from '@/lib/accounts-requests-schema';
vi.mock('server-only', () => ({}));
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
  listTeam,
  listOrganizations,
  updateMember,
  createRequest,
  listRequests,
  reviewRequest,
} from '@/server/accounts-requests';
import { closeWorkspaceDatabase } from '@/server/database';
import { executeWorkspaceCommand, loadWorkspace } from '@/server/workspace';
import { scenarioFingerprint } from '@/domain/commands';
import type { Command } from '@/domain/types';
import { CRITERIA } from '@/domain/reference';

describe('account and intake schemas', () => {
  it('rejects role/tenant injection and privileged client input', () => {
    expect(
      invitationSchema.safeParse({
        email: 'person@example.test',
        role: 'qualite',
        clientId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      invitationSchema.safeParse({
        email: 'person@example.test',
        role: 'operateur',
        clientId: null,
        isClientAdmin: true,
      }).success,
    ).toBe(false);
    expect(requestSchema.safeParse({ ...requestInput(), clientId: randomUUID() }).success).toBe(
      false,
    );
    expect(
      memberSchema.safeParse({
        id: randomUUID(),
        displayName: 'Staff',
        role: 'qualite',
        active: true,
        isClientAdmin: false,
      }).success,
    ).toBe(false);
  });
  it('rejects duplicate channels, invalid dates and unbounded intake', () => {
    expect(
      requestSchema.safeParse({ ...requestInput(), channels: ['email', 'email'] }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...requestInput(), preferredDate: '2030-02-30' }).success,
    ).toBe(false);
    expect(requestSchema.safeParse({ ...requestInput(), brief: 'x'.repeat(5001) }).success).toBe(
      false,
    );
  });
});
function requestInput() {
  return {
    id: randomUUID(),
    title: 'Audit du parcours devis',
    sector: 'training',
    channels: ['email'],
    siteCount: 2,
    preferredDate: '2030-12-01',
    brief: 'Vérifier le parcours de demande de devis et les délais de réponse.',
  };
}
const testUrl = process.env.ECARTEO_TEST_DATABASE_URL;
describe.skipIf(!testUrl).sequential('team and intake transactions (disposable PostgreSQL)', () => {
  const ids = {
    quality: randomUUID(),
    clientA: randomUUID(),
    clientB: randomUUID(),
    operator: randomUUID(),
    reportOperator: randomUUID(),
    tenantA: randomUUID(),
    tenantB: randomUUID(),
  };
  let db: ReturnType<typeof postgres>;
  const newEmail = () => `${randomUUID()}@example.test`;
  async function identity(email: string, confirmed = true) {
    const id = randomUUID();
    await db`insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
      values(${id},${email},${confirmed ? new Date() : null},false,'{"role":"qualite","is_client_admin":true}')`;
    return id;
  }
  beforeAll(async () => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(testUrl!).hostname))
      throw new Error('Disposable localhost database only.');
    process.env.DATABASE_URL = testUrl!;
    process.env.APP_URL = 'http://127.0.0.1:3000';
    db = postgres(testUrl!, { max: 3, prepare: false });
    await db`insert into public.clients(id,name) values(${ids.tenantA},'Intake A'),(${ids.tenantB},'Intake B')`;
    for (const key of ['quality', 'clientA', 'clientB', 'operator', 'reportOperator'] as const) {
      const id = ids[key];
      const role =
        key === 'quality'
          ? 'qualite'
          : key === 'operator' || key === 'reportOperator'
            ? 'operateur'
            : 'client';
      const tenant = key === 'clientA' ? ids.tenantA : key === 'clientB' ? ids.tenantB : null;
      await db`insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values(${id},${newEmail()},null,false,'{}')`;
      await db`insert into public.profiles(id,display_name,role,client_id,is_client_admin) values(${id},${key},${role},${tenant},${role === 'client'})`;
      await db`update auth.users set email_confirmed_at=now() where id=${id}`;
    }
  });
  afterAll(async () => {
    await closeWorkspaceDatabase();
    if (db) await db.end({ timeout: 5 });
  });
  it('restricts team administration to quality, and never trusts supplied tenant data', async () => {
    await expect(listTeam(ids.clientA, {})).rejects.toMatchObject({ status: 403 });
    await expect(
      createInvitation(ids.operator, { email: newEmail(), role: 'qualite', clientId: null }),
    ).rejects.toMatchObject({ status: 403 });
    const team = await listTeam(ids.quality, { search: 'clientA' });
    expect(team.members.some((m) => m.id === ids.clientA)).toBe(true);
  });
  it('searches organization choices with bounded pages and a quality-only boundary', async () => {
    const prefix = `Directory ${randomUUID()}`;
    for (let index = 0; index < 30; index++)
      await db`insert into public.clients(name) values(${`${prefix} ${String(index).padStart(2, '0')}`})`;
    const first = await listOrganizations(ids.quality, { search: prefix, page: 1 });
    const second = await listOrganizations(ids.quality, { search: prefix, page: 2 });
    expect(first.clients).toHaveLength(25);
    expect(second.clients).toHaveLength(5);
    expect(first.total).toBe(30);
    expect(new Set([...first.clients, ...second.clients].map((c) => c.id)).size).toBe(30);
    await expect(listOrganizations(ids.clientA, {})).rejects.toMatchObject({ status: 403 });
  });
  it('holds invited signup outside any tenant until verified-email redemption; accepts once', async () => {
    const email = newEmail();
    const invite = await createInvitation(ids.quality, {
      email,
      role: 'client',
      clientId: ids.tenantA,
    });
    const token = new URL(invite.url).hash.slice(1);
    const user = await identity(email, false);
    await expect(
      acceptInvitation(user, { token, displayName: 'New member' }),
    ).rejects.toMatchObject({ status: 403 });
    await db`update auth.users set email_confirmed_at=now() where id=${user}`;
    expect(await db`select id from public.profiles where id=${user}`).toHaveLength(0);
    await expect(
      acceptInvitation(ids.clientB, { token, displayName: 'Wrong account' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
    await Promise.all([
      acceptInvitation(user, { token, displayName: 'New member' }),
      acceptInvitation(user, { token, displayName: 'New member' }),
    ]);
    const profile = (
      await db`select role,client_id,is_client_admin from public.profiles where id=${user}`
    )[0];
    expect(profile).toMatchObject({
      role: 'client',
      client_id: ids.tenantA,
      is_client_admin: false,
    });
    expect(
      await db`select id from app_private.account_events where target_id=${invite.id} and kind='invitation.accepted'`,
    ).toHaveLength(1);
    const stored = (
      await db`select token_hash from app_private.team_invitations where id=${invite.id}`
    )[0];
    expect(stored.token_hash).not.toBe(token);
    expect(stored.token_hash).toHaveLength(64);
  });
  it('revokes older invitation tokens and refuses expired links', async () => {
    const email = newEmail();
    const first = await createInvitation(ids.quality, { email, role: 'operateur', clientId: null });
    const second = await createInvitation(ids.quality, {
      email,
      role: 'operateur',
      clientId: null,
    });
    const user = await identity(email);
    await expect(
      acceptInvitation(user, { token: new URL(first.url).hash.slice(1), displayName: 'Auditor' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
    await db`update app_private.team_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where id=${second.id}`;
    await expect(
      acceptInvitation(user, { token: new URL(second.url).hash.slice(1), displayName: 'Auditor' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
    await revokeInvitation(ids.quality, { id: second.id });
  });
  it('does not move an existing customer into a different tenant or grant staff from metadata', async () => {
    const email = (await db`select email from auth.users where id=${ids.clientB}`)[0].email;
    await expect(
      createInvitation(ids.quality, { email, role: 'client', clientId: ids.tenantA }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_ALREADY_ASSIGNED' });
    const user = await identity(newEmail());
    const p = (await db`select role,is_client_admin from public.profiles where id=${user}`)[0];
    expect(p).toMatchObject({ role: 'client', is_client_admin: true });
  });
  it('blocks self-deactivation and stale profile edits; disabled members lose access', async () => {
    await expect(
      updateMember(ids.quality, {
        id: ids.quality,
        displayName: 'quality',
        active: false,
        isClientAdmin: false,
        expected: { displayName: 'quality', active: true, isClientAdmin: false },
      }),
    ).rejects.toMatchObject({ code: 'SELF_DISABLE' });
    await expect(
      updateMember(ids.quality, {
        id: ids.clientA,
        displayName: 'Changed',
        active: true,
        isClientAdmin: true,
        expected: { displayName: 'Old stale name', active: true, isClientAdmin: true },
      }),
    ).rejects.toMatchObject({ code: 'STALE_MEMBER' });
    await updateMember(ids.quality, {
      id: ids.operator,
      displayName: 'operator',
      active: false,
      isClientAdmin: false,
      expected: { displayName: 'operator', active: true, isClientAdmin: false },
    });
    await expect(listRequests(ids.operator, {})).rejects.toMatchObject({ status: 403 });
  });
  it('deduplicates concurrent intake retries and isolates request lists with RLS', async () => {
    const input = requestInput();
    await Promise.all([createRequest(ids.clientA, input), createRequest(ids.clientA, input)]);
    expect(await db`select id from public.audit_requests where id=${input.id}`).toHaveLength(1);
    await expect(
      createRequest(ids.clientA, { ...input, title: 'Different intent' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await listRequests(ids.clientA, {})).items.some((r) => r.id === input.id)).toBe(true);
    expect((await listRequests(ids.clientB, {})).items.some((r) => r.id === input.id)).toBe(false);
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub',${ids.clientB},true)`;
      await tx.unsafe('set local role authenticated');
      expect(await tx`select id from public.audit_requests where id=${input.id}`).toHaveLength(0);
    });
    await expect(
      reviewRequest(ids.clientB, { id: input.id, revision: 1, action: 'cancel' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      reviewRequest(ids.clientA, { id: input.id, revision: 1, action: 'accept' }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('converts an intake into exactly one same-tenant draft and rejects stale decisions', async () => {
    const input = requestInput();
    await createRequest(ids.clientA, input);
    const results = await Promise.allSettled([
      reviewRequest(ids.quality, { id: input.id, revision: 1, action: 'convert' }),
      reviewRequest(ids.quality, { id: input.id, revision: 1, action: 'convert' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const row = (await db`select * from public.audit_requests where id=${input.id}`)[0];
    expect(row.status).toBe('converted');
    expect(row.revision).toBe(2);
    const scenario = (await db`select * from public.scenarios where id=${row.scenario_id}`)[0];
    expect(scenario.client_id).toBe(ids.tenantA);
    expect(scenario.status).toBe('draft');
    expect(scenario.content.objective).toBe(input.brief);
    const account = { user: { id: ids.quality } };
    await expect(
      executeWorkspaceCommand(
        account,
        { type: 'scenario.approve', id: row.scenario_id },
        { idempotencyKey: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: 'STEP_REQUIRED' });
    const current = (
      await loadWorkspace(account, { view: 'scenarios', id: row.scenario_id })
    ).state.scenarios.find((s) => s.id === row.scenario_id)!;
    const draft = {
      clientId: current.clientId,
      title: current.title,
      family: current.family,
      objective: current.objective,
      channels: current.channels,
      lang: current.lang,
      persona: 'Identité fictive autorisée.',
      steps: [{ label: 'Envoyer la demande de test', seuil: 'Réponse dans le délai convenu.' }],
      evidence: ['emails'],
      limits: 'Aucun paiement ni engagement.',
    };
    const edit = {
      type: 'scenario.update' as const,
      id: current.id,
      draft,
      expectedFingerprint: scenarioFingerprint(current),
    };
    await executeWorkspaceCommand(account, edit, { idempotencyKey: randomUUID() });
    await expect(
      executeWorkspaceCommand(account, edit, { idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'SCENARIO_CONFLICT' });
    expect(
      (await db`select content from public.scenarios where id=${current.id}`)[0].content.persona,
    ).toBe('Identité fictive autorisée.');
    await executeWorkspaceCommand(
      account,
      { type: 'scenario.approve', id: current.id },
      { idempotencyKey: randomUUID() },
    );
    await expect(
      reviewRequest(ids.quality, {
        id: input.id,
        revision: 1,
        action: 'decline',
        note: 'Old review',
      }),
    ).rejects.toMatchObject({ code: 'STALE_REQUEST' });
  });
  describe('published reports on client requests', () => {
    const title = 'Report links ' + randomUUID();
    let requestId: string,
      scenarioId: string,
      original: string,
      second: string,
      retest: string,
      unpublished: string;
    const run = (command: Command, user = ids.quality) =>
      executeWorkspaceCommand({ user: { id: user } }, command, { idempotencyKey: randomUUID() });
    async function publish(id: string) {
      await run({ type: 'mission.timer', id, running: true }, ids.reportOperator);
      await run({ type: 'mission.submit', id, allowIncomplete: true }, ids.reportOperator);
      await run({
        type: 'mission.approve',
        id,
        scores: Object.fromEntries(CRITERIA.map((c) => [c.id, 3])),
        comments: {},
        critical: false,
        actions: [
          {
            critId: 'suivi',
            horizon: id === original ? 7 : 30,
            text: 'Assign a follow-up owner',
            owner: 'Reception',
          },
        ],
      });
    }
    beforeAll(async () => {
      const input = { ...requestInput(), title };
      requestId = input.id;
      await createRequest(ids.clientA, input);
      const result = await reviewRequest(ids.quality, {
        id: requestId,
        revision: 1,
        action: 'convert',
      });
      scenarioId = result.scenarioId!;
      const source = (
        await loadWorkspace({ user: { id: ids.quality } }, { view: 'scenarios', id: scenarioId })
      ).state.scenarios.find((s) => s.id === scenarioId)!;
      await run({
        type: 'scenario.update',
        id: scenarioId,
        expectedFingerprint: scenarioFingerprint(source),
        draft: {
          clientId: source.clientId,
          title,
          family: source.family,
          objective: source.objective,
          channels: source.channels,
          lang: source.lang,
          persona: 'Test visitor',
          steps: [{ label: 'Submit test form', seuil: 'Confirmation appears' }],
          evidence: [],
          limits: 'No external contact.',
        },
      });
      await run({ type: 'scenario.approve', id: scenarioId });
      const schedule = async () =>
        (
          await run({
            type: 'mission.create',
            scenarioId,
            operator: ids.reportOperator,
            date: '2026-11-16',
          })
        ).entityId!;
      original = await schedule();
      await publish(original);
      second = await schedule();
      await publish(second);
      retest = (await run({ type: 'mission.retest', id: original })).entityId!;
      await publish(retest);
      unpublished = await schedule();
      for (const user of [ids.clientA, ids.clientB]) {
        const other = { ...requestInput(), title };
        await createRequest(user, other);
        await reviewRequest(ids.quality, { id: other.id, revision: 1, action: 'convert' });
      }
    });
    it('links the original, another published mission and the linked retest with matching status filters and totals', async () => {
      const page = await listRequests(ids.clientA, { search: title, status: 'published' });
      expect(page.total).toBe(1);
      const [item] = page.items;
      expect(item).toMatchObject({ id: requestId, status: 'published', scenarioId: null });
      expect(item.publishedReports.map((r) => r.missionId)).toEqual([retest, second, original]);
      expect(item.publishedReports[0].isRetest).toBe(true);
      expect(item.publishedReports[2].isRetest).toBe(false);
      const pending = await listRequests(ids.clientA, { search: title, status: 'converted' });
      expect(pending.total).toBe(1);
      expect(pending.items[0].publishedReports).toEqual([]);
    });
    it('keeps unpublished mission IDs, other organizations and operator access out of client report links', async () => {
      const own = await listRequests(ids.clientA, { search: title });
      expect(JSON.stringify(own)).not.toContain(unpublished);
      expect(JSON.stringify(own)).not.toContain(scenarioId);
      const other = await listRequests(ids.clientB, { search: title });
      expect(other.total).toBe(1);
      expect(other.items[0].publishedReports).toEqual([]);
      expect((await listRequests(ids.clientB, { search: title, status: 'published' })).total).toBe(
        0,
      );
      await expect(listRequests(ids.reportOperator, { status: 'published' })).rejects.toMatchObject(
        {
          status: 403,
        },
      );
    });
    it('finds the client’s latest publication and earliest outstanding action even outside the workspace page', async () => {
      const account = { user: { id: ids.clientA } };
      const query = { view: 'tableau', limit: 1, q: 'unmatched workspace search' } as const;
      const first = await loadWorkspace(account, query);
      expect(first.state.missions).toHaveLength(0);
      const overview = first.summary!.clientDashboard!;
      expect(overview.reports.map((report) => report.missionId)).toEqual([
        original,
        second,
        retest,
      ]);
      expect(overview.nextAction).toMatchObject({ missionId: original, owner: 'Reception' });
      await run({ type: 'action.toggle', id: overview.nextAction!.id, done: true }, ids.clientA);
      const next = await loadWorkspace(account, query);
      expect(next.summary?.clientDashboard?.nextAction?.missionId).toBe(second);
      const other = await loadWorkspace(
        { user: { id: ids.clientB } },
        { ...query, client: ids.tenantA },
      );
      expect(other.summary?.clientDashboard).toEqual({ reports: [], nextAction: null });
      for (const staff of [ids.quality, ids.reportOperator]) {
        expect(
          (await loadWorkspace({ user: { id: staff } }, query)).summary?.clientDashboard,
        ).toBeUndefined();
      }
    });
  });
  it('lets a customer cancel pending intake but not an accepted request', async () => {
    const input = requestInput();
    await createRequest(ids.clientA, input);
    await reviewRequest(ids.clientA, { id: input.id, revision: 1, action: 'cancel' });
    expect(
      (await db`select status from public.audit_requests where id=${input.id}`)[0].status,
    ).toBe('cancelled');
    const accepted = requestInput();
    await createRequest(ids.clientA, accepted);
    await reviewRequest(ids.quality, {
      id: accepted.id,
      revision: 1,
      action: 'accept',
      note: 'Périmètre accepté.',
    });
    await expect(
      reviewRequest(ids.clientA, { id: accepted.id, revision: 2, action: 'cancel' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
