import { countAvailableLessons, countAvailableReviews, getSrsDistribution } from '../db/assignmentRepository';
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
  const availableReviews = await countAvailableReviews(db);
  const availableLessons = await countAvailableLessons(db);
  const cachedSubjects = await countCachedSubjects(db);
  const srs = await getSrsDistribution(db);
  const lastSync = await db.getFirstAsync<{ synced_at: string }>(
    'SELECT synced_at FROM sync_cursors ORDER BY synced_at DESC LIMIT 1',
  );

  return {
    username: user?.username,
    level: user?.level,
    vacationStartedAt: user?.vacation_started_at,
    availableLessons,
    availableReviews,
    ...srs,
    cachedSubjects,
    lastSyncedAt: lastSync?.synced_at,
  };
}

async function countCachedSubjects(db: AppDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: number }>('SELECT COUNT(*) AS value FROM subjects');
  return row?.value ?? 0;
}

export type ReviewForecastHour = {
  hour: string;
  count: number;
};

export async function getReviewForecast(db: AppDatabase, hours = 48): Promise<ReviewForecastHour[]> {
  const now = new Date();
  const rows = await db.getAllAsync<{ bucket: string; value: number }>(
    `SELECT
       strftime('%Y-%m-%dT%H:00:00', available_at) AS bucket,
       COUNT(*) AS value
     FROM assignments
     WHERE srs_stage BETWEEN 1 AND 8
       AND available_at IS NOT NULL
       AND available_at > ?
       AND available_at <= ?
     GROUP BY bucket
     ORDER BY bucket`,
    now.toISOString(),
    new Date(now.getTime() + hours * 3600_000).toISOString(),
  );

  const byHour = new Map(rows.map((r) => [r.bucket, r.value]));
  const result: ReviewForecastHour[] = [];
  for (let i = 0; i <= hours; i++) {
    const hourDate = new Date(now.getTime() + i * 3600_000);
    const key = hourDate.toISOString().slice(0, 13) + ':00:00';
    result.push({ hour: key, count: byHour.get(key) ?? 0 });
  }
  return result;
}

export type LevelProgress = {
  subjectType: string;
  total: number;
  passed: number;
};

export async function getCurrentLevelProgress(db: AppDatabase): Promise<LevelProgress[]> {
  const user = await db.getFirstAsync<{ level: number }>('SELECT level FROM user WHERE id = 1');
  if (!user?.level) return [];

  const types = ['radical', 'kanji', 'vocabulary'] as const;
  const result: LevelProgress[] = [];

  for (const subjectType of types) {
    const totalRow = await db.getFirstAsync<{ value: number }>(
      'SELECT COUNT(*) AS value FROM subjects WHERE level = ? AND subject_type = ?',
      user.level,
      subjectType,
    );
    const passedRow = await db.getFirstAsync<{ value: number }>(
      `SELECT COUNT(*) AS value
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       WHERE s.level = ?
         AND s.subject_type = ?
         AND a.passed_at IS NOT NULL`,
      user.level,
      subjectType,
    );
    const total = totalRow?.value ?? 0;
    if (total > 0) {
      result.push({ subjectType, total, passed: passedRow?.value ?? 0 });
    }
  }

  return result;
}

export type RecentItem = {
  subjectId: number;
  japanese: string;
  subjectType: string;
  level: number;
  timestamp: string;
};

export async function getRecentLessons(db: AppDatabase, limit = 10): Promise<RecentItem[]> {
  const rows = await db.getAllAsync<{
    subject_id: number;
    japanese: string;
    subject_type: string;
    level: number;
    started_at: string;
  }>(
    `SELECT a.subject_id, s.japanese, s.subject_type, s.level, a.started_at
     FROM assignments a
     JOIN subjects s ON s.id = a.subject_id
     WHERE a.started_at IS NOT NULL
     ORDER BY a.started_at DESC
     LIMIT ?`,
    limit,
  );
  return rows.map((r) => ({
    subjectId: r.subject_id,
    japanese: r.japanese ?? '',
    subjectType: r.subject_type,
    level: r.level,
    timestamp: r.started_at,
  }));
}

export async function getRecentMistakes(db: AppDatabase, limit = 10): Promise<RecentItem[]> {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const rows = await db.getAllAsync<{
    subject_id: number;
    japanese: string;
    subject_type: string;
    level: number;
    last_mistake_at: string;
  }>(
    `SELECT sp.subject_id, s.japanese, s.subject_type, s.level, sp.last_mistake_at
     FROM subject_progress sp
     JOIN subjects s ON s.id = sp.subject_id
     WHERE sp.last_mistake_at IS NOT NULL AND sp.last_mistake_at >= ?
     ORDER BY sp.last_mistake_at DESC
     LIMIT ?`,
    cutoff,
    limit,
  );
  return rows.map((r) => ({
    subjectId: r.subject_id,
    japanese: r.japanese ?? '',
    subjectType: r.subject_type,
    level: r.level,
    timestamp: r.last_mistake_at,
  }));
}

export type LeechedItem = {
  subjectId: number;
  japanese: string;
  subjectType: string;
  level: number;
  meaningIncorrect: number;
  meaningCorrect: number;
  readingIncorrect: number;
  readingCorrect: number;
  score: number;
};

export function calculateLeechScore(incorrect: number, correct: number): number {
  const total = incorrect + correct;
  if (total <= 0) return 0;
  return Math.round((incorrect / total) * 100);
}

export async function getLeechedItems(db: AppDatabase, options?: { apprenticeOnly?: boolean; limit?: number }): Promise<LeechedItem[]> {
  const apprenticeOnly = options?.apprenticeOnly ?? false;
  const limit = options?.limit ?? 20;

  const srsFilter = apprenticeOnly ? 'AND a.srs_stage BETWEEN 1 AND 4' : '';
  const rows = await db.getAllAsync<{
    subject_id: number;
    japanese: string;
    subject_type: string;
    level: number;
    meaning_incorrect: number;
    meaning_correct: number;
    reading_incorrect: number;
    reading_correct: number;
  }>(
    `SELECT
       rs.subject_id,
       s.japanese,
       COALESCE(rs.subject_type, s.subject_type) AS subject_type,
       s.level,
       CAST(COALESCE(json_extract(rs.payload, '$.data.meaning_incorrect'), 0) AS INTEGER) AS meaning_incorrect,
       CAST(COALESCE(json_extract(rs.payload, '$.data.meaning_correct'), 0) AS INTEGER) AS meaning_correct,
       CAST(COALESCE(json_extract(rs.payload, '$.data.reading_incorrect'), 0) AS INTEGER) AS reading_incorrect,
       CAST(COALESCE(json_extract(rs.payload, '$.data.reading_correct'), 0) AS INTEGER) AS reading_correct
     FROM review_stats rs
     JOIN subjects s ON s.id = rs.subject_id
     JOIN assignments a ON a.subject_id = rs.subject_id
     WHERE (json_extract(rs.payload, '$.data.meaning_incorrect') + json_extract(rs.payload, '$.data.reading_incorrect')) > 0
       ${srsFilter}
     ORDER BY (COALESCE(json_extract(rs.payload, '$.data.meaning_incorrect'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.reading_incorrect'), 0)) * 1.0
       / NULLIF(
         COALESCE(json_extract(rs.payload, '$.data.meaning_correct'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.meaning_incorrect'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.reading_correct'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.reading_incorrect'), 0), 0) DESC
     LIMIT ?`,
    limit,
  );

  return rows.map((r) => ({
    subjectId: r.subject_id,
    japanese: r.japanese ?? '',
    subjectType: r.subject_type,
    level: r.level,
    meaningIncorrect: r.meaning_incorrect,
    meaningCorrect: r.meaning_correct,
    readingIncorrect: r.reading_incorrect,
    readingCorrect: r.reading_correct,
    score: calculateLeechScore(
      r.meaning_incorrect + r.reading_incorrect,
      r.meaning_correct + r.reading_correct,
    ),
  }));
}

export async function getBurnedItemCount(db: AppDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: number }>(
    'SELECT COUNT(*) AS value FROM assignments WHERE srs_stage = 9',
  );
  return row?.value ?? 0;
}

export async function getExcludedItemCount(db: AppDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: number }>(
    `SELECT COUNT(*) AS value FROM study_materials
     WHERE json_extract(payload, '$.data.hidden') = 1
        OR json_extract(payload, '$.data.hidden') = 'true'`,
  );
  return row?.value ?? 0;
}
