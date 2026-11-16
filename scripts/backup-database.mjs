import { spawn } from 'node:child_process';
import { chmod, mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { backupSnapshot, option, safeFailure } from './ops-common.mjs';

let certificateDirectory;
try {
  const snapshot = backupSnapshot();
  const output = option('--directory');
  if (!output || !process.env.DATABASE_URL)
    throw new Error('Database and new backup directory required');
  const url = new URL(process.env.DATABASE_URL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const environment = {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: local ? 'disable' : 'verify-full',
  };
  if (process.env.SUPABASE_DB_CA_CERT && !local) {
    certificateDirectory = await mkdtemp(join(tmpdir(), 'ecarteo-db-ca-'));
    environment.PGSSLROOTCERT = join(certificateDirectory, 'root.crt');
    await writeFile(
      environment.PGSSLROOTCERT,
      process.env.SUPABASE_DB_CA_CERT.replace(/\\n/g, '\n'),
      { mode: 0o600 },
    );
  }
  const directory = resolve(output);
  await mkdir(directory, { mode: 0o700 });
  const file = join(directory, 'database.dump');
  const execute = (binary, args) =>
    new Promise((fulfill, reject) => {
      const child = spawn(binary, args, { env: environment, stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.resume(); // Do not print provider identifiers or credentials on failure.
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0 ? fulfill(undefined) : reject(new Error('PostgreSQL command failed')),
      );
    });
  // Credentials are passed in the child environment, never as command arguments.
  await execute(process.env.PG_DUMP_BINARY || 'pg_dump', [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    ...(snapshot ? [`--snapshot=${snapshot}`] : []),
    '--exclude-table-data=storage.objects',
    `--file=${file}`,
  ]);
  await chmod(file, 0o600);
  await execute(process.env.PG_RESTORE_BINARY || 'pg_restore', ['--list', file]);
  await writeFile(
    join(directory, 'complete.json'),
    JSON.stringify({
      complete: true,
      createdAt: new Date().toISOString(),
      includesStorageBytes: false,
      includesStorageObjectRows: false,
    }),
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Database archive created and catalog verified. Run the separate Storage export and a restore drill.',
  );
} catch {
  safeFailure();
} finally {
  if (certificateDirectory) await rm(certificateDirectory, { recursive: true, force: true });
}
