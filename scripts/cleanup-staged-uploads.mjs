import { evidenceStorage, maintenanceDatabase, safeFailure } from './ops-common.mjs';
import {
  countExpiredStagedUploads,
  removeExpiredStagedUploads,
} from './lib/expired-staged-uploads.mjs';

let db;
try {
  db = maintenanceDatabase();
  if (!process.argv.includes('--apply')) {
    const count = await countExpiredStagedUploads(db);
    console.log(
      `${count} expired staged uploads eligible. Use --apply to remove their objects and reservations.`,
    );
  } else {
    const bucket = evidenceStorage();
    const removed = await removeExpiredStagedUploads(db, async (paths) => {
      const { error } = await bucket.remove(paths);
      if (error) throw new Error('Storage cleanup failed');
    });
    console.log(`Removed ${removed} expired staged uploads. Repeat while the batch is full.`);
  }
} catch {
  safeFailure();
} finally {
  await db?.end({ timeout: 5 });
}
