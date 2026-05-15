import type { AppDatabase } from "../db/database";

import type { UpcomingReviewHour, UpcomingReviewSchedule } from "./types";

/**
 * Compute the upcoming review schedule for notification scheduling.
 *
 * Returns the current available review count plus hourly buckets of new reviews
 * arriving over the next `hours` hours. The first bucket starts at the next whole hour
 * after `now`.
 *
 * This mirrors tsurukame's `upcomingReviews` array: the current available count is
 * separate (used for the immediate badge), and the hourly array represents future arrivals.
 */
export async function computeUpcomingReviewSchedule(
	db: AppDatabase,
	hours = 48,
	now = new Date(),
): Promise<UpcomingReviewSchedule> {
	// Check vacation mode
	const user = await db.getFirstAsync<{ vacation_started_at: string | null }>(
		"SELECT vacation_started_at FROM user WHERE id = 1",
	);
	const isVacation = user?.vacation_started_at != null;

	// Current available reviews
	const availableRow = await db.getFirstAsync<{ value: number }>(
		`SELECT COUNT(*) AS value
     FROM assignments
     WHERE srs_stage BETWEEN 1 AND 8
       AND available_at IS NOT NULL
       AND available_at <= ?`,
		now.toISOString(),
	);
	const availableReviewCount = availableRow?.value ?? 0;

	if (isVacation) {
		return { availableReviewCount, upcomingHours: [], isVacation: true };
	}

	// Upcoming reviews grouped by whole-hour buckets starting from the next whole hour.
	// We use the next whole hour as the start boundary so we don't double-count
	// reviews that are already available now.
	const nextWholeHour = new Date(now);
	nextWholeHour.setMinutes(0, 0, 0);
	nextWholeHour.setHours(nextWholeHour.getHours() + 1);

	const endWindow = new Date(nextWholeHour.getTime() + hours * 3600_000);

	const rows = await db.getAllAsync<{ bucket: string; value: number }>(
		`SELECT
		strftime('%Y-%m-%dT%H:00:00', available_at, 'localtime') AS bucket,
       COUNT(*) AS value
     FROM assignments
     WHERE srs_stage BETWEEN 1 AND 8
       AND available_at IS NOT NULL
       AND available_at >= ?
       AND available_at <= ?
     GROUP BY bucket
     ORDER BY bucket`,
		nextWholeHour.toISOString(),
		endWindow.toISOString(),
	);

	const byHour = new Map(rows.map((r) => [r.bucket, r.value]));

	const upcomingHours: UpcomingReviewHour[] = [];
	for (let i = 0; i < hours; i++) {
		const hourDate = new Date(nextWholeHour.getTime() + i * 3600_000);
		const key = formatHourKey(hourDate);
		const count = byHour.get(key) ?? 0;
		if (count > 0) {
			upcomingHours.push({
				hour: key,
				newReviews: count,
			});
		}
	}

	return { availableReviewCount, upcomingHours, isVacation: false };
}

/**
 * Format a Date as the ISO-ish hour key used in SQL grouping.
 * e.g. "2026-05-13T15:00:00" (no timezone offset — matches SQLite strftime
 * with 'localtime' modifier output).
 */
function formatHourKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	return `${y}-${m}-${d}T${h}:00:00`;
}
