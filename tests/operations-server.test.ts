import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const connection = process.env.ECARTEO_TEST_DATABASE_URL;
const suite = connection ? describe : describe.skip;
suite('privileged operations against disposable PostgreSQL', () => {
  let db: ReturnType<typeof postgres>;
  const clientId = randomUUID();
  let caseId: string;
  beforeAll(async () => {
    if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname))
      throw new Error('Operations tests require a disposable loopback database');
    db = postgres(connection, { max: 1, prepare: false });
    await db`insert into public.clients(id,name) values(${clientId},'Operations fixture')`;
  });
  afterAll(async () => {
    await db?.end({ timeout: 5 });
  });
  const run = (args: string[]) =>
    new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['scripts/privacy-operations.mjs', ...args, '--operator-reference', 'LOCAL-TEST'],
        { env: { ...process.env, DATABASE_URL: connection }, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
    });
  it('opens a scoped audited request only with explicit apply', async () => {
    const args = ['open', '--client', clientId, '--kind', 'access', '--reference', 'VERIFIED-TEST'];
    expect((await run(args)).code).toBe(0);
    const [before] =
      await db`select count(*)::integer as count from app_private.privacy_cases where client_id=${clientId}`;
    expect(before.count).toBe(0);
    const result = await run([...args, '--apply']);
    expect(result.code).toBe(0);
    caseId = JSON.parse(result.output.trim()).caseId;
    const rows =
      await db`select operation from app_private.operations_events where case_id=${caseId}`;
    expect(rows.map((row) => row.operation)).toEqual(['case.open']);
  });
  it('exports only the selected tenant and records disclosure review requirement', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'ecarteo-privacy-test-'));
    try {
      const directory = join(parent, 'export');
      const result = await run(['export', '--case', caseId, '--directory', directory, '--apply']);
      expect(result.code, result.output).toBe(0);
      const payload = JSON.parse(await readFile(join(directory, 'internal-review.json'), 'utf8'));
      expect(payload.disclosureReviewRequired).toBe(true);
      expect(payload.data.clients.map((row: { id: string }) => row.id)).toEqual([clientId]);
      expect(payload.data.profiles).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
  it('protects the operations journal and requires a documented case closure', async () => {
    await expect(
      db`delete from app_private.operations_events where case_id=${caseId}`,
    ).rejects.toThrow('append-only');
    const result = await run([
      'close',
      '--case',
      caseId,
      '--status',
      'completed',
      '--resolution-reference',
      'SECURE-DELIVERY-TICKET',
      '--apply',
    ]);
    expect(result.code).toBe(0);
    const [item] = await db`select status from app_private.privacy_cases where id=${caseId}`;
    expect(item.status).toBe('completed');
    await expect(
      db.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        return tx`select * from app_private.privacy_cases`;
      }),
    ).rejects.toThrow();
  });
});
