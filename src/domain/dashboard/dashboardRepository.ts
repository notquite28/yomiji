import { countAvailableLessons, countAvailableReviews, getSrsDistribution } from '../db/assignmentRepository';
import { AppDatabase } from '../db/database';
import { countSubjects } from '../db/subjectRepository';

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
  const cachedSubjects = await countSubjects(db);
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
