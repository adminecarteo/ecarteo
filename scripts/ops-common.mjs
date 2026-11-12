import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

export const bucketName = 'ecarteo-evidence';
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const objectPattern = new RegExp(
  `^${uuidPattern.source.slice(1, -1)}/${uuidPattern.source.slice(1, -1)}/${uuidPattern.source.slice(1, -1)}$`,
  'i',
);

export function maintenanceDatabase() {
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new Error('DATABASE_URL is required.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname);
  return postgres(connection, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(process.env.SUPABASE_DB_CA_CERT
            ? { ca: process.env.SUPABASE_DB_CA_CERT.replace(/\\n/g, '\n') }
            : {}),
        },
    connection: { application_name: 'ecarteo-maintenance', statement_timeout: 30000 },
  });
}

export function evidenceStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase URL and service key are required.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60000) }),
    },
  }).storage.from(bucketName);
}

export function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

export function requireMaintenanceWindow() {
  if (process.env.ECARTEO_MAINTENANCE_CONFIRMED !== 'yes')
    throw new Error(
      'Stop application writes, then set ECARTEO_MAINTENANCE_CONFIRMED=yes for this operation.',
    );
}

export function safeFailure() {
  // Provider exceptions may contain connection URLs, object identifiers, or credentials.
  console.error(
    'Maintenance failed. Check configuration, permissions and provider availability; no credentials were logged.',
  );
  process.exitCode = 1;
}
