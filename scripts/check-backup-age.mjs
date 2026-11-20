#!/usr/bin/env node
import { latestVerifiedBackup } from './lib/backup-receipt.mjs';

try {
  const result = await latestVerifiedBackup({
    destination: process.env.ECARTEO_BACKUP_DESTINATION,
    maxAgeHours: Number(process.env.ECARTEO_BACKUP_MAX_AGE_HOURS || '36'),
  });
  console.log(JSON.stringify({ event: 'backup_check', status: 'ready', ...result }));
} catch {
  console.error(JSON.stringify({ event: 'backup_check', status: 'unavailable' }));
  process.exitCode = 1;
}
