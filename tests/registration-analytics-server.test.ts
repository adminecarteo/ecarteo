import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';

vi.mock('server-only', () => ({}));
const cookie = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => cookie }));
import {
  REGISTRATION_RECEIPT_COOKIE,
  beginRegistrationVerification,
  claimRegistrationReceipt,
  issueRegistrationReceipt,
  registrationConsentAccepted,
} from '@/server/registration-analytics';
import { closeWorkspaceDatabase } from '@/server/database';

const lifetime = 180 * 24 * 60 * 60 * 1000;
const consent = (savedAt: number, analytics = true) => ({
  version: 1,
  analytics,
  savedAt,
  expiresAt: savedAt + lifetime,
});

describe('registration consent at the activation boundary', () => {
  const activation = Date.UTC(2026, 10, 27, 10);
  const now = activation + 1000;
  it('requires acceptance before activation that remains valid now', () => {
    expect(registrationConsentAccepted(consent(activation - 1000), activation, now)).toBe(true);
    expect(registrationConsentAccepted(consent(activation + 1), activation, now)).toBe(false);
  });
  it.each([
    null,
    undefined,
    false,
    {},
    consent(activation - 1000, false),
    consent(activation - lifetime - 1000),
    consent(now + 1000),
    { ...consent(activation - 1000), version: 2 },
    { ...consent(activation - 1000), expiresAt: now + 1 },
    { ...consent(activation - 1000), email: 'never-forward@example.test' },
    consent(Number.NaN),
  ])('rejects missing, invalid, refused, expired or future consent %#', (record) => {
    expect(registrationConsentAccepted(record, activation, now)).toBe(false);
  });
});

const testUrl = process.env.ECARTEO_TEST_DATABASE_URL;
describe.skipIf(!testUrl).sequential('registration activation ledger (local PostgreSQL)', () => {
  let db: ReturnType<typeof postgres>;
  const identities: string[] = [];
  const organizations: string[] = [];

  beforeAll(() => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(testUrl!).hostname))
      throw new Error('Localhost test database only.');
    process.env.DATABASE_URL = testUrl!;
    db = postgres(testUrl!, { max: 12, prepare: false });
  });
  beforeEach(() => cookie.set.mockClear());
  afterAll(async () => {
    await closeWorkspaceDatabase();
    if (!db) return;
    // Remove only the identities and organizations created by this suite.
    for (const id of identities) {
      const [profile] = await db`select client_id from public.profiles where id=${id}`;
      if (profile?.client_id) organizations.push(profile.client_id);
      await db`delete from public.profiles where id=${id}`;
      await db`delete from auth.users where id=${id}`;
    }
    for (const id of organizations) await db`delete from public.clients where id=${id}`;
    await db.end({ timeout: 5 });
  });

  async function pending() {
    const id = randomUUID();
    identities.push(id);
    await db`insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
      values(${id},${`${id}@example.test`},null,false,
        '{"display_name":"Registration test","company_name":"Registration test","ecarteo_registration_test":true}')`;
    return id;
  }
  async function activate(next: '/app' | '/app/requests' = '/app') {
    const id = await pending();
    const record = consent(Date.now() - 1000);
    const started = await beginRegistrationVerification();
    await db`update auth.users set email_confirmed_at=clock_timestamp() where id=${id}`;
    expect(await issueRegistrationReceipt(id, started, next)).toBe(true);
    const receipt = cookie.set.mock.calls.at(-1)![1] as string;
    return { id, record, receipt, started };
  }

  it('records only confirmed active customers and issues one opaque receipt', async () => {
    const id = await pending();
    const started = await beginRegistrationVerification();
    expect(
      await db`select account_id from app_private.registration_activations where account_id=${id}`,
    ).toHaveLength(0);
    expect(await issueRegistrationReceipt(id, started, '/app/requests')).toBe(false);
    await db`update auth.users set email_confirmed_at=clock_timestamp() where id=${id}`;
    expect(await issueRegistrationReceipt(id, started, '/app/requests')).toBe(true);
    const receipt = cookie.set.mock.calls.at(-1)![1] as string;
    expect(receipt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.set).toHaveBeenCalledWith(
      REGISTRATION_RECEIPT_COOKIE,
      receipt,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      }),
    );
    const [row] =
      await db`select receipt_hash,next_path from app_private.registration_activations where account_id=${id}`;
    expect(row.receipt_hash).toBe(createHash('sha256').update(receipt).digest('hex'));
    expect(row.next_path).toBe('/app/requests');
    expect(await issueRegistrationReceipt(id, started, '/app/requests')).toBe(false);
  });

  it('never backfills an existing account or an activation before this verification', async () => {
    const id = await pending();
    await db`update auth.users set email_confirmed_at=clock_timestamp() where id=${id}`;
    const laterWindow = await beginRegistrationVerification();
    expect(await issueRegistrationReceipt(id, laterWindow, '/app')).toBe(false);
    await db`delete from app_private.registration_activations where account_id=${id}`;
    expect(await issueRegistrationReceipt(id, laterWindow, '/app')).toBe(false);
    expect(cookie.set).not.toHaveBeenCalled();
  });

  it('authorizes exactly one of ten concurrent claims and no replay', async () => {
    const { id, receipt, record } = await activate('/app/requests');
    const claims = await Promise.all(
      Array.from({ length: 10 }, () => claimRegistrationReceipt(id, receipt, record)),
    );
    expect(claims.filter((claim) => claim.track)).toHaveLength(1);
    for (const claim of claims) {
      expect(Object.keys(claim).sort()).toEqual(['next', 'track']);
      expect(claim.next).toBe('/app/requests');
      expect(JSON.stringify(claim)).not.toContain(id);
      expect(JSON.stringify(claim)).not.toContain(receipt);
    }
    expect(await claimRegistrationReceipt(id, receipt, record)).toEqual({
      track: false,
      next: '/app/requests',
    });
  });

  it.each(['refused', 'missing', 'expired', 'later'])(
    'consumes a %s consent opportunity without later backfill',
    async (kind) => {
      const { id, receipt, record } = await activate();
      let supplied: unknown = record;
      if (kind === 'refused') supplied = { ...record, analytics: false };
      if (kind === 'missing') supplied = null;
      if (kind === 'expired') supplied = consent(Date.now() - lifetime - 1000);
      if (kind === 'later') {
        await db`update app_private.registration_activations set activated_at=clock_timestamp()-interval '1 minute' where account_id=${id}`;
        supplied = consent(Date.now() - 1000);
      }
      expect(await claimRegistrationReceipt(id, receipt, supplied)).toEqual({
        track: false,
        next: '/app',
      });
      expect(await claimRegistrationReceipt(id, receipt, consent(Date.now() - 120_000))).toEqual({
        track: false,
        next: '/app',
      });
      const [row] =
        await db`select decision from app_private.registration_activations where account_id=${id}`;
      expect(row.decision).toBe('declined');
    },
  );

  it('rejects another account or forged receipt without consuming the real claim', async () => {
    const { id, receipt, record } = await activate();
    const stranger = await pending();
    expect(await claimRegistrationReceipt(stranger, receipt, record)).toEqual({
      track: false,
      next: '/app',
    });
    expect(
      await claimRegistrationReceipt(id, randomBytes(32).toString('base64url'), record),
    ).toEqual({ track: false, next: '/app' });
    expect(await claimRegistrationReceipt(id, undefined, record)).toEqual({
      track: false,
      next: '/app',
    });
    expect(await claimRegistrationReceipt(id, receipt, record)).toEqual({
      track: true,
      next: '/app',
    });
  });

  it('rejects and settles an expired receipt', async () => {
    const { id, receipt, record } = await activate();
    await db`update app_private.registration_activations set receipt_issued_at=clock_timestamp()-interval '11 minutes',
      receipt_expires_at=clock_timestamp()-interval '1 minute' where account_id=${id}`;
    expect(await claimRegistrationReceipt(id, receipt, record)).toEqual({
      track: false,
      next: '/app',
    });
    const [row] =
      await db`select decision from app_private.registration_activations where account_id=${id}`;
    expect(row.decision).toBe('expired');
  });

  it('refuses inactive accounts and never replays after reactivation', async () => {
    const { id, receipt, record } = await activate();
    await db`update public.profiles set active=false where id=${id}`;
    expect(await claimRegistrationReceipt(id, receipt, record)).toEqual({
      track: false,
      next: '/app',
    });
    await db`update public.profiles set active=true where id=${id}`;
    expect(await claimRegistrationReceipt(id, receipt, record)).toEqual({
      track: false,
      next: '/app',
    });
  });

  it('does not expose activation bookkeeping to authenticated browser roles', async () => {
    await expect(
      db.begin(async (tx) => {
        await tx`set local role authenticated`;
        await tx`select * from app_private.registration_activations`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
