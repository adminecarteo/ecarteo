import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('server-only', () => ({}));
vi.mock('@/server/database', () => ({ database: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
import { authorizedCleanup, authorizedMonitor, readiness } from '@/server/operations';
import { database } from '@/server/database';
import { createClient } from '@supabase/supabase-js';

describe('operations boundaries', () => {
  beforeEach(() => vi.stubEnv('OPS_HEALTH_TOKEN', 'a'.repeat(48)));
  afterEach(() => vi.unstubAllEnvs());
  it('requires the complete private monitoring token and rejects missing configuration', () => {
    expect(authorizedMonitor(`Bearer ${'a'.repeat(48)}`)).toBe(true);
    expect(authorizedMonitor(`Bearer ${'a'.repeat(47)}`)).toBe(false);
    expect(authorizedMonitor(null)).toBe(false);
    vi.stubEnv('OPS_HEALTH_TOKEN', 'short');
    expect(authorizedMonitor('Bearer short')).toBe(false);
  });
  it('marks a public evidence bucket unavailable even when database and auth configuration work', async () => {
    vi.stubEnv('APP_URL', 'https://audit.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fixture');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_fixture');
    const query = vi.fn().mockResolvedValue([{ schema_ready: true }]);
    const begin = vi.fn(async (work: (transaction: unknown) => Promise<unknown>) => work(query));
    vi.mocked(database).mockReturnValue({ begin } as unknown as ReturnType<typeof database>);
    const getBucket = vi
      .fn()
      .mockResolvedValue({ error: null, data: { public: true, file_size_limit: 10485760 } });
    vi.mocked(createClient).mockReturnValue({ storage: { getBucket } } as unknown as ReturnType<
      typeof createClient
    >);
    expect(await readiness()).toMatchObject({
      status: 'unavailable',
      checks: { configuration: true, database: true, schema: true, storage: false },
    });
    getBucket.mockResolvedValue({
      error: null,
      data: { public: false, file_size_limit: 10485760 },
    });
    expect(await readiness()).toMatchObject({ status: 'ready' });
  });
  it('keeps readiness and cleanup credentials separate and disables cleanup on a collision', () => {
    const health = 'a'.repeat(48);
    const cleanup = 'b'.repeat(48);
    vi.stubEnv('OPS_CLEANUP_TOKEN', cleanup);
    expect(authorizedCleanup('Bearer ' + cleanup)).toBe(true);
    expect(authorizedCleanup('Bearer ' + health)).toBe(false);
    expect(authorizedMonitor('Bearer ' + cleanup)).toBe(false);
    expect(authorizedCleanup(null)).toBe(false);
    vi.stubEnv('OPS_CLEANUP_TOKEN', health);
    expect(authorizedCleanup('Bearer ' + health)).toBe(false);
    vi.stubEnv('OPS_CLEANUP_TOKEN', 'short');
    expect(authorizedCleanup('Bearer short')).toBe(false);
  });
  it('configuration diagnostics reject secret keys in public variables without printing values', () => {
    const secret = 'sb_secret_never_print_this';
    const run = spawnSync(process.execPath, ['scripts/validate-config.mjs', '--production'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        APP_URL: 'https://audit.example.test',
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
        SUPABASE_SERVICE_ROLE_KEY: secret,
        DATABASE_URL: 'postgres://owner:secret@database.example.test/postgres',
      },
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('secret key exposed');
    expect(run.stderr + run.stdout).not.toContain(secret);
  });
  it('verifies backup bytes and refuses tampered or path-traversing manifests without network access', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ecarteo-storage-test-'));
    try {
      const bytes = Buffer.from('Test evidence');
      const entry = {
        objectPath:
          '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333',
        file: '0.bin',
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mimeType: 'text/plain',
      };
      const save = () =>
        writeFileSync(
          join(directory, 'manifest.json'),
          JSON.stringify({ version: 1, bucket: 'ecarteo-evidence', entries: [entry] }),
        );
      writeFileSync(join(directory, '0.bin'), bytes);
      save();
      const run = () =>
        spawnSync(
          process.execPath,
          ['scripts/storage-backup.mjs', 'verify', '--directory', directory],
          { encoding: 'utf8' },
        );
      expect(run().status).toBe(0);
      writeFileSync(join(directory, '0.bin'), 'tampered');
      expect(run().status).toBe(1);
      writeFileSync(join(directory, '0.bin'), bytes);
      entry.file = '../secret';
      save();
      expect(run().status).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('rejects incomplete billing and unapproved plan shapes without logging secrets', () => {
    const run = (billing: Record<string, string>) =>
      spawnSync(process.execPath, ['scripts/validate-config.mjs'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          APP_URL: 'http://127.0.0.1:3000',
          NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
          SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture',
          DATABASE_URL: 'postgres://owner:fixture@localhost/postgres',
          STRIPE_SECRET_KEY: '',
          STRIPE_WEBHOOK_SECRET: '',
          STRIPE_BILLING_PLANS: '',
          ...billing,
        },
      });
    expect(run({}).status).toBe(0);
    expect(run({ STRIPE_SECRET_KEY: 'sk_test_fixture' }).status).toBe(1);
    const keys = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' };
    expect(
      run({
        ...keys,
        STRIPE_BILLING_PLANS: '[{"id":"approved","name":"Approved","priceId":"price_fixture"}]',
      }).status,
    ).toBe(0);
    const invalid = run({
      ...keys,
      STRIPE_BILLING_PLANS:
        '[{"id":"approved","name":"Approved","priceId":"price_fixture","amount":1}]',
    });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('plan objects');
    expect(invalid.stderr).not.toContain('sk_test_fixture');
  });
});
