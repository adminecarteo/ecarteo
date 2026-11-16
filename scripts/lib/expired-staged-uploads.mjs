// Callers use a trusted database connection. The operation accepts no file or tenant selector.
const batchSize = 100;
function eligible(tx) {
  // Both tables constrain an object's path to client_id/mission_id/id.
  return tx`s.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.evidence e where e.id=s.id)`;
}

export async function countExpiredStagedUploads(db) {
  const [row] =
    await db`select count(*)::int as count from app_private.staged_attachments s where ${eligible(db)}`;
  return Number(row.count);
}

export async function removeExpiredStagedUploads(db, removeObjects) {
  return db.begin(async (tx) => {
    const rows = await tx`select s.id,s.object_path from app_private.staged_attachments s
      where ${eligible(tx)} order by s.created_at,s.id limit ${batchSize} for update of s skip locked`;
    if (!rows.length) return 0;
    // A Storage or DB failure leaves the reservations available for an idempotent retry.
    await removeObjects(rows.map((row) => row.object_path));
    await tx`delete from app_private.staged_attachments where id=any(${rows.map((row) => row.id)}::uuid[])`;
    return rows.length;
  });
}
