import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { maintenanceDatabase, option, safeFailure, uuidPattern } from './ops-common.mjs';

// Internal administrator utility. Export files contain private operational data and must be
// reviewed/redacted before disclosure. Never expose this script as a public API.
const action = process.argv[2];
const apply = process.argv.includes('--apply');
let db;
try {
  db = maintenanceDatabase();
  const operator = option('--operator-reference');
  if (!operator || operator.length > 200)
    throw new Error('Administrative ticket/operator reference required');
  if (action === 'open') {
    const clientId = option('--client');
    const kind = option('--kind');
    const reference = option('--reference');
    if (
      !uuidPattern.test(clientId || '') ||
      !['access', 'correction', 'erasure'].includes(kind) ||
      !reference ||
      reference.length > 200
    )
      throw new Error('Client, kind and verified request reference required');
    const [client] = await db`select id from public.clients where id=${clientId}`;
    if (!client) throw new Error('Unknown client');
    if (apply) {
      const id = await db.begin(async (tx) => {
        const [item] =
          await tx`insert into app_private.privacy_cases(client_id,kind,reference) values(${clientId},${kind},${reference}) returning id`;
        await tx`insert into app_private.operations_events(case_id,operation,operator_reference) values(${item.id},'case.open',${operator})`;
        return item.id;
      });
      console.log(JSON.stringify({ event: 'privacy_case_opened', caseId: id }));
    } else
      console.log('Dry run: verified tenant exists. Add --apply to open the administrative case.');
  } else if (['plan', 'export', 'close', 'addendum'].includes(action)) {
    const id = option('--case');
    if (!uuidPattern.test(id || '')) throw new Error('Case UUID required');
    const [item] = await db`select * from app_private.privacy_cases where id=${id}`;
    if (!item) throw new Error('Unknown case');
    const tables = [
      'clients',
      'profiles',
      'scenarios',
      'missions',
      'published_reports',
      'report_addenda',
      'evidence',
      'actions',
      'mission_events',
      'audit_requests',
    ];
    if (action === 'addendum') {
      const missionId = option('--mission');
      const textFile = option('--text-file');
      if (
        item.kind !== 'correction' ||
        item.status !== 'open' ||
        !uuidPattern.test(missionId || '') ||
        !textFile
      )
        throw new Error('Open correction case, mission and approved text file required');
      const body = (await readFile(resolve(textFile), 'utf8')).trim();
      if (!body || body.length > 10000) throw new Error('Addendum must contain 1–10000 characters');
      await db.begin(async (tx) => {
        const [openCase] =
          await tx`select id from app_private.privacy_cases where id=${id} and kind='correction' and status='open' for update`;
        if (!openCase) throw new Error('Correction case was closed; refresh before continuing');
        const [report] =
          await tx`select mission_id from public.published_reports where mission_id=${missionId} and client_id=${item.client_id}`;
        if (!report) throw new Error('Report does not belong to this case tenant');
        if (apply) {
          const rows =
            await tx`insert into public.report_addenda(mission_id,client_id,case_id,body) values(${missionId},${item.client_id},${id},${body}) on conflict(case_id,mission_id) do nothing returning id`;
          if (!rows.length) {
            const [existing] =
              await tx`select body from public.report_addenda where case_id=${id} and mission_id=${missionId}`;
            if (existing.body !== body)
              throw new Error('An existing addendum cannot be changed; open a new correction case');
          } else
            await tx`insert into app_private.operations_events(case_id,operation,operator_reference) values(${id},'report.addendum',${operator})`;
        }
      });
      console.log(JSON.stringify({ event: 'report_addendum', applied: apply }));
    } else if (action === 'close') {
      const resolution = option('--resolution-reference');
      const status = option('--status');
      if (!['completed', 'declined'].includes(status) || !resolution || resolution.length > 200)
        throw new Error('Documented resolution and completed/declined status required');
      if (apply)
        await db.begin(async (tx) => {
          const rows =
            await tx`update app_private.privacy_cases set status=${status},closed_at=now(),resolution_reference=${resolution} where id=${id} and status='open' returning id`;
          if (!rows.length) throw new Error('Case already closed');
          await tx`insert into app_private.operations_events(case_id,operation,operator_reference) values(${id},${`case.${status}`},${operator})`;
        });
      console.log(JSON.stringify({ event: 'privacy_case_resolution', applied: apply }));
    } else {
      const data = await db.begin('isolation level repeatable read read only', async (tx) => {
        const result = {};
        for (const table of tables) {
          const column = table === 'clients' ? 'id' : 'client_id';
          // Identifiers come only from the fixed allowlist above, never from CLI input.
          result[table] =
            await tx`select * from ${tx(`public.${table}`)} where ${tx(column)}=${item.client_id}`;
        }
        return result;
      });
      if (action === 'export' && apply) {
        const output = option('--directory');
        if (!output) throw new Error('A new secure export directory is required');
        const directory = resolve(output);
        await mkdir(directory, { mode: 0o700 });
        await writeFile(
          join(directory, 'internal-review.json'),
          JSON.stringify(
            {
              caseId: id,
              createdAt: new Date().toISOString(),
              disclosureReviewRequired: true,
              data,
            },
            null,
            2,
          ),
          { mode: 0o600, flag: 'wx' },
        );
        await db`insert into app_private.operations_events(case_id,operation,operator_reference) values(${id},'case.internal_export',${operator})`;
      }
      console.log(
        JSON.stringify({
          event: 'privacy_inventory',
          counts: Object.fromEntries(
            Object.entries(data).map(([table, rows]) => [table, rows.length]),
          ),
          exported: action === 'export' && apply,
        }),
      );
    }
  } else throw new Error('Use open, plan, export or close');
} catch {
  safeFailure();
} finally {
  if (db) await db.end({ timeout: 5 });
}
