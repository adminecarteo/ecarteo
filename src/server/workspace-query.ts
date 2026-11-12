import 'server-only';
import { z } from 'zod';
import type { Transaction } from './database';
import { WorkspaceError } from './workspace-errors';
import type { WorkspaceQuery, WorkspacePage, WorkspaceSummary } from '@/lib/workspace-query';

export interface WorkspaceSelection {
  missionIds: string[];
  scenarioIds: string[];
}
const cursorSchema = z.strictObject({
  at: z.string().datetime({ offset: true }),
  id: z.uuid(),
  kind: z.enum(['m', 's']),
});
export function decodeWorkspaceCursor(value?: string) {
  if (!value) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new WorkspaceError(
      400,
      'INVALID_CURSOR',
      'Le lien de pagination est invalide. Revenez au début.',
    );
  }
}

/** Caller must have entered the authenticated PostgreSQL role before this function. */
export async function selectWorkspacePage(
  tx: Transaction,
  query: WorkspaceQuery,
): Promise<{ selection: WorkspaceSelection; page: WorkspacePage }> {
  const cursor = decodeWorkspaceCursor(query.cursor);
  const tenant = query.client ?? null;
  const kind = query.view === 'scenarios' ? 's' : query.view ? 'm' : null;
  const statuses = ['tableau', 'rapport', 'retest'].includes(query.view ?? '')
    ? ['done']
    : query.view === 'notation'
      ? ['review', 'done']
      : [];
  const rows = await tx`
    with entries as (
      select s.id,s.created_at as at,'s'::text as kind,s.content->'title' as title,s.client_id,s.status::text as status
      from public.scenarios s
      union all
      select m.id,m.created_at,'m',m.scenario_snapshot->'title',m.client_id,m.status::text from public.missions m
      union all
      select r.mission_id,r.published_at,'m',r.snapshot->'scenario'->'title',r.client_id,'done'
      from public.published_reports r where not exists(select 1 from public.missions m where m.id=r.mission_id)
    ) select e.id,e.kind,to_char(e.at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at
    from entries e join public.clients c on c.id=e.client_id
    where (${tenant}::uuid is null or e.client_id=${tenant}::uuid)
      and (${kind}::text is null or e.kind=${kind})
      and (${statuses.length === 0} or e.status=any(${statuses}::text[]))
      and (${query.q}='' or strpos(lower(e.title::text||' '||c.name),lower(${query.q}))>0)
      and (${cursor?.at ?? null}::timestamptz is null or (e.at,e.id,e.kind)<(${cursor?.at ?? null}::timestamptz,${cursor?.id ?? null}::uuid,${cursor?.kind ?? null}::text))
    order by e.at desc,e.id desc,e.kind desc limit ${query.limit + 1}`;
  const visible = rows.slice(0, query.limit);
  const last = visible.at(-1);
  const missionIds = visible.filter((row) => row.kind === 'm').map((row) => String(row.id));
  const scenarioIds = visible.filter((row) => row.kind === 's').map((row) => String(row.id));
  if (query.id) {
    // RLS applies even when a caller guesses an ID outside their workspace.
    const focus =
      await tx`select id,'s' as kind from public.scenarios where id=${query.id} and (${tenant}::uuid is null or client_id=${tenant}::uuid)
      union all select id,'m' from public.missions where id=${query.id} and (${tenant}::uuid is null or client_id=${tenant}::uuid)
      union all select mission_id,'m' from public.published_reports where mission_id=${query.id} and (${tenant}::uuid is null or client_id=${tenant}::uuid)`;
    for (const row of focus) (row.kind === 's' ? scenarioIds : missionIds).push(String(row.id));
  }
  if (query.view === 'scenarios' && scenarioIds.length) {
    // Keep the planner useful without loading each scenario's entire mission history.
    const related = await tx`select recent.id from public.scenarios s cross join lateral (
      select m.id from public.missions m where m.scenario_id=s.id order by m.created_at desc,m.id desc limit 3
    ) recent where s.id=any(${scenarioIds}::uuid[])`;
    for (const row of related) missionIds.push(String(row.id));
  }
  const relations =
    await tx`select id,scenario_id,baseline_mission_id from public.missions where id=any(${missionIds}::uuid[])
    union all select mission_id,(snapshot->'scenario'->>'id')::uuid,(snapshot->>'baselineMissionId')::uuid from public.published_reports where mission_id=any(${missionIds}::uuid[])`;
  for (const row of relations) {
    scenarioIds.push(String(row.scenario_id));
    if (row.baseline_mission_id) missionIds.push(String(row.baseline_mission_id));
  }
  return {
    selection: { missionIds: [...new Set(missionIds)], scenarioIds: [...new Set(scenarioIds)] },
    page: {
      count: visible.length,
      limit: query.limit,
      hasPrevious: Boolean(cursor),
      nextCursor:
        rows.length > query.limit && last
          ? Buffer.from(JSON.stringify({ at: last.at, id: last.id, kind: last.kind })).toString(
              'base64url',
            )
          : null,
    },
  };
}

/** Aggregate only records visible through RLS, independently of the current list page. */
export async function summarizeWorkspace(
  tx: Transaction,
  client?: string,
): Promise<WorkspaceSummary> {
  const tenant = client ?? null;
  const [reports, activity, actions, months, criteria] = await Promise.all([
    tx`with r as (select * from public.published_reports where (${tenant}::uuid is null or client_id=${tenant}::uuid)), latest as (select distinct on (client_id) snapshot from r order by client_id,published_at desc,id desc)
      select (select count(*)::int from r) as completed,
      (select round(avg((snapshot->>'score')::numeric))::int from latest) as score,
      (select coalesce(avg(coalesce((snapshot->>'productionElapsedMs')::numeric,0))/3600000,0) from r) as hours`,
    tx`select count(*)::int as n from public.missions where status in ('doing','review') and (${tenant}::uuid is null or client_id=${tenant}::uuid)`,
    tx`select count(*) filter(where not done)::int as open,count(*) filter(where not done and horizon=7)::int as urgent,count(*) filter(where done)::int as completed from public.actions where (${tenant}::uuid is null or client_id=${tenant}::uuid)`,
    tx`select left(snapshot->>'date',7) as month,round(avg((snapshot->>'score')::numeric))::int as score from public.published_reports where (${tenant}::uuid is null or client_id=${tenant}::uuid) group by 1 order by 1 desc limit 12`,
    tx`select scores.key,round(avg(scores.value::numeric)*25)::int as value from public.published_reports r cross join lateral jsonb_each_text(r.snapshot->'scores') scores where (${tenant}::uuid is null or client_id=${tenant}::uuid) and scores.value is not null group by scores.key`,
  ]);
  return {
    completed: Number(reports[0].completed),
    inProgress: Number(activity[0].n),
    openActions: Number(actions[0].open),
    urgentActions: Number(actions[0].urgent),
    completedActions: Number(actions[0].completed),
    averageScore: reports[0].score == null ? null : Number(reports[0].score),
    averageHours: Number(reports[0].hours),
    months: months.map((r) => ({ month: String(r.month), score: Number(r.score) })).reverse(),
    criteria: Object.fromEntries(
      criteria.map((r) => [r.key, r.value == null ? null : Number(r.value)]),
    ),
  };
}
