import 'server-only';
import postgres from 'postgres';
import { WorkspaceError } from './workspace-errors';

let pool: ReturnType<typeof postgres> | undefined;
export function database() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new WorkspaceError(
      503,
      'DATABASE_NOT_CONFIGURED',
      'La base de données doit être configurée. / Database configuration is required.',
    );
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new WorkspaceError(
      503,
      'DATABASE_NOT_CONFIGURED',
      'La connexion sécurisée est indisponible. / The secure connection is unavailable.',
    );
  }
  const local = ['localhost', '127.0.0.1', '[::1]', ''].includes(host);
  pool = postgres(url, {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(process.env.SUPABASE_DB_CA_CERT ? { ca: process.env.SUPABASE_DB_CA_CERT } : {}),
        },
    connection: { application_name: 'ecarteo-console', statement_timeout: 15000 },
  });
  return pool;
}
/** Used by isolated integration tests and graceful process shutdown. */
export async function closeWorkspaceDatabase() {
  if (pool) {
    await pool.end({ timeout: 5 });
    pool = undefined;
  }
}
export type Transaction = postgres.TransactionSql;
