import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { database } from './database';

export const REGISTRATION_RECEIPT_COOKIE = 'ecarteo-registration-receipt';
export const REGISTRATION_RECEIPT_SECONDS = 10 * 60;
const CONSENT_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const consentSchema = z
  .object({
    version: z.literal(1),
    analytics: z.boolean(),
    savedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type RegistrationNext = '/app' | '/app/requests';
export type RegistrationClaim = { track: boolean; next: RegistrationNext };
const noClaim: RegistrationClaim = { track: false, next: '/app' };
const receiptHash = (receipt: string) => createHash('sha256').update(receipt).digest('hex');
const validReceipt = (receipt: string | undefined): receipt is string =>
  typeof receipt === 'string' && /^[A-Za-z0-9_-]{43}$/.test(receipt);
const nextPath = (value: unknown): RegistrationNext =>
  value === '/app/requests' ? '/app/requests' : '/app';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

/** Consent must already exist at activation, and still be accepted and unexpired at dispatch. */
export function registrationConsentAccepted(
  value: unknown,
  activatedAtMs: number,
  nowMs: number,
): boolean {
  const parsed = consentSchema.safeParse(value);
  if (!parsed.success) return false;
  const consent = parsed.data;
  return (
    consent.analytics &&
    consent.savedAt <= activatedAtMs &&
    consent.savedAt <= nowMs &&
    consent.expiresAt === consent.savedAt + CONSENT_LIFETIME_MS &&
    consent.expiresAt > nowMs
  );
}

/** Uses the same database clock as profile activation; analytics outages never block verification. */
export async function beginRegistrationVerification(): Promise<string | null> {
  try {
    const [row] = await database()`select clock_timestamp()::text as started_at`;
    return row.started_at as string;
  } catch {
    return null;
  }
}

/** Only the explicit signup OTP handler calls this, after it has established auth success. */
export async function issueRegistrationReceipt(
  userId: string,
  verificationStartedAt: string | null,
  next: string,
): Promise<boolean> {
  if (!verificationStartedAt || !z.uuid().safeParse(userId).success) return false;
  try {
    const receipt = randomBytes(32).toString('base64url');
    const rows = await database()`update app_private.registration_activations a
      set receipt_hash=${receiptHash(receipt)},receipt_issued_at=clock_timestamp(),
          receipt_expires_at=clock_timestamp()+interval '10 minutes',next_path=${nextPath(next)}
      from public.profiles p,auth.users u
      where a.account_id=${userId} and p.id=a.account_id and u.id=a.account_id
        and p.active and p.role='client' and u.email_confirmed_at is not null
        and not coalesce(u.is_anonymous,false)
        and a.activated_at>=${verificationStartedAt}::timestamptz
        and a.activated_at<=clock_timestamp()
        and a.activated_at>clock_timestamp()-interval '10 minutes'
        and a.receipt_hash is null and a.settled_at is null
      returning a.account_id`;
    if (!rows.length) return false;
    (await cookies()).set(REGISTRATION_RECEIPT_COOKIE, receipt, {
      ...cookieOptions(),
      maxAge: REGISTRATION_RECEIPT_SECONDS,
    });
    return true;
  } catch {
    // A spent receipt is deliberately not retried if its cookie could not be written.
    return false;
  }
}

export async function readRegistrationReceipt(): Promise<string | undefined> {
  return (await cookies()).get(REGISTRATION_RECEIPT_COOKIE)?.value;
}

export async function clearRegistrationReceipt(): Promise<void> {
  (await cookies()).set(REGISTRATION_RECEIPT_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
}

/** Atomic at-most-once permission, settled before external dispatch even when consent is refused. */
export async function claimRegistrationReceipt(
  userId: string,
  receipt: string | undefined,
  consent: unknown,
): Promise<RegistrationClaim> {
  if (!validReceipt(receipt) || !z.uuid().safeParse(userId).success) return { ...noClaim };
  return database().begin(async (tx) => {
    const [row] = await tx`select a.next_path,a.settled_at,
        extract(epoch from a.activated_at)*1000 as activation_ms,
        extract(epoch from clock_timestamp())*1000 as now_ms,
        a.receipt_expires_at>clock_timestamp() as unexpired,
        (p.active and p.role='client' and u.email_confirmed_at is not null
          and not coalesce(u.is_anonymous,false)) as account_active
      from app_private.registration_activations a
      join public.profiles p on p.id=a.account_id join auth.users u on u.id=a.account_id
      where a.account_id=${userId} and a.receipt_hash=${receiptHash(receipt)}
      for update of a for share of p,u`;
    if (!row) return { ...noClaim };
    const next = nextPath(row.next_path);
    if (row.settled_at) return { track: false, next };
    const track =
      row.unexpired === true &&
      row.account_active === true &&
      registrationConsentAccepted(consent, Number(row.activation_ms), Number(row.now_ms));
    const decision = !row.unexpired ? 'expired' : track ? 'dispatch' : 'declined';
    await tx`update app_private.registration_activations set settled_at=clock_timestamp(),
      decision=${decision} where account_id=${userId}`;
    return { track, next };
  });
}
