import type { NotificationConfig } from "./types";

/**
 * Check whether a given date falls within the user's quiet hours window.
 * Quiet hours wrap across midnight (e.g., 22:00–07:00).
 */
export function isInQuietHours(
	date: Date,
	config: Pick<NotificationConfig, "quietHoursStart" | "quietHoursEnd">,
): boolean {
	const hour = date.getHours();
	const { quietHoursStart, quietHoursEnd } = config;

	if (quietHoursStart === quietHoursEnd) return false;

	if (quietHoursStart < quietHoursEnd) {
		return hour >= quietHoursStart && hour < quietHoursEnd;
	}

	return hour >= quietHoursStart || hour < quietHoursEnd;
}
