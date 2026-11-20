#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { evidenceInventory, exportEvidence } from './evidence-backup.mjs';
import { maintenanceDatabase, safeFailure } from './ops-common.mjs';
import { writeBackupReceipt } from './lib/backup-receipt.mjs';

process.umask(0o077);
const scripts = fileURLToPath(new URL('./', import.meta.url));
const hash = async (file) => {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
};
const completed = (child) =>
  new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Backup command failed')),
    );
  });
const run = (script, args) =>
  completed(spawn(process.execPath, [join(scripts, script), ...args], { stdio: 'inherit' }));

let db;
let work;
let partial;
try {
  const destination = process.env.ECARTEO_BACKUP_DESTINATION;
  const recipient = process.env.ECARTEO_BACKUP_AGE_RECIPIENT;
  if (!destination || !isAbsolute(destination) || !/^age1[0-9a-z]{58}$/.test(recipient ?? ''))
    throw new Error('Absolute destination and public age recipient required');
  const marker = await readFile(join(destination, '.ecarteo-backup-destination'), 'utf8');
  if (marker.trim() !== 'ecarteo-archive-v1') throw new Error('Unknown destination');
  work = await mkdtemp(join(process.env.ECARTEO_BACKUP_SCRATCH || tmpdir(), 'ecarteo-backup-'));
  const directory = (name) => ['--directory', join(work, name)];
  db = maintenanceDatabase();
  const { point, inventory } = await db.begin(
    'isolation level repeatable read read only',
    async (tx) => {
      const [{ snapshot, as_of }] =
        await tx`select pg_export_snapshot() as snapshot, now() as as_of`;
      const inventory = await evidenceInventory(tx);
      await run('backup-database.mjs', [...directory('database'), '--snapshot', snapshot]);
      return { point: new Date(as_of).toISOString(), inventory };
    },
  );
  await exportEvidence(join(work, 'evidence'), inventory);
  await run('storage-backup.mjs', ['verify', ...directory('evidence')]);
  await writeFile(
    join(work, 'SHA256SUMS'),
    `${await hash(join(work, 'database/database.dump'))}  database/database.dump\n` +
      `${await hash(join(work, 'evidence/manifest.json'))}  evidence/manifest.json\n`,
    { flag: 'wx' },
  );
  await writeFile(join(work, 'snapshot.json'), JSON.stringify({ version: 1, asOf: point }), {
    flag: 'wx',
  });
  const archive = `ecarteo-${point.replace(/:/g, '-')}-${randomUUID()}.tar.age`;
  const encrypted = join(work, archive);
  const tar = spawn(
    'tar',
    ['-cf', '-', '-C', work, 'database', 'evidence', 'SHA256SUMS', 'snapshot.json'],
    {
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const age = spawn('age', ['--recipient', recipient, '--output', encrypted], {
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  try {
    await Promise.all([completed(tar), completed(age), pipeline(tar.stdout, age.stdin)]);
  } finally {
    tar.kill();
    age.kill();
  }
  const expectedHash = await hash(encrypted);
  partial = join(destination, `.${archive}.partial`);
  await copyFile(encrypted, partial, constants.COPYFILE_EXCL);
  if ((await hash(partial)) !== expectedHash) throw new Error('Destination read-back failed');
  await rename(partial, join(destination, archive));
  partial = undefined;
  await writeBackupReceipt(destination, { asOf: point, archive, sha256: expectedHash });
  console.log(
    JSON.stringify({ event: 'encrypted_backup', asOf: point, archive, sha256: expectedHash }),
  );
} catch {
  safeFailure();
} finally {
  if (db) await db.end({ timeout: 5 });
  if (partial) await rm(partial, { force: true });
  if (work) await rm(work, { recursive: true, force: true });
}
