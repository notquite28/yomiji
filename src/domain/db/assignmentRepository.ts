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

export async function applyLocalReviewResult(
  db: AppDatabase,
  assignmentId: number,
  incorrectMeaningAnswers: number,
  incorrectReadingAnswers: number,
  reviewedAt: string,
): Promise<void> {
  const row = await db.getFirstAsync<{
    subject_id: number;
    level: number | null;
    srs_stage: number;
    subject_type: string | null;
  }>(
    `SELECT subject_id, level, srs_stage, subject_type
     FROM assignments
     WHERE id = ?`,
    assignmentId,
  );

  if (!row) {
    return;
  }

  const totalIncorrect = incorrectMeaningAnswers + incorrectReadingAnswers;
  const hasMistake = totalIncorrect > 0;
  // Mirror WaniKani's SRS stage change: on a miss the stage drops by
  // ceil(total_incorrect / 2) * penalty, where the penalty factor is 2 once an
  // item has reached Guru (stage >= 5) and 1 otherwise, floored at stage 1. On
  // a clean answer the stage advances by one, capped at burned (stage 9).
  const incorrectAdjustment = Math.ceil(totalIncorrect / 2);
  const penaltyFactor = row.srs_stage >= 5 ? 2 : 1;
  const nextStage = hasMistake
    ? Math.max(1, row.srs_stage - incorrectAdjustment * penaltyFactor)
    : Math.min(9, row.srs_stage + 1);

  // Mark the item as passed locally when it first crosses into Guru so the
  // dashboard's "passed" count reflects offline reviews before the next sync.
  const passedNow = !hasMistake && row.srs_stage < 5 && nextStage >= 5;

  if (passedNow) {
    await db.runAsync(
      'UPDATE assignments SET srs_stage = ?, available_at = NULL, passed_at = COALESCE(passed_at, ?) WHERE id = ?',
      nextStage,
      reviewedAt,
      assignmentId,
    );
  } else {
    await db.runAsync(
      'UPDATE assignments SET srs_stage = ?, available_at = NULL WHERE id = ?',
      nextStage,
      assignmentId,
    );
  }

  if (hasMistake) {
    await db.runAsync(
      `INSERT INTO subject_progress (subject_id, level, srs_stage, subject_type, last_mistake_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(subject_id) DO UPDATE SET
         level = excluded.level,
         srs_stage = excluded.srs_stage,
         subject_type = excluded.subject_type,
         last_mistake_at = excluded.last_mistake_at`,
      row.subject_id,
      row.level,
      nextStage,
      row.subject_type,
      reviewedAt,
    );
  } else {
    await db.runAsync(
      `INSERT INTO subject_progress (subject_id, level, srs_stage, subject_type, last_mistake_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(subject_id) DO UPDATE SET
         level = excluded.level,
         srs_stage = excluded.srs_stage,
         subject_type = excluded.subject_type`,
      row.subject_id,
      row.level,
      nextStage,
      row.subject_type,
    );
  }
}
