import 'server-only';
import { createHash } from 'node:crypto';
import { database } from './database';

/** Shared login/signup/recovery bucket: ten attempts per normalized email in fifteen minutes. */
export async function consumeAuthAttempt(email: string): Promise<boolean> {
  const key = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  const db = database();
  const rows =
    await db`insert into app_private.auth_rate_limits(key_hash,window_started_at,attempts)
    values(${key},now(),1) on conflict(key_hash) do update set
    window_started_at=case when app_private.auth_rate_limits.window_started_at <= now()-interval '15 minutes'
      then now() else app_private.auth_rate_limits.window_started_at end,
    attempts=case when app_private.auth_rate_limits.window_started_at <= now()-interval '15 minutes'
      then 1 else least(app_private.auth_rate_limits.attempts+1,100000) end returning attempts`;
  // No emails or IP addresses are persisted. Expired buckets need no scheduled worker.
  await db`delete from app_private.auth_rate_limits where window_started_at < now()-interval '24 hours'`;
  return Number(rows[0].attempts) <= 10;
}
