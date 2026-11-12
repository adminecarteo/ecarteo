import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

// Only abandoned, unlinked staging rows older than 24 hours are eligible.
// Published evidence is never selected by this maintenance operation.
const apply = process.argv.includes('--apply');
const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('Set DATABASE_URL in the maintenance environment.');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname);
const db = postgres(connection, {
  max: 1,
  prepare: false,
  ssl: local
    ? false
    : {
        rejectUnauthorized: true,
        ...(process.env.SUPABASE_DB_CA_CERT
          ? { ca: process.env.SUPABASE_DB_CA_CERT.replace(/\\n/g, '\n') }
          : {}),
      },
});
try {
  if (!apply) {
    const [row] =
      await db`select count(*)::integer as count from app_private.staged_attachments where created_at < now()-interval '24 hours'`;
    console.log(
      `${row.count} expired staged uploads eligible. Use --apply to remove their objects and reservations.`,
    );
  } else {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('Configure Supabase Storage for cleanup.');
    const bucket = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ).storage.from('ecarteo-evidence');
    const removed = await db.begin(async (tx) => {
      const rows =
        await tx`select id,object_path from app_private.staged_attachments where created_at < now()-interval '24 hours' order by created_at limit 100 for update skip locked`;
      for (const row of rows) {
        const result = await bucket.remove([row.object_path]);
        if (result.error)
          throw new Error('Storage cleanup failed; staging reservations remain for retry.');
        await tx`delete from app_private.staged_attachments where id=${row.id}`;
      }
      return rows.length;
    });
    console.log(`Removed ${removed} expired staged uploads. Repeat while the batch is full.`);
  }
} finally {
  await db.end({ timeout: 5 });
}
