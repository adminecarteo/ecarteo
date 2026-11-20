import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestVerifiedBackup, writeBackupReceipt } from '../scripts/lib/backup-receipt.mjs';

const asOf = '2026-11-20T02:00:00.000Z';
const archive = 'ecarteo-2026-11-20T02-00-00.000Z-11111111-1111-4111-8111-111111111111.tar.age';
const bytes = Buffer.from('age-encryption.org/v1\nsynthetic encrypted fixture\n');
const digest = createHash('sha256').update(bytes).digest('hex');

async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'ecarteo-backup-receipt-'));
  try {
    await writeFile(join(directory, '.ecarteo-backup-destination'), 'ecarteo-archive-v1\n');
    await writeFile(join(directory, archive), bytes);
    await writeBackupReceipt(directory, { archive, asOf, sha256: digest });
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('encrypted backup freshness and integrity', () => {
  it('accepts a complete recent archive only after checksum verification', async () => {
    await fixture(async (destination) => {
      expect(
        await latestVerifiedBackup({ destination, now: Date.parse(asOf) + 3_600_000 }),
      ).toMatchObject({ archive, asOf, ageHours: 1, sha256: digest });
      await writeFile(join(destination, archive), Buffer.alloc(bytes.length, 'x'));
      await expect(
        latestVerifiedBackup({ destination, now: Date.parse(asOf) + 3_600_000 }),
      ).rejects.toThrow('checksum');
    });
  });

  it('uses snapshot time, not a touched file timestamp, and rejects future dates', async () => {
    await fixture(async (destination) => {
      const now = Date.parse(asOf) + 40 * 3_600_000;
      await utimes(join(destination, archive), new Date(now), new Date(now));
      await expect(latestVerifiedBackup({ destination, now })).rejects.toThrow('stale');
      await expect(
        latestVerifiedBackup({ destination, now: Date.parse(asOf) - 3_600_000 }),
      ).rejects.toThrow('future');
    });
  });

  it('fails a newer unverified archive instead of hiding it behind an older valid receipt', async () => {
    await fixture(async (destination) => {
      await writeFile(join(destination, archive.replace('02-00', '03-00')), bytes);
      await expect(
        latestVerifiedBackup({ destination, now: Date.parse(asOf) + 2 * 3_600_000 }),
      ).rejects.toThrow();
    });
  });

  it('rejects wrong destinations, symlink archives and invalid age policies', async () => {
    await fixture(async (destination) => {
      await expect(
        latestVerifiedBackup({ destination, maxAgeHours: Number.NaN }),
      ).rejects.toThrow();
      await rm(join(destination, archive));
      await symlink('.ecarteo-backup-destination', join(destination, archive));
      await expect(latestVerifiedBackup({ destination })).rejects.toThrow('Unsafe');
      await writeFile(join(destination, '.ecarteo-backup-destination'), 'wrong');
      await expect(latestVerifiedBackup({ destination })).rejects.toThrow('Unapproved');
    });
  });
});
