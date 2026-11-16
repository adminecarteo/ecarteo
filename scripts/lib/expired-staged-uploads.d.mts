import type postgres from 'postgres';

export function countExpiredStagedUploads(db: postgres.Sql): Promise<number>;
export function removeExpiredStagedUploads(
  db: postgres.Sql,
  removeObjects: (paths: string[]) => Promise<void>,
): Promise<number>;
