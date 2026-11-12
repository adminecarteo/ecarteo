import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  bucketName,
  evidenceStorage,
  maintenanceDatabase,
  objectPattern,
  option,
  requireMaintenanceWindow,
  safeFailure,
} from './ops-common.mjs';

const mode = process.argv[2];
const directory = option('--directory');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'message/rfc822',
]);
let db;
try {
  if (!['export', 'verify', 'restore'].includes(mode) || !directory)
    throw new Error('Use export|verify|restore --directory /secure/absolute/path');
  const root = resolve(directory);
  if (mode === 'export') {
    requireMaintenanceWindow();
    // A new directory prevents accidental overwrite of an existing restore point.
    await mkdir(root, { mode: 0o700 });
    db = maintenanceDatabase();
    const rows = await db`select o.name, o.metadata->>'mimetype' as mime_type, e.sha256
      from storage.objects o left join public.evidence e on e.object_path=o.name
      where o.bucket_id=${bucketName} order by o.name`;
    const entries = [];
    for (const row of rows) {
      if (!objectPattern.test(row.name)) throw new Error('Unrecognized evidence object path');
      const { data, error } = await evidenceStorage().download(row.name);
      if (error || !data) throw new Error('Object download failed');
      const bytes = Buffer.from(await data.arrayBuffer());
      const hash = digest(bytes);
      if (row.sha256 && row.sha256 !== hash) throw new Error('Evidence checksum mismatch');
      if (!bytes.length || bytes.length > 10485760) throw new Error('Unexpected evidence size');
      const mimeType = row.mime_type || data.type;
      if (!mimeTypes.has(mimeType)) throw new Error('Unexpected evidence MIME type');
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
    console.log(
      JSON.stringify({ event: 'storage_backup', objects: entries.length, complete: true }),
    );
  } else {
    const manifestPath = join(root, 'manifest.json');
    if (!(await lstat(manifestPath)).isFile() || (await lstat(manifestPath)).isSymbolicLink())
      throw new Error('Unsafe manifest file');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (
      manifest.version !== 1 ||
      manifest.bucket !== bucketName ||
      !Array.isArray(manifest.entries)
    )
      throw new Error('Invalid manifest');
    const paths = new Set();
    for (const [index, entry] of manifest.entries.entries()) {
      if (
        !objectPattern.test(entry.objectPath) ||
        paths.has(entry.objectPath) ||
        entry.file !== `${index}.bin` ||
        !mimeTypes.has(entry.mimeType) ||
        !Number.isInteger(entry.size) ||
        entry.size < 1 ||
        entry.size > 10485760 ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      )
        throw new Error('Unsafe manifest entry');
      paths.add(entry.objectPath);
      const stat = await lstat(join(root, entry.file));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe backup object file');
      const bytes = await readFile(join(root, entry.file));
      if (bytes.length !== entry.size || digest(bytes) !== entry.sha256)
        throw new Error('Backup verification failed');
    }
    if (mode === 'restore' && process.argv.includes('--apply')) {
      requireMaintenanceWindow();
      const expectedHost = option('--target-host');
      if (!expectedHost || expectedHost !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)
        throw new Error('Explicit target host confirmation is required');
      const bucket = evidenceStorage();
      for (const entry of manifest.entries) {
        const bytes = await readFile(join(root, entry.file));
        const { data: existing, error: existingError } = await bucket.download(entry.objectPath);
        if (existing) {
          if (digest(Buffer.from(await existing.arrayBuffer())) !== entry.sha256)
            throw new Error('Existing object differs; overwrite refused');
          continue;
        }
        // Only a genuine missing-object response permits creating an object.
        if (
          existingError &&
          String(existingError.statusCode) !== '404' &&
          existingError.message !== 'Object not found'
        )
          throw new Error('Cannot establish target object state');
        const { error } = await bucket.upload(entry.objectPath, bytes, {
          contentType: entry.mimeType,
          upsert: false,
        });
        if (error) throw new Error('Restore upload failed');
        const { data: restored, error: verifyError } = await bucket.download(entry.objectPath);
        if (
          verifyError ||
          !restored ||
          digest(Buffer.from(await restored.arrayBuffer())) !== entry.sha256
        )
          throw new Error('Restored object verification failed');
      }
    }
    console.log(
      JSON.stringify({
        event: 'storage_backup_check',
        objects: manifest.entries.length,
        checksumVerified: true,
        applied: mode === 'restore' && process.argv.includes('--apply'),
      }),
    );
  }
} catch {
  safeFailure();
} finally {
  if (db) await db.end({ timeout: 5 });
}
