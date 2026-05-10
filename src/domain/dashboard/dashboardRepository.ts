import * as SQLite from 'expo-sqlite';

import { AppDatabase } from '../db/database';

export type DashboardSummary = {
  username?: string;
  level?: number;
  vacationStartedAt?: string | null;
  availableLessons: number;
  availableReviews: number;
  apprentice: number;
  guru: number;
  master: number;
  enlightened: number;
  burned: number;
  cachedSubjects: number;
  lastSyncedAt?: string;
};

export async function getDashboardSummary(db: AppDatabase): Promise<DashboardSummary> {
  const user = await db.getFirstAsync<{ username: string; level: number; vacation_started_at: string | null }>(
    'SELECT username, level, vacation_started_at FROM user WHERE id = 1',
  );
  const now = new Date().toISOString();
  const availableReviews = await count(
    db,
    `SELECT COUNT(*) AS value
     FROM assignments
     WHERE srs_stage BETWEEN 1 AND 8
       AND available_at IS NOT NULL
       AND available_at <= ?`,
    [now],
  );
  const availableLessons = await count(
    db,
    `SELECT COUNT(*) AS value
     FROM assignments
     WHERE srs_stage = 0
       AND started_at IS NULL`,
  );
  const cachedSubjects = await count(db, 'SELECT COUNT(*) AS value FROM subjects');
  const srsRows = await db.getAllAsync<{ bucket: string; value: number }>(
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
  const srs = Object.fromEntries(srsRows.map((row) => [row.bucket, row.value]));
  const lastSync = await db.getFirstAsync<{ synced_at: string }>(
    'SELECT synced_at FROM sync_cursors ORDER BY synced_at DESC LIMIT 1',
  );

  return {
    username: user?.username,
    level: user?.level,
    vacationStartedAt: user?.vacation_started_at,
    availableLessons,
    availableReviews,
    apprentice: srs.apprentice ?? 0,
    guru: srs.guru ?? 0,
    master: srs.master ?? 0,
    enlightened: srs.enlightened ?? 0,
    burned: srs.burned ?? 0,
    cachedSubjects,
    lastSyncedAt: lastSync?.synced_at,
  };
}

async function count(db: AppDatabase, sql: string, params: SQLite.SQLiteBindValue[] = []) {
  const row = await db.getFirstAsync<{ value: number }>(sql, ...params);
  return row?.value ?? 0;
}
