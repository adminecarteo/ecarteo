export interface BackupReceipt {
  asOf: string;
  archive: string;
  sha256: string;
}
export function archiveHash(file: string): Promise<string>;
export function writeBackupReceipt(
  destination: string,
  receipt: BackupReceipt,
): Promise<BackupReceipt & { version: number; bytes: number }>;
export function latestVerifiedBackup(options: {
  destination: string;
  maxAgeHours?: number;
  now?: number;
}): Promise<BackupReceipt & { ageHours: number }>;
