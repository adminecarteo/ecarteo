import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import type { Command, ScenarioDraft } from '@/domain/types';
import { CRITERIA } from '@/domain/reference';
import { scoringFingerprint } from '@/domain/commands';
import {
  countExpiredStagedUploads,
  removeExpiredStagedUploads,
} from '../scripts/lib/expired-staged-uploads.mjs';

vi.mock('server-only', () => ({}));
const objects = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          objects.set(path, new Uint8Array(bytes));
          return { error: null };
        },
        download: async (path: string) => ({
          error: objects.has(path) ? null : new Error('missing'),
          data: objects.has(path) ? new Blob([objects.get(path)! as BlobPart]) : null,
        }),
        remove: async (paths: string[]) => {
          for (const path of paths) objects.delete(path);
          return { error: null };
        },
      }),
    },
  }),
}));

import {
  executeWorkspaceCommand,
  loadWorkspace,
  uploadAttachment,
  getAttachment,
  deleteStagedAttachment,
} from '@/server/workspace';
import { closeWorkspaceDatabase } from '@/server/database';
import { commandSchema } from '@/server/command-schema';
import { consumeAuthAttempt } from '@/server/auth-rate-limit';

describe('production command boundary', () => {
  it('fails closed without database configuration', async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(loadWorkspace({ user: { id: randomUUID() } })).rejects.toMatchObject({
        status: 503,
        code: 'DATABASE_NOT_CONFIGURED',
      });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
  it('rejects injected actor/tenant keys and inline data URLs', () => {
    expect(
      commandSchema.safeParse({
        type: 'mission.timer',
        id: randomUUID(),
        running: true,
        actor: { role: 'qualite' },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'mission.create',
        scenarioId: randomUUID(),
        date: '2026-12-01',
        operator: 'Inès B.',
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'evidence.add',
        missionId: randomUUID(),
        evidence: { type: 'capture', label: 'image', text: '', img: 'data:image/png;base64,AAAA' },
      }).success,
    ).toBe(false);
  });
});

const testUrl = process.env.ECARTEO_TEST_DATABASE_URL;
describe
  .skipIf(!testUrl)
  .sequential('transactional production workspace (disposable PostgreSQL)', () => {
    const ids = {
      quality: randomUUID(),
      operatorA: randomUUID(),
      operatorB: randomUUID(),
      clientA: randomUUID(),
      clientB: randomUUID(),
      tenantA: randomUUID(),
      tenantB: randomUUID(),
    };
    const account = (id: string) => ({ user: { id }, profile: { role: 'qualite' } }); // The injected profile is intentionally ignored.
    let db: ReturnType<typeof postgres>;
    let missionId: string;
    const run = (command: Command, user = ids.quality, key = randomUUID()) =>
      executeWorkspaceCommand(account(user), command, { idempotencyKey: key });
    const allScores = Object.fromEntries(CRITERIA.map(({ id }) => [id, 3])) as Extract<
      Command,
      { type: 'mission.score' }
    >['scores'];
    beforeAll(async () => {
      const parsed = new URL(testUrl!);
      if (!['localhost', '127.0.0.1'].includes(parsed.hostname))
        throw new Error('Use a disposable localhost database only.');
      process.env.DATABASE_URL = testUrl!;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://storage.example.invalid';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'integration-test-only';
      db = postgres(testUrl!, { max: 2, prepare: false });
      await db`insert into public.clients(id,name) values(${ids.tenantA},'Integration A'),(${ids.tenantB},'Integration B')`;
      for (const [key, id] of Object.entries(ids).filter(([key]) => !key.startsWith('tenant'))) {
        await db`insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values(${id},${`${key}@example.test`},null,false,'{}')`;
        const role =
          key === 'quality' ? 'qualite' : key.startsWith('operator') ? 'operateur' : 'client';
        const tenant = key === 'clientA' ? ids.tenantA : key === 'clientB' ? ids.tenantB : null;
        await db`insert into public.profiles(id,display_name,role,client_id) values(${id},${key.startsWith('operator') ? 'Duplicate operator name' : key},${role},${tenant})`;
        await db`update auth.users set email_confirmed_at=now() where id=${id}`;
      }
      const draft: ScenarioDraft = {
        clientId: ids.tenantA,
        title: 'Integration enquiry',
        family: 'info',
        objective: 'Check response',
        channels: ['phone'],
        lang: 'FR',
        persona: 'Internal persona',
        steps: [{ label: 'Call', seuil: '4 rings' }],
        evidence: ['calls'],
        limits: 'No booking',
      };
      const created = await run({ type: 'scenario.create', draft });
      await run({ type: 'scenario.approve', id: created.entityId! });
      const scheduled = await run({
        type: 'mission.create',
        scenarioId: created.entityId!,
        date: '2026-12-01',
        operator: ids.operatorA,
      });
      missionId = scheduled.entityId!;
    });
    afterAll(async () => {
      await closeWorkspaceDatabase();
      if (db) await db.end({ timeout: 5 });
    });

    it('loads empty real client workspaces and authenticates by UUID despite duplicate names', async () => {
      const own = await loadWorkspace(account(ids.operatorA));
      const other = await loadWorkspace(account(ids.operatorB));
      expect(own.actor).toMatchObject({ id: ids.operatorA, role: 'operateur' });
      expect(own.state.missions.map((m) => m.id)).toContain(missionId);
      expect(other.state.missions).toHaveLength(0);
      expect((await loadWorkspace(account(ids.clientA))).state.missions).toHaveLength(0);
      await expect(
        run({ type: 'mission.timer', id: missionId, running: true }, ids.operatorB),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        run({ type: 'scenario.approve', id: randomUUID() }, ids.clientA),
      ).rejects.toMatchObject({ status: 403 });
    });
    it('starts once across concurrent identical retries and protects stale notes', async () => {
      const key = randomUUID();
      const command: Command = { type: 'mission.timer', id: missionId, running: true };
      await Promise.all([run(command, ids.operatorA, key), run(command, ids.operatorA, key)]);
      const count =
        await db`select count(*)::integer as count from app_private.command_receipts where actor_id=${ids.operatorA} and idempotency_key=${key}`;
      expect(count[0].count).toBe(1);
      await expect(run({ ...command, running: false }, ids.operatorA, key)).rejects.toMatchObject({
        status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      });
      await run(
        {
          type: 'mission.step',
          id: missionId,
          index: 0,
          note: 'First observation',
          expectedNote: '',
          done: true,
        },
        ids.operatorA,
      );
      await expect(
        run(
          {
            type: 'mission.step',
            id: missionId,
            index: 0,
            note: 'Stale overwrite',
            expectedNote: '',
          },
          ids.operatorA,
        ),
      ).rejects.toMatchObject({ code: 'NOTE_CONFLICT' });
    });
    it('stages actual file bytes, binds ownership/mission and gates downloads through RLS', async () => {
      const file = new File(['Evidence body'], 'response.txt', { type: 'text/plain' });
      const uploaded = await uploadAttachment(account(ids.operatorA), missionId, file);
      await expect(getAttachment(account(ids.operatorA), uploaded.fileId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        run(
          {
            type: 'evidence.add',
            missionId,
            evidence: { type: 'fichier', label: 'Response', text: '', ...uploaded },
          },
          ids.operatorB,
        ),
      ).rejects.toMatchObject({ status: 403 });
      const added = await run(
        {
          type: 'evidence.add',
          missionId,
          evidence: { type: 'fichier', label: 'Response', text: 'Received', ...uploaded },
        },
        ids.operatorA,
      );
      expect(added.entityId).toBe(uploaded.fileId);
      expect(
        new TextDecoder().decode(
          (await getAttachment(account(ids.operatorA), uploaded.fileId)).bytes,
        ),
      ).toBe('Evidence body');
      await expect(getAttachment(account(ids.clientA), uploaded.fileId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        deleteStagedAttachment(account(ids.operatorA), uploaded.fileId),
      ).rejects.toMatchObject({ status: 404 });
      const staged = await uploadAttachment(
        account(ids.operatorA),
        missionId,
        new File(['orphan'], 'pending.txt', { type: 'text/plain' }),
      );
      await deleteStagedAttachment(account(ids.operatorA), staged.fileId);
      expect([...objects.keys()].some((key) => key.endsWith(staged.fileId))).toBe(false);
    });
    it('removes only expired unlinked uploads, preserving locked, linked and failed reservations', async () => {
      const stage = (name: string) =>
        uploadAttachment(
          account(ids.operatorA),
          missionId,
          new File([name], name + '.txt', { type: 'text/plain' }),
        );
      const expired = await stage('expired-cleanup-fixture');
      const live = await stage('live-cleanup-fixture');
      const [linked] =
        await db`select * from public.evidence where mission_id=${missionId} and object_path is not null limit 1`;
      // Simulate an inconsistent duplicate reservation left alongside committed evidence.
      await db`insert into app_private.staged_attachments(id,client_id,mission_id,owner_id,object_path,filename,mime_type,size_bytes,sha256,created_at)
        select id,client_id,mission_id,uploaded_by,object_path,filename,mime_type,size_bytes,sha256,now()-interval '25 hours' from public.evidence where id=${linked.id}`;
      await db`update app_private.staged_attachments set created_at=now()-interval '25 hours' where id=${expired.fileId}`;
      const path = ids.tenantA + '/' + missionId + '/' + expired.fileId;
      try {
        expect(await countExpiredStagedUploads(db)).toBe(1);
        await expect(
          removeExpiredStagedUploads(db, async (paths) => {
            expect(paths).toEqual([path]);
            throw Error('Storage unavailable');
          }),
        ).rejects.toThrow('Storage unavailable');
        expect(await countExpiredStagedUploads(db)).toBe(1);
        const [first, concurrent] = await db.begin(async (tx) => {
          await tx`select id from app_private.staged_attachments where id=${expired.fileId} for update`;
          const remove = vi.fn(async () => {});
          const skipped = await removeExpiredStagedUploads(db, remove);
          return [skipped, remove.mock.calls.length];
        });
        expect([first, concurrent]).toEqual([0, 0]);
        const remove = vi.fn(async (paths: string[]) => {
          expect(paths).toEqual([path]);
          paths.forEach((item) => objects.delete(item));
        });
        expect(await removeExpiredStagedUploads(db, remove)).toBe(1);
        expect(await removeExpiredStagedUploads(db, remove)).toBe(0);
        expect(remove).toHaveBeenCalledTimes(1);
        expect(objects.has(linked.object_path)).toBe(true);
        expect(
          await db`select id from app_private.staged_attachments where id=any(${[live.fileId, linked.id]}::uuid[])`,
        ).toHaveLength(2);
      } finally {
        await db`delete from app_private.staged_attachments where id=any(${[expired.fileId, live.fileId, linked.id]}::uuid[])`;
      }
    });
    it('retains incomplete and excluded action drafts across fresh reads for quality only and rejects stale reviewers', async () => {
      await run({ type: 'mission.submit', id: missionId }, ids.operatorA);
      const before = (await loadWorkspace(account(ids.quality))).state.missions.find(
        (m) => m.id === missionId,
      )!;
      const save: Extract<Command, { type: 'mission.score' }> = {
        type: 'mission.score',
        id: missionId,
        scores: { vitesse: 1 },
        comments: {},
        critical: false,
        draftActions: [
          {
            critId: 'vitesse',
            horizon: 90,
            text: 'Review response time',
            owner: 'Reception',
            include: true,
          },
          { critId: 'dispo', horizon: 30, text: 'Draft only', owner: '', include: false },
        ],
        expectedScoringFingerprint: scoringFingerprint(before),
      };
      await run(save);
      const first = (await loadWorkspace(account(ids.quality))).state.missions.find(
        (m) => m.id === missionId,
      )!;
      expect(first.scoringDraft).toEqual({ revision: 1, actions: save.draftActions });
      const renamed = {
        ...save,
        draftActions: save.draftActions!.map((a) => ({ ...a, owner: 'Duty manager' })),
        expectedScoringFingerprint: scoringFingerprint(first),
      };
      await run(renamed);
      await expect(run({ ...renamed, draftActions: [] })).rejects.toMatchObject({
        code: 'SCORING_CONFLICT',
      });
      await expect(
        run({ ...renamed, expectedScoringFingerprint: undefined }),
      ).rejects.toMatchObject({ code: 'SCORING_CONFLICT' });
      await expect(run(renamed, ids.operatorA)).rejects.toMatchObject({ status: 403 });
      expect(
        (await loadWorkspace(account(ids.operatorA))).state.missions.find(
          (m) => m.id === missionId,
        ),
      ).not.toHaveProperty('scoringDraft');
      await db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub',${ids.operatorA},true),set_config('request.jwt.claims',${JSON.stringify({ sub: ids.operatorA, role: 'authenticated' })},true)`;
        await tx.unsafe('set local role authenticated');
        expect(
          await tx`select * from app_private.scoring_action_drafts where mission_id=${missionId}`,
        ).toHaveLength(0);
      });
    });
    it('approves atomically exactly once, isolates client results, and never rewrites client-safe snapshots on action completion', async () => {
      const current = (await loadWorkspace(account(ids.quality))).state.missions.find(
        (m) => m.id === missionId,
      )!;
      const approval: Command = {
        type: 'mission.approve',
        id: missionId,
        scores: allScores,
        comments: { dispo: 'Answered promptly' },
        critical: false,
        expectedScoringFingerprint: scoringFingerprint(current),
        actions: [
          { critId: 'vitesse', horizon: 7, text: 'Document the target', owner: 'Reception' },
        ],
      };
      const key = randomUUID();
      await Promise.all([run(approval, ids.quality, key), run(approval, ids.quality, key)]);
      const own = await loadWorkspace(account(ids.clientA)),
        other = await loadWorkspace(account(ids.clientB));
      expect(own.state.missions).toHaveLength(1);
      expect(other.state.missions).toHaveLength(0);
      expect(own.state.missions[0]).not.toHaveProperty('scoringDraft');
      expect(
        await db`select * from app_private.scoring_action_drafts where mission_id=${missionId}`,
      ).toHaveLength(0);
      expect(own.state.missions[0].scenarioSnapshot.persona).toBe('');
      expect(own.state.missions[0].log).toHaveLength(0);
      const before =
        await db`select scenario_snapshot,scores,status from public.missions where id=${missionId}`;
      const report =
        await db`select snapshot from public.published_reports where mission_id=${missionId}`;
      expect(report[0].snapshot.scenario).toMatchObject({
        persona: '',
        limits: '',
        steps: [],
        evidence: [],
      });
      await expect(db`insert into public.published_reports(mission_id,client_id,snapshot,score,published_by)
      values(${missionId},${ids.tenantA},${db.json({ scenario: { persona: 'Private operator script' } })},75,${ids.quality})`).rejects.toMatchObject(
        { code: '23514', constraint_name: 'published_report_client_safe' },
      );
      await db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub',${ids.clientA},true),set_config('request.jwt.claims',${JSON.stringify({ sub: ids.clientA, role: 'authenticated' })},true)`;
        await tx.unsafe('set local role authenticated');
        const direct =
          await tx`select snapshot from public.published_reports where mission_id=${missionId}`;
        expect(direct[0].snapshot.scenario).toMatchObject({
          persona: '',
          limits: '',
          steps: [],
          evidence: [],
        });
        await tx.unsafe('reset role');
      });
      const action = own.state.actions[0];
      await expect(
        run({ type: 'action.toggle', id: action.id, done: true }, ids.clientB),
      ).rejects.toMatchObject({ status: 404 });
      await run({ type: 'action.toggle', id: action.id, done: true }, ids.clientA);
      expect(
        await db`select scenario_snapshot,scores,status from public.missions where id=${missionId}`,
      ).toEqual(before);
      expect(
        await db`select snapshot from public.published_reports where mission_id=${missionId}`,
      ).toEqual(report);
      expect((await loadWorkspace(account(ids.clientA))).state.actions[0].done).toBe(true);
      expect(
        (
          await db`select count(*)::integer as count from public.actions where mission_id=${missionId}`
        )[0].count,
      ).toBe(1);
      const evidence = own.state.evidence[0];
      expect((await getAttachment(account(ids.clientA), evidence.fileId!)).filename).toBe(
        'response.txt',
      );
      await expect(getAttachment(account(ids.clientB), evidence.fileId!)).rejects.toMatchObject({
        status: 404,
      });
    });
    it('provisions only confirmed customers and ignores role/client metadata', async () => {
      const id = randomUUID();
      await db`insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
      values(${id},'new-signup@example.test',null,false,${db.json({ role: 'qualite', client_id: ids.tenantA, company_name: 'New Company', display_name: 'New Customer' })})`;
      expect((await db`select * from public.profiles where id=${id}`).length).toBe(0);
      await db`update auth.users set email_confirmed_at=now() where id=${id}`;
      const rows = await db`select role,client_id from public.profiles where id=${id}`;
      expect(rows[0].role).toBe('client');
      expect(rows[0].client_id).not.toBe(ids.tenantA);
      await db`update auth.users set email_confirmed_at=now() where id=${id}`;
      expect((await db`select * from public.profiles where id=${id}`).length).toBe(1);
      await db`update public.profiles set active=false where id=${id}`;
      await expect(loadWorkspace(account(id))).rejects.toMatchObject({ status: 403 });
    });
    it('rate limits normalized emails atomically across concurrent requests without raw email storage', async () => {
      const email = `${randomUUID()}@example.test`;
      const allowed = await Promise.all(
        Array.from({ length: 15 }, (_, index) =>
          consumeAuthAttempt(index % 2 ? ` ${email.toUpperCase()} ` : email),
        ),
      );
      expect(allowed.filter(Boolean)).toHaveLength(10);
      const rows =
        await db`select key_hash,attempts from app_private.auth_rate_limits where attempts=15`;
      expect(rows.some((row) => /^[0-9a-f]{64}$/.test(row.key_hash))).toBe(true);
    });
  });
