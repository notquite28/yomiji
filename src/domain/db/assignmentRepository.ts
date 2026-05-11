import { AppDatabase } from './database';

export type SrsDistribution = {
  apprentice: number;
  guru: number;
  master: number;
  enlightened: number;
  burned: number;
};

export async function countAvailableReviews(db: AppDatabase): Promise<number> {
  const now = new Date().toISOString();
  const row = await db.getFirstAsync<{ value: number }>(
    `SELECT COUNT(*) AS value
     FROM assignments
     WHERE srs_stage BETWEEN 1 AND 8
       AND available_at IS NOT NULL
       AND available_at <= ?`,
    now,
  );
  return row?.value ?? 0;
}

export async function countAvailableLessons(db: AppDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: number }>(
    `SELECT COUNT(*) AS value
     FROM assignments
     WHERE srs_stage = 0
       AND started_at IS NULL`,
  );
  return row?.value ?? 0;
}

export async function getSrsDistribution(db: AppDatabase): Promise<SrsDistribution> {
  const rows = await db.getAllAsync<{ bucket: string; value: number }>(
    `SELECT
       CASE
         WHEN srs_stage BETWEEN 1 AND 4 THEN 'apprentice'
         WHEN srs_stage BETWEEN 5 AND 6 THEN 'guru'
         WHEN srs_stage = 7 THEN 'master'
         WHEN srs_stage = 8 THEN 'enlightened'
         WHEN srs_stage = 9 THEN 'burned'
         ELSE 'other'
       END AS bucket,
       COUNT(*) AS value
     FROM assignments
     WHERE srs_stage > 0
     GROUP BY bucket`,
  );
  const srs = Object.fromEntries(rows.map((row) => [row.bucket, row.value]));
  return {
    apprentice: srs.apprentice ?? 0,
    guru: srs.guru ?? 0,
    master: srs.master ?? 0,
    enlightened: srs.enlightened ?? 0,
    burned: srs.burned ?? 0,
  };
}

export async function clearAssignmentAvailableAt(db: AppDatabase, assignmentId: number): Promise<void> {
  await db.runAsync('UPDATE assignments SET available_at = NULL WHERE id = ?', assignmentId);
}

export async function markAssignmentStarted(db: AppDatabase, assignmentId: number, startedAt: string): Promise<void> {
  await db.runAsync(
    'UPDATE assignments SET started_at = ?, srs_stage = 1 WHERE id = ?',
    startedAt,
    assignmentId,
  );
}
