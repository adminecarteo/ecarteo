import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { database } from './database';
import { authConfigured, siteOrigin } from './config';

export function authorizedMonitor(header: string | null): boolean {
  const expected = process.env.OPS_HEALTH_TOKEN;
  if (!expected || expected.length < 32 || !header?.startsWith('Bearer ')) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(expected));
}

/** Never include exception text, URLs, tokens, request data, or evidence in operations logs. */
export function operationalEvent(
  event: 'request_failed' | 'readiness_failed',
  fields: { category?: string; route?: string; requestId?: string } = {},
) {
  console.error(JSON.stringify({ level: 'error', event, at: new Date().toISOString(), ...fields }));
}

export async function readiness() {
  const checks = { configuration: false, database: false, schema: false, storage: false };
  try {
    checks.configuration = authConfigured() && Boolean(siteOrigin());
  } catch {}
  const [db, storage] = await Promise.allSettled([
    (async () =>
      database().begin(async (tx) => {
        await tx`set local statement_timeout = '3000ms'`;
        const [result] = await tx`select
        to_regclass('public.profiles') is not null
        and to_regclass('public.published_reports') is not null
        and to_regclass('app_private.staged_attachments') is not null
        and to_regclass('app_private.team_invitations') is not null
        and to_regclass('public.audit_requests') is not null
        and to_regclass('app_private.billing_webhook_receipts') is not null
        and to_regclass('app_private.scoring_action_drafts') is not null
        and to_regclass('public.report_addenda') is not null as schema_ready`;
        return Boolean(result.schema_ready);
      }))(),
    (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return false;
      const { data, error } = await createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4000) }),
        },
      }).storage.getBucket('ecarteo-evidence');
      return !error && data?.public === false && Number(data.file_size_limit) === 10485760;
    })(),
  ]);
  if (db.status === 'fulfilled') {
    checks.database = true;
    checks.schema = db.value;
  }
  checks.storage = storage.status === 'fulfilled' && storage.value;
  return { status: Object.values(checks).every(Boolean) ? 'ready' : 'unavailable', checks };
}
