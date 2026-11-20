import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { lstat, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const archivePattern =
  /^ecarteo-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tar\.age$/;

export async function archiveHash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file, {
    flags: constants.O_RDONLY | constants.O_NOFOLLOW,
  }))
    digest.update(chunk);
  return digest.digest('hex');
}

async function destinationReady(destination) {
  if (!destination || !isAbsolute(destination)) throw new Error('Absolute destination required');
  const marker = join(destination, '.ecarteo-backup-destination');
  const stat = await lstat(marker);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe destination marker');
  if ((await readFile(marker, 'utf8')).trim() !== 'ecarteo-archive-v1')
    throw new Error('Unapproved destination');
}

function archiveTime(archive) {
  const match = archivePattern.exec(archive);
  if (!match) throw new Error('Invalid archive name');
  const iso = match[1].replace(/T(\d\d)-(\d\d)-(\d\d)/, 'T$1:$2:$3');
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== iso)
    throw new Error('Invalid snapshot time');
  return time;
}

export async function writeBackupReceipt(destination, receipt) {
  await destinationReady(destination);
  const asOf = archiveTime(receipt.archive);
  if (Date.parse(receipt.asOf) !== asOf || !/^[a-f0-9]{64}$/.test(receipt.sha256))
    throw new Error('Invalid backup receipt');
  const archive = join(destination, receipt.archive);
  const stat = await lstat(archive);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error('Unsafe archive');
  const complete = { version: 1, ...receipt, bytes: stat.size };
  const final = `${archive}.receipt.json`;
  const temporary = `${final}.${randomUUID()}.partial`;
  try {
    await writeFile(temporary, JSON.stringify(complete, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, final);
  } finally {
    await rm(temporary, { force: true });
  }
  return complete;
}

export async function latestVerifiedBackup({ destination, maxAgeHours = 36, now = Date.now() }) {
  await destinationReady(destination);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 24 * 365)
    throw new Error('Invalid backup age policy');
  const candidates = (await readdir(destination)).filter((name) => archivePattern.test(name));
  candidates.sort((left, right) => archiveTime(right) - archiveTime(left));
  const archive = candidates[0];
  if (!archive) throw new Error('No complete backup');
  const file = join(destination, archive);
  const receiptFile = `${file}.receipt.json`;
  const [stat, receiptStat] = await Promise.all([lstat(file), lstat(receiptFile)]);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !receiptStat.isFile() ||
    receiptStat.isSymbolicLink() ||
    stat.size === 0 ||
    receiptStat.size > 8192
  )
    throw new Error('Unsafe backup files');
  const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
  // Existing manually verified receipts predate version 1 and share these fields.
  if (
    (receipt.version !== undefined && receipt.version !== 1) ||
    receipt.archive !== archive ||
    Date.parse(receipt.asOf) !== archiveTime(archive) ||
    receipt.bytes !== stat.size ||
    !/^[a-f0-9]{64}$/.test(receipt.sha256)
  )
    throw new Error('Invalid backup receipt');
  const ageHours = (now - archiveTime(archive)) / 3_600_000;
  if (ageHours < -0.25 || ageHours > maxAgeHours)
    throw new Error('Backup is stale or future-dated');
  if ((await archiveHash(file)) !== receipt.sha256) throw new Error('Archive checksum mismatch');
  return { asOf: receipt.asOf, archive, ageHours: Math.max(0, ageHours), sha256: receipt.sha256 };
}
