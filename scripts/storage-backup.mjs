import { lstat, readFile } from 'node:fs/promises';
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

import {
  digest,
  evidenceInventory,
  evidenceMimeTypes,
  exportEvidence,
} from './evidence-backup.mjs';

const mode = process.argv[2];
const directory = option('--directory');
let db;
try {
  if (!['export', 'verify', 'restore'].includes(mode) || !directory)
    throw new Error('Use export|verify|restore --directory /secure/absolute/path');
  const root = resolve(directory);
  if (mode === 'export') {
    requireMaintenanceWindow();
    db = maintenanceDatabase();
    const rows = await db.begin('isolation level repeatable read read only', evidenceInventory);
    await exportEvidence(root, rows);
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
        !evidenceMimeTypes.has(entry.mimeType) ||
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
