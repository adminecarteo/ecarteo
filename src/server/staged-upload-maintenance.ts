import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { database } from './database';
import {
  countExpiredStagedUploads,
  removeExpiredStagedUploads,
} from '../../scripts/lib/expired-staged-uploads.mjs';

export async function stagedUploadMaintenance(apply: boolean) {
  const db = database();
  if (!apply) return { eligible: await countExpiredStagedUploads(db) };
  const removed: number = await removeExpiredStagedUploads(db, async (paths: string[]) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Storage configuration is missing');
    const storage = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
      },
    }).storage.from('ecarteo-evidence');
    const { error } = await storage.remove(paths);
    if (error) throw new Error('Staged object removal failed');
  });
  return { removed };
}
