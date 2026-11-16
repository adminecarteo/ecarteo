import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bucketName, evidenceStorage, objectPattern } from './ops-common.mjs';

export const evidenceMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'message/rfc822',
]);
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function evidenceInventory(tx) {
  const missing = await tx`select 1 from public.evidence e
        where e.object_path is not null and not exists (select 1 from storage.objects o
          where o.bucket_id=e.bucket_id and o.name=e.object_path) limit 1`;
  if (missing.length) throw new Error('Evidence references a missing Storage object');
  return tx`select o.name, o.metadata->>'mimetype' as mime_type,
        coalesce(e.sha256, s.sha256) as sha256,
        coalesce(e.size_bytes, s.size_bytes, (o.metadata->>'size')::bigint) as expected_size
      from storage.objects o left join public.evidence e on e.object_path=o.name
      left join app_private.staged_attachments s on s.object_path=o.name
      where o.bucket_id=${bucketName} order by o.name`;
}

export async function exportEvidence(root, rows) {
  await mkdir(root, { mode: 0o700 });
  const bucket = evidenceStorage();
  const entries = [];
  for (const row of rows) {
    if (!objectPattern.test(row.name)) throw new Error('Unrecognized evidence object path');
    const { data, error } = await bucket.download(row.name);
    if (error || !data) throw new Error('Object download failed');
    const bytes = Buffer.from(await data.arrayBuffer());
    const hash = digest(bytes);
    if (row.sha256 && row.sha256 !== hash) throw new Error('Evidence checksum mismatch');
    if (row.expected_size != null && bytes.length !== Number(row.expected_size))
      throw new Error('Evidence size mismatch');
    if (!bytes.length || bytes.length > 10485760) throw new Error('Unexpected evidence size');
    const mimeType = row.mime_type || data.type;
    if (!evidenceMimeTypes.has(mimeType)) throw new Error('Unexpected evidence MIME type');
    const file = `${entries.length}.bin`;
    await writeFile(join(root, file), bytes, { flag: 'wx', mode: 0o600 });
    entries.push({ objectPath: row.name, file, size: bytes.length, sha256: hash, mimeType });
  }
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify(
      { version: 1, bucket: bucketName, createdAt: new Date().toISOString(), entries },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(JSON.stringify({ event: 'storage_backup', objects: entries.length, complete: true }));
}
