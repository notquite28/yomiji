import { AppDatabase } from './database';

export async function countReviewStats(db: AppDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: number }>('SELECT COUNT(*) AS value FROM review_stats');
  return row?.value ?? 0;
}
