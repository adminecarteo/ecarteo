import {
  bucketName,
  evidenceStorage,
  maintenanceDatabase,
  objectPattern,
  requireMaintenanceWindow,
  safeFailure,
} from './ops-common.mjs';

const apply = process.argv.includes('--apply');
let db;
try {
  if (apply) requireMaintenanceWindow();
  db = maintenanceDatabase();
  const candidates = await db`select o.name from storage.objects o
    where o.bucket_id=${bucketName} and o.created_at < now()-interval '7 days'
    and not exists(select 1 from public.evidence e where e.object_path=o.name)
    and not exists(select 1 from app_private.staged_attachments s where s.object_path=o.name)
    order by o.name limit 100`;
  let removed = 0;
  for (const { name } of candidates) {
    if (!objectPattern.test(name)) continue; // Never delete unrelated files from a shared bucket.
    if (!apply) continue;
    const deleted = await db.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${name.split('/')[0]},0))`;
      const linked = await tx`select 1 from public.evidence where object_path=${name}
        union all select 1 from app_private.staged_attachments where object_path=${name} limit 1`;
      if (linked.length) return false;
      const { error } = await evidenceStorage().remove([name]);
      if (error) throw new Error('Storage deletion failed');
      return true;
    });
    if (deleted) removed++;
  }
  console.log(
    JSON.stringify({
      event: 'storage_reconciliation',
      mode: apply ? 'apply' : 'dry-run',
      candidates: candidates.filter(({ name }) => objectPattern.test(name)).length,
      removed,
      batchLimit: 100,
    }),
  );
} catch {
  safeFailure();
} finally {
  if (db) await db.end({ timeout: 5 });
}
