import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { applyCommand, DomainError } from '@/domain/commands';
import { CRITERIA } from '@/domain/reference';
import type {
  Actor,
  AppState,
  Command,
  CorrectiveAction,
  Evidence,
  Mission,
  PublishedReport,
  Role,
  Scenario,
} from '@/domain/types';
import { workspaceSchema } from '@/lib/state-schema';
import { attachmentType, validateAttachment } from '@/lib/attachment-validation';
import { commandSchema, idempotencyKeySchema } from './command-schema';
import { database, type Transaction } from './database';
import { WorkspaceError } from './workspace-errors';
import {
  workspaceQuerySchema,
  type WorkspaceQueryInput,
  type WorkspacePage,
  type WorkspaceSummary,
} from '@/lib/workspace-query';
import {
  clientDashboardSummary,
  selectWorkspacePage,
  summarizeWorkspace,
  decodeWorkspaceCursor,
  type WorkspaceSelection,
} from './workspace-query';
export { WorkspaceError } from './workspace-errors';

export interface WorkspaceAccount {
  user: { id: string; email?: string };
  profile?: unknown;
}
interface Profile {
  id: string;
  role: Role;
  display_name: string;
  client_id: string | null;
  active: boolean;
}
type Row = Record<string, unknown>;
type Roster = { id: string; name: string }[];
interface Loaded {
  state: AppState;
  actor: Actor;
  operators: Roster;
  page?: WorkspacePage;
  summary?: WorkspaceSummary;
}
const BUCKET = 'ecarteo-evidence';
const asISO = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
const nullableISO = (value: unknown) => (value == null ? null : asISO(value));
const jsonChanged = (before: unknown, after: unknown) =>
  JSON.stringify(before) !== JSON.stringify(after);
function actorFor(profile: Profile): Actor {
  return {
    id: profile.id,
    role: profile.role,
    name: profile.display_name,
    ...(profile.client_id ? { clientId: profile.client_id } : {}),
  };
}

async function trustedProfile(tx: Transaction, account: WorkspaceAccount): Promise<Profile> {
  if (!idempotencyKeySchema.safeParse(account.user.id).success)
    throw new WorkspaceError(401, 'UNAUTHENTICATED', 'Authentification requise.');
  const rows =
    await tx`select p.id,p.role,p.display_name,p.client_id,p.active from public.profiles p
    join auth.users u on u.id=p.id where p.id=${account.user.id} and p.active
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)`;
  if (!rows[0])
    throw new WorkspaceError(
      403,
      'ACCOUNT_UNAVAILABLE',
      'Compte confirmé et actif requis. / An active, confirmed account is required.',
    );
  return rows[0] as Profile;
}
async function enterReadRole(tx: Transaction, profile: Profile) {
  await tx`select set_config('request.jwt.claim.sub',${profile.id},true),
    set_config('request.jwt.claims',${JSON.stringify({ sub: profile.id, role: 'authenticated', is_anonymous: false })},true)`;
  await tx.unsafe('set local role authenticated');
}
function safeReport(report: PublishedReport): PublishedReport {
  const copy = structuredClone(report);
  copy.scenario = { ...copy.scenario, persona: '', limits: '', steps: [], evidence: [] };
  return copy;
}
async function readState(
  tx: Transaction,
  profile: Profile,
  tenant: string | null = null,
  selection?: WorkspaceSelection,
): Promise<Loaded> {
  const limited = Boolean(selection);
  const missionIds = selection?.missionIds ?? [];
  const scenarioIds = selection?.scenarioIds ?? [];
  await enterReadRole(tx, profile);
  try {
    const [clients, scenarios, missions, reports, evidence, actions, events, operators] =
      await Promise.all([
        tx`select id,name,site_count from public.clients where (${tenant}::uuid is null or id=${tenant}::uuid) order by name`,
        tx`select * from public.scenarios where (${tenant}::uuid is null or client_id=${tenant}::uuid) and (not ${limited} or id=any(${scenarioIds}::uuid[]) or id in(select scenario_id from public.missions where id=any(${missionIds}::uuid[]))) order by created_at,id`,
        tx`select m.*,p.display_name as operator_name,v.display_name as validator_name,
        d.revision as scoring_draft_revision,d.actions as scoring_draft_actions from public.missions m
        left join app_private.scoring_action_drafts d on d.mission_id=m.id
        left join public.profiles p on p.id=m.operator_id left join public.profiles v on v.id=m.validated_by
        where (${tenant}::uuid is null or m.client_id=${tenant}::uuid) and (not ${limited} or m.id=any(${missionIds}::uuid[])) order by m.created_at,m.id`,
        tx`select * from public.published_reports where (${tenant}::uuid is null or client_id=${tenant}::uuid) and (not ${limited} or mission_id=any(${missionIds}::uuid[])) order by published_at,id`,
        tx`select * from public.evidence where (${tenant}::uuid is null or client_id=${tenant}::uuid) and (not ${limited} or mission_id=any(${missionIds}::uuid[])) order by uploaded_at,id`,
        tx`select a.*,p.display_name as completer_name from public.actions a left join public.profiles p on p.id=a.completed_by
        where (${tenant}::uuid is null or a.client_id=${tenant}::uuid) and (not ${limited} or a.mission_id=any(${missionIds}::uuid[])) order by a.created_at,a.id`,
        tx`select * from public.mission_events where (${tenant}::uuid is null or client_id=${tenant}::uuid) and (not ${limited} or mission_id=any(${missionIds}::uuid[])) order by created_at,event_sequence`,
        tx`select id,display_name from public.profiles where role='operateur' and active order by display_name,id`,
      ]);
    const snapshots = new Map(
      reports.map((row) => [
        String(row.mission_id),
        row.snapshot as PublishedReport & {
          baselineMissionId?: string;
          productionElapsedMs?: number;
        },
      ]),
    );
    const mappedScenarios = scenarios.map((row) => ({
      ...(row.content as Scenario),
      id: String(row.id),
      clientId: String(row.client_id),
      parentId: row.parent_id ? String(row.parent_id) : null,
      status: row.status,
      createdAt: asISO(row.created_at),
    })) as Scenario[];
    const mappedMissions: Mission[] = missions.map((row) => ({
      id: String(row.id),
      scenarioId: String(row.scenario_id),
      scenarioSnapshot: row.scenario_snapshot as Scenario,
      criteriaVersion: String(row.criteria_version),
      baselineMissionId: row.baseline_mission_id ? String(row.baseline_mission_id) : null,
      date: asISO(row.scheduled_at),
      operator: String(row.operator_name || 'Opérateur'),
      operatorId: String(row.operator_id),
      status: row.status as Mission['status'],
      elapsed: Number(row.elapsed_ms),
      runningSince: row.running_since ? new Date(asISO(row.running_since)).getTime() : null,
      steps: row.steps as Mission['steps'],
      scores: row.scores as Mission['scores'],
      comments: row.comments as Mission['comments'],
      ...(row.scoring_draft_revision
        ? {
            scoringDraft: {
              revision: Number(row.scoring_draft_revision),
              actions: row.scoring_draft_actions as NonNullable<Mission['scoringDraft']>['actions'],
            },
          }
        : {}),
      critical: Boolean(row.critical),
      validatedBy: row.validated_by
        ? String(snapshots.get(String(row.id))?.validatedBy || row.validator_name || 'Qualité')
        : null,
      validatedAt: nullableISO(row.validated_at),
      reportSnapshot: snapshots.get(String(row.id)) || null,
      log: events
        .filter((entry) => entry.mission_id === row.id)
        .map((entry) => ({
          at: asISO(entry.created_at),
          text: (entry.payload as { text: Mission['log'][number]['text'] }).text,
        })),
    }));
    if (profile.role === 'client') {
      for (const raw of snapshots.values()) {
        const report = safeReport(raw);
        mappedMissions.push({
          id: report.missionId,
          scenarioId: report.scenario.id,
          scenarioSnapshot: report.scenario,
          criteriaVersion: report.criteriaVersion,
          baselineMissionId: raw.baselineMissionId || null,
          date: report.date,
          operator: report.operator,
          status: 'done',
          elapsed: raw.productionElapsedMs || 0,
          runningSince: null,
          steps: [],
          log: [],
          scores: report.scores,
          comments: report.comments,
          critical: report.critical,
          validatedBy: report.validatedBy,
          validatedAt: report.validatedAt,
          reportSnapshot: report,
        });
        if (!mappedScenarios.some((scenario) => scenario.id === report.scenario.id))
          mappedScenarios.push(report.scenario);
      }
    }
    const mappedEvidence: Evidence[] = evidence.map((row) => ({
      id: String(row.id),
      missionId: String(row.mission_id),
      type: row.type as Evidence['type'],
      at: asISO(row.occurred_at),
      label: row.label as Evidence['label'],
      text: row.content as Evidence['text'],
      img: null,
      file: row.filename ? String(row.filename) : null,
      ...(row.object_path
        ? { fileId: String(row.id), mimeType: String(row.mime_type), size: Number(row.size_bytes) }
        : {}),
    }));
    const mappedActions: CorrectiveAction[] = actions.map((row) => ({
      id: String(row.id),
      missionId: String(row.mission_id),
      critId: row.criterion_id as CorrectiveAction['critId'],
      horizon: Number(row.horizon) as CorrectiveAction['horizon'],
      text: row.content as CorrectiveAction['text'],
      owner: row.owner_label as CorrectiveAction['owner'],
      dueAt: asISO(row.due_at),
      done: Boolean(row.done),
      completedAt: nullableISO(row.completed_at),
      completedBy: row.completed_by ? String(row.completer_name || 'Client') : null,
    }));
    const candidate: AppState = {
      version: 1,
      clients: clients.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        sites: Number(row.site_count),
      })),
      scenarios: mappedScenarios,
      missions: mappedMissions,
      evidence: mappedEvidence,
      actions: mappedActions,
    };
    const parsed = workspaceSchema.safeParse(candidate);
    if (!parsed.success)
      throw new WorkspaceError(
        500,
        'INVALID_PERSISTED_STATE',
        'Les données du serveur sont invalides. / Invalid server records.',
      );
    return {
      state: candidate,
      actor: actorFor(profile),
      operators: operators.map((row) => ({ id: String(row.id), name: String(row.display_name) })),
    };
  } finally {
    await tx.unsafe('reset role');
  }
}

export async function loadWorkspace(
  account: WorkspaceAccount,
  input: WorkspaceQueryInput = {},
): Promise<Loaded> {
  const parsed = workspaceQuerySchema.safeParse(input);
  if (!parsed.success)
    throw new WorkspaceError(400, 'INVALID_QUERY', 'Recherche ou pagination invalide.');
  const query = parsed.data;
  return database().begin('isolation level repeatable read read only', async (tx) => {
    const profile = await trustedProfile(tx, account);
    await enterReadRole(tx, profile);
    let selected: Awaited<ReturnType<typeof selectWorkspacePage>>;
    let summary: WorkspaceSummary;
    try {
      selected = await selectWorkspacePage(tx, query);
      summary = await summarizeWorkspace(tx, query.client);
      if (
        profile.role === 'client' &&
        profile.client_id &&
        (!query.view || query.view === 'tableau')
      ) {
        summary.clientDashboard = await clientDashboardSummary(
          tx,
          query.client ?? profile.client_id,
        );
      }
    } finally {
      await tx.unsafe('reset role');
    }
    return {
      ...(await readState(tx, profile, query.client ?? null, selected.selection)),
      page: selected.page,
      summary,
    };
  });
}
async function commandTenant(tx: Transaction, command: Command): Promise<string> {
  if (command.type === 'scenario.create') return command.draft.clientId;
  let rows;
  if (command.type.startsWith('scenario.') || command.type === 'mission.create') {
    const target =
      command.type === 'mission.create' ? command.scenarioId : 'id' in command ? command.id : '';
    rows = await tx`select client_id from public.scenarios where id=${target}::uuid`;
  } else if (command.type === 'action.toggle')
    rows = await tx`select client_id from public.actions where id=${command.id}::uuid`;
  else {
    const target =
      command.type === 'evidence.add' ? command.missionId : 'id' in command ? command.id : '';
    rows = await tx`select client_id from public.missions where id=${target}::uuid`;
  }
  if (!rows[0]) throw new WorkspaceError(404, 'NOT_FOUND', 'Élément introuvable.');
  return String(rows[0].client_id);
}
function authorizeCommand(profile: Profile, command: Command) {
  const permitted =
    profile.role === 'qualite' ||
    (profile.role === 'client' && command.type === 'action.toggle') ||
    (profile.role === 'operateur' &&
      ['mission.timer', 'mission.step', 'mission.submit', 'evidence.add'].includes(command.type));
  if (!permitted)
    throw new WorkspaceError(403, 'FORBIDDEN', 'Cette opération n’est pas autorisée.');
}
function hashCommand(command: Command) {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    return value;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(command)))
    .digest('hex');
}

async function persist(
  tx: Transaction,
  before: AppState,
  after: AppState,
  profile: Profile,
  command: Command,
  staged: Row | null,
) {
  const uid = profile.id;
  for (const scenario of after.scenarios) {
    const old = before.scenarios.find((entry) => entry.id === scenario.id);
    if (!old) {
      await tx`insert into public.scenarios(id,client_id,parent_id,status,content,created_by,created_at,approved_by,approved_at)
        values(${scenario.id},${scenario.clientId},${scenario.parentId},${scenario.status},${tx.json(scenario)},${uid},${scenario.createdAt},
        ${scenario.status === 'validated' ? uid : null},${scenario.approvedAt || null})`;
    } else if (jsonChanged(old, scenario)) {
      await tx`update public.scenarios set status=${scenario.status},content=${tx.json(scenario)},
        approved_by=${scenario.status === 'validated' ? uid : null},approved_at=${scenario.approvedAt || null} where id=${scenario.id}`;
    }
  }
  for (const mission of after.missions) {
    if (before.missions.some((entry) => entry.id === mission.id)) continue;
    if (!mission.operatorId)
      throw new WorkspaceError(422, 'INVALID_OPERATOR', 'Opérateur invalide.');
    await tx`insert into public.missions(id,client_id,scenario_id,scenario_snapshot,criteria_version,criteria_snapshot,baseline_mission_id,
      operator_id,scheduled_at,status,elapsed_ms,running_since,steps,scores,comments,critical,created_by)
      values(${mission.id},${mission.scenarioSnapshot.clientId},${mission.scenarioId},${tx.json(mission.scenarioSnapshot)},${mission.criteriaVersion},${tx.json(CRITERIA)},
      ${mission.baselineMissionId},${mission.operatorId},${mission.date},${mission.status},${mission.elapsed},${mission.runningSince ? new Date(mission.runningSince) : null},
      ${tx.json(mission.steps)},${tx.json(mission.scores)},${tx.json(mission.comments)},${mission.critical},${uid})`;
  }
  for (const evidence of after.evidence) {
    if (before.evidence.some((entry) => entry.id === evidence.id)) continue;
    const mission = after.missions.find((entry) => entry.id === evidence.missionId)!;
    await tx`insert into public.evidence(id,mission_id,client_id,type,label,content,occurred_at,uploaded_by,object_path,filename,mime_type,size_bytes,sha256)
      values(${evidence.id},${evidence.missionId},${mission.scenarioSnapshot.clientId},${evidence.type},${tx.json(evidence.label)},${tx.json(evidence.text)},${evidence.at},${uid},
      ${staged ? String(staged.object_path) : null},${evidence.file},${evidence.mimeType || null},${evidence.size || null},${staged ? String(staged.sha256) : null})`;
    if (staged)
      await tx`delete from app_private.staged_attachments where id=${String(staged.id)} and owner_id=${uid}`;
  }
  for (const action of after.actions) {
    const old = before.actions.find((entry) => entry.id === action.id);
    const mission = after.missions.find((entry) => entry.id === action.missionId)!;
    if (!old)
      await tx`insert into public.actions(id,mission_id,client_id,criterion_id,horizon,content,owner_label,due_at)
      values(${action.id},${action.missionId},${mission.scenarioSnapshot.clientId},${action.critId},${action.horizon},${tx.json(action.text)},${tx.json(action.owner)},${action.dueAt})`;
    else if (old.done !== action.done) {
      await tx`update public.actions set done=${action.done},completed_at=${action.completedAt},completed_by=${action.done ? uid : null} where id=${action.id}`;
      await tx`insert into public.mission_events(mission_id,client_id,actor_id,event_type,payload)
        values(${mission.id},${mission.scenarioSnapshot.clientId},${uid},'action.toggle',${tx.json({ text: { fr: action.done ? 'Action réalisée' : 'Action rouverte', en: action.done ? 'Action completed' : 'Action reopened' }, actionId: action.id })})`;
    }
  }
  for (const mission of after.missions) {
    const old = before.missions.find((entry) => entry.id === mission.id);
    if (old && jsonChanged(old, mission)) {
      if (old.status === 'done') continue; // action state lives outside the immutable mission/report.
      if (mission.scoringDraft && mission.scoringDraft.revision !== old.scoringDraft?.revision) {
        await tx`insert into app_private.scoring_action_drafts(mission_id,revision,actions)
          values(${mission.id},${mission.scoringDraft.revision},${tx.json(mission.scoringDraft.actions)})
          on conflict (mission_id) do update set revision=excluded.revision,actions=excluded.actions`;
      } else if (old.scoringDraft && !mission.scoringDraft) {
        await tx`delete from app_private.scoring_action_drafts where mission_id=${mission.id}`;
      }
      if (mission.status === 'done')
        await tx`update public.evidence set client_visible=true where mission_id=${mission.id}`;
      await tx`update public.missions set status=${mission.status},elapsed_ms=${mission.elapsed},running_since=${mission.runningSince ? new Date(mission.runningSince) : null},
        steps=${tx.json(mission.steps)},scores=${tx.json(mission.scores)},comments=${tx.json(mission.comments)},critical=${mission.critical},
        validated_by=${mission.status === 'done' ? uid : null},validated_at=${mission.validatedAt} where id=${mission.id}`;
    }
    if (mission.reportSnapshot && !old?.reportSnapshot) {
      await tx`insert into public.published_reports(mission_id,client_id,snapshot,score,critical,published_by,published_at)
        values(${mission.id},${mission.scenarioSnapshot.clientId},${tx.json({ ...safeReport(mission.reportSnapshot), baselineMissionId: mission.baselineMissionId, productionElapsedMs: mission.elapsed })},
        ${mission.reportSnapshot.score},${mission.critical},${uid},${mission.validatedAt})`;
    }
    for (const entry of mission.log.slice(old?.log.length || 0)) {
      await tx`insert into public.mission_events(mission_id,client_id,actor_id,event_type,payload,created_at)
        values(${mission.id},${mission.scenarioSnapshot.clientId},${uid},${command.type},${tx.json({ text: entry.text })},${entry.at})`;
    }
    if (
      old &&
      jsonChanged(old, mission) &&
      old.log.length === mission.log.length &&
      ['mission.score', 'mission.step'].includes(command.type)
    ) {
      await tx`insert into public.mission_events(mission_id,client_id,actor_id,event_type,payload)
        values(${mission.id},${mission.scenarioSnapshot.clientId},${uid},${command.type},${tx.json({ text: { fr: command.type === 'mission.score' ? 'Brouillon de notation enregistré' : 'Observation mise à jour', en: command.type === 'mission.score' ? 'Assessment draft saved' : 'Observation updated' } })})`;
    }
  }
}

export async function executeWorkspaceCommand(
  account: WorkspaceAccount,
  input: unknown,
  options: { idempotencyKey: string; query?: WorkspaceQueryInput },
): Promise<Loaded & { entityId?: string }> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success || !idempotencyKeySchema.safeParse(options.idempotencyKey).success)
    throw new WorkspaceError(400, 'INVALID_COMMAND', 'Commande ou clé de requête invalide.');
  const command = parsed.data;
  const responseQuery = workspaceQuerySchema.safeParse(options.query ?? {});
  if (!responseQuery.success)
    throw new WorkspaceError(400, 'INVALID_QUERY', 'Recherche ou pagination invalide.');
  decodeWorkspaceCursor(responseQuery.data.cursor);
  const hash = hashCommand(command);
  let entityId: string | undefined;
  try {
    entityId = await database().begin(async (tx) => {
      const profile = await trustedProfile(tx, account);
      authorizeCommand(profile, command);
      await tx`select pg_advisory_xact_lock(hashtextextended(${`command:${profile.id}:${options.idempotencyKey}`},1))`;
      const tenant = await commandTenant(tx, command);
      // Serialize only this tenant's changes. Different customer workspaces progress independently.
      await tx`select pg_advisory_xact_lock(hashtextextended(${tenant},0))`;
      const receipts =
        await tx`select request_sha256,result from app_private.command_receipts where actor_id=${profile.id} and idempotency_key=${options.idempotencyKey}`;
      if (receipts[0]) {
        if (receipts[0].request_sha256 !== hash)
          throw new WorkspaceError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Cette clé de requête a déjà été utilisée.',
          );
        return (receipts[0].result as { entityId?: string }).entityId;
      }
      // A mutation needs only its target aggregate, not the entire customer history.
      const selection: WorkspaceSelection = { missionIds: [], scenarioIds: [] };
      if (command.type.startsWith('scenario.') || command.type === 'mission.create') {
        if (command.type === 'mission.create') selection.scenarioIds.push(command.scenarioId);
        else if ('id' in command) selection.scenarioIds.push(command.id);
      } else if (command.type === 'action.toggle') {
        const rows = await tx`select mission_id from public.actions where id=${command.id}`;
        if (rows[0]) selection.missionIds.push(String(rows[0].mission_id));
      } else if (command.type === 'evidence.add') selection.missionIds.push(command.missionId);
      else if ('id' in command) selection.missionIds.push(command.id);
      const loaded = await readState(tx, profile, tenant, selection);
      let staged: Row | null = null;
      if (command.type === 'evidence.add') {
        if (command.evidence.fileId) {
          const rows =
            await tx`select * from app_private.staged_attachments where id=${command.evidence.fileId} and owner_id=${profile.id}
            and mission_id=${command.missionId} and client_id=${tenant} and created_at>now()-interval '24 hours' for update`;
          staged = rows[0] || null;
          if (!staged)
            throw new WorkspaceError(
              403,
              'INVALID_ATTACHMENT',
              'Fichier absent, expiré ou inaccessible.',
            );
          if (
            command.evidence.file !== staged.filename ||
            command.evidence.mimeType !== staged.mime_type ||
            command.evidence.size !== Number(staged.size_bytes)
          )
            throw new WorkspaceError(
              400,
              'INVALID_ATTACHMENT',
              'Les métadonnées du fichier ne correspondent pas.',
            );
        } else if (command.evidence.file || command.evidence.mimeType || command.evidence.size)
          throw new WorkspaceError(400, 'INVALID_ATTACHMENT', 'Un fichier téléversé est requis.');
      }
      const result = applyCommand(loaded.state, command, loaded.actor, {
        operators: loaded.operators,
        createId: (prefix) => (prefix === 'e' && staged ? String(staged.id) : randomUUID()),
      });
      await persist(tx, loaded.state, result.state, profile, command, staged);
      await tx`insert into app_private.command_receipts(actor_id,idempotency_key,command_type,request_sha256,result)
        values(${profile.id},${options.idempotencyKey},${command.type},${hash},${tx.json({ entityId: result.entityId || null })})`;
      return result.entityId;
    });
  } catch (error) {
    if (error instanceof DomainError)
      throw new WorkspaceError(
        error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'NOT_FOUND'
            ? 404
            : error.code.endsWith('CONFLICT')
              ? 409
              : 422,
        error.code,
        `${error.messages.fr} / ${error.messages.en}`,
      );
    throw error;
  }
  return {
    ...(await loadWorkspace(account, responseQuery.data)),
    ...(entityId ? { entityId } : {}),
  };
}

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new WorkspaceError(
      503,
      'STORAGE_NOT_CONFIGURED',
      'Le stockage sécurisé doit être configuré.',
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);
}
async function accessibleWorkingMission(tx: Transaction, profile: Profile, missionId: string) {
  if (profile.role === 'client')
    throw new WorkspaceError(403, 'FORBIDDEN', 'Cette opération n’est pas autorisée.');
  await enterReadRole(tx, profile);
  try {
    const rows =
      await tx`select id,client_id,status from public.missions where id=${missionId}::uuid`;
    if (!rows[0]) throw new WorkspaceError(404, 'NOT_FOUND', 'Mission introuvable.');
    if (!['todo', 'doing'].includes(String(rows[0].status)))
      throw new WorkspaceError(
        409,
        'INVALID_STATE',
        'Cette mission ne peut plus recevoir de fichiers.',
      );
    return rows[0];
  } finally {
    await tx.unsafe('reset role');
  }
}
export async function uploadAttachment(account: WorkspaceAccount, missionId: string, file: File) {
  if (!idempotencyKeySchema.safeParse(missionId).success)
    throw new WorkspaceError(400, 'INVALID_MISSION', 'Mission invalide.');
  try {
    await validateAttachment(file);
  } catch (error) {
    throw new WorkspaceError(
      400,
      'INVALID_FILE',
      error instanceof Error ? error.message : 'Fichier invalide.',
    );
  }
  const service = storage();
  const authorized = await database().begin(async (tx) => {
    const profile = await trustedProfile(tx, account);
    return { profile, mission: await accessibleWorkingMission(tx, profile, missionId) };
  });
  const fileId = randomUUID(),
    mimeType = attachmentType(file),
    path = `${authorized.mission.client_id}/${missionId}/${fileId}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  const upload = await service.upload(path, bytes, { contentType: mimeType, upsert: false });
  if (upload.error)
    throw new WorkspaceError(502, 'UPLOAD_FAILED', 'Le téléversement du fichier a échoué.');
  try {
    await database().begin(async (tx) => {
      const profile = await trustedProfile(tx, account);
      await tx`select pg_advisory_xact_lock(hashtextextended(${String(authorized.mission.client_id)},0))`;
      await accessibleWorkingMission(tx, profile, missionId);
      const pending =
        await tx`select count(*)::integer as count from app_private.staged_attachments where owner_id=${profile.id}`;
      if (Number(pending[0].count) >= 30)
        throw new WorkspaceError(429, 'UPLOAD_LIMIT', 'Trop de fichiers en attente.');
      await tx`insert into app_private.staged_attachments(id,client_id,mission_id,owner_id,object_path,filename,mime_type,size_bytes,sha256)
        values(${fileId},${String(authorized.mission.client_id)},${missionId},${profile.id},${path},${file.name},${mimeType},${file.size},${digest})`;
    });
  } catch (error) {
    await service.remove([path]);
    throw error;
  }
  return { fileId, file: file.name, mimeType, size: file.size };
}
export async function getAttachment(
  account: WorkspaceAccount,
  fileId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
  if (!idempotencyKeySchema.safeParse(fileId).success)
    throw new WorkspaceError(404, 'NOT_FOUND', 'Fichier introuvable.');
  const row = await database().begin(async (tx) => {
    const profile = await trustedProfile(tx, account);
    await enterReadRole(tx, profile);
    try {
      const rows =
        await tx`select object_path,filename,mime_type from public.evidence where id=${fileId} and object_path is not null`;
      if (!rows[0]) throw new WorkspaceError(404, 'NOT_FOUND', 'Fichier introuvable.');
      return rows[0];
    } finally {
      await tx.unsafe('reset role');
    }
  });
  const result = await storage().download(String(row.object_path));
  if (result.error || !result.data)
    throw new WorkspaceError(502, 'DOWNLOAD_FAILED', 'Le téléchargement du fichier a échoué.');
  return {
    bytes: new Uint8Array(await result.data.arrayBuffer()),
    mimeType: String(row.mime_type),
    filename: String(row.filename),
  };
}
export async function deleteStagedAttachment(
  account: WorkspaceAccount,
  fileId: string,
): Promise<void> {
  if (!idempotencyKeySchema.safeParse(fileId).success)
    throw new WorkspaceError(404, 'NOT_FOUND', 'Fichier introuvable.');
  await database().begin(async (tx) => {
    const profile = await trustedProfile(tx, account);
    const rows =
      await tx`select * from app_private.staged_attachments where id=${fileId} and owner_id=${profile.id} for update`;
    if (!rows[0]) throw new WorkspaceError(404, 'NOT_FOUND', 'Fichier en attente introuvable.');
    const result = await storage().remove([String(rows[0].object_path)]);
    if (result.error)
      throw new WorkspaceError(502, 'DELETE_FAILED', 'La suppression du fichier a échoué.');
    await tx`delete from app_private.staged_attachments where id=${fileId} and owner_id=${profile.id}`;
  });
}
