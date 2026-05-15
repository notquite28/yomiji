import type * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { openAppDatabase } from "../db/database";
import { loadSettings } from "../settings/settings";
import * as ExpoNotifications from "./expoNotifications";

import { computeUpcomingReviewSchedule } from "./computeUpcomingReviews";
import { isInQuietHours } from "./quietHours";
import type { NotificationConfig } from "./types";
import { MAX_SCHEDULED_NOTIFICATIONS, NOTIFICATION_ID_PREFIX } from "./types";

// ---------------------------------------------------------------------------
// Android notification channel
// ---------------------------------------------------------------------------

const REVIEW_CHANNEL_ID = "reviews";

export async function ensureReviewNotificationChannel(): Promise<void> {
	if (Platform.OS !== "android") return;

	await ExpoNotifications.setNotificationChannelAsync(REVIEW_CHANNEL_ID, {
		name: "Review Notifications",
		importance: ExpoNotifications.AndroidImportance?.HIGH ?? 4,
		vibrationPattern: [0, 250, 250, 250],
		showBadge: true,
		description: "Notifications when WaniKani reviews become available",
	});
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type PermissionStatus = "granted" | "denied" | "undetermined";

export async function getNotificationPermissionStatus(): Promise<PermissionStatus> {
	const settings = await ExpoNotifications.getPermissionsAsync();
	if (settings.granted) return "granted";
	if (Platform.OS === "ios") {
		const iosStatus = settings.ios?.status;
		if (
			iosStatus === ExpoNotifications.IosAuthorizationStatus?.PROVISIONAL ||
			iosStatus === ExpoNotifications.IosAuthorizationStatus?.EPHEMERAL
		) {
			return "granted";
		}
		if (
			iosStatus === ExpoNotifications.IosAuthorizationStatus?.NOT_DETERMINED
		) {
			return "undetermined";
		}
		return "denied";
	}
	return "denied";
}

export async function requestNotificationPermissions(): Promise<boolean> {
	const result = await ExpoNotifications.requestPermissionsAsync({
		ios: {
			allowAlert: true,
			allowBadge: true,
			allowSound: true,
		},
	});
	return result.granted;
}

// ---------------------------------------------------------------------------
// Read notification config from app settings
// ---------------------------------------------------------------------------

async function readNotificationConfig(): Promise<NotificationConfig> {
	const settings = await loadSettings();
	return {
		allReviews: settings.notificationsAllReviews,
		badging: settings.notificationsBadging,
		sounds: settings.notificationSounds,
		quietHoursEnabled: settings.notificationQuietHoursEnabled,
		quietHoursStart: settings.notificationQuietHoursStart,
		quietHoursEnd: settings.notificationQuietHoursEnd,
		scheduleWindow: settings.notificationScheduleWindow,
		minReviewCount: settings.notificationMinReviewCount,
	};
}

/**
 * Check whether the OS allows a specific notification capability.
 * On iOS, the granular allows* flags are available under settings.ios.
 * On Android, all capabilities are available once the permission is granted.
 */
function osAllowsCapability(
	systemSettings: Notifications.NotificationPermissionsStatus,
	capability: "alert" | "badge" | "sound",
): boolean {
	if (Platform.OS === "ios") {
		const ios = systemSettings.ios;
		if (!ios) return true;
		switch (capability) {
			case "alert":
				return ios.allowsAlert !== false;
			case "badge":
				return ios.allowsBadge !== false;
			case "sound":
				return ios.allowsSound !== false;
		}
	}
	return true;
}

// ---------------------------------------------------------------------------
// Core scheduling
// ---------------------------------------------------------------------------

/**
 * Schedule local review notifications based on current assignment data.
 *
 * Follows the tsurukame pattern:
 * 1. Cancel all previously scheduled review notifications.
 * 2. Set badge to current available review count immediately.
 * 3. For each upcoming hour with new reviews, schedule a notification with
 *    cumulative badge count.
 *
 * Respects:
 * - Vacation mode (clears everything)
 * - Notification settings (allReviews, badging, sounds)
 * - Quiet hours (suppresses notifications during configured hours)
 * - Schedule window (how far ahead to schedule)
 * - Minimum review count threshold
 * - iOS 64-notification cap (we use MAX_SCHEDULED_NOTIFICATIONS = 50)
 * - OS-level permission check
 */
export async function rescheduleReviewNotifications(): Promise<void> {
	const config = await readNotificationConfig();

	// If no notification feature is enabled, clear and bail.
	if (!config.allReviews && !config.badging) {
		await clearReviewNotifications();
		return;
	}

	// Check OS-level permission.
	const permissionStatus = await getNotificationPermissionStatus();
	if (permissionStatus === "denied") {
		await clearReviewNotifications();
		return;
	}
	if (permissionStatus === "undetermined") {
		// Don't schedule until the user grants permission via settings.
		return;
	}

	const db = await openAppDatabase();
	const schedule = await computeUpcomingReviewSchedule(
		db,
		config.scheduleWindow,
	);

	// Vacation mode: clear badge and notifications.
	if (schedule.isVacation) {
		await clearReviewNotifications();
		return;
	}

	// Cancel all previously scheduled review notifications.
	await cancelScheduledReviewNotifications();

	// Set badge immediately to current available reviews.
	if (config.badging) {
		await ExpoNotifications.setBadgeCountAsync(schedule.availableReviewCount);
	}

	// Get system notification settings for capability checks.
	const systemSettings = await ExpoNotifications.getPermissionsAsync();

	// Schedule future notifications.
	let cumulative = schedule.availableReviewCount;
	let scheduled = 0;
	const now = new Date();

	const triggerType = ExpoNotifications.SchedulableTriggerInputTypes?.DATE;
	if (!triggerType) {
		return;
	}

	for (const hourSlot of schedule.upcomingHours) {
		if (scheduled >= MAX_SCHEDULED_NOTIFICATIONS) break;

		cumulative += hourSlot.newReviews;

		const triggerDate = parseHourKeyToDate(hourSlot.hour);
		if (triggerDate <= now) continue;

		if (config.quietHoursEnabled && isInQuietHours(triggerDate, config)) {
			continue;
		}

		if (cumulative < config.minReviewCount) {
			continue;
		}

		const content: Notifications.NotificationContentInput = {
			title: "Reviews Available",
			data: { screen: "reviews" },
		};

		// Set alert body only if user wants all-review notifications AND system allows alerts.
		if (config.allReviews && osAllowsCapability(systemSettings, "alert")) {
			content.body = `${cumulative} review${cumulative === 1 ? "" : "s"} available (${hourSlot.newReviews} new)`;
		}

		// Set badge on the notification (iOS updates badge when notification fires).
		if (config.badging && osAllowsCapability(systemSettings, "badge")) {
			content.badge = cumulative;
		}

		// Set sound if enabled (iOS only; Android uses channel sound).
		if (
			Platform.OS === "ios" &&
			config.sounds &&
			osAllowsCapability(systemSettings, "sound")
		) {
			content.sound = "default";
		}

		await ExpoNotifications.scheduleNotificationAsync({
			identifier: `${NOTIFICATION_ID_PREFIX}${hourSlot.hour}`,
			content,
			trigger: {
				type: triggerType,
				date: triggerDate,
			},
		});

		scheduled++;
	}

}

/**
 * Clear all review notifications and reset the badge.
 */
export async function clearReviewNotifications(): Promise<void> {
	await cancelScheduledReviewNotifications();
	await ExpoNotifications.setBadgeCountAsync(0);
}

/**
 * Cancel only our review-hour-* notifications, leaving any other scheduled
 * notifications intact.
 */
async function cancelScheduledReviewNotifications(): Promise<void> {
	const scheduled = await ExpoNotifications.getAllScheduledNotificationsAsync();
	const toCancel = scheduled.filter((notif) =>
		notif.identifier.startsWith(NOTIFICATION_ID_PREFIX),
	);
	if (toCancel.length === 0) return;
	await Promise.all(
		toCancel.map((notif) =>
			ExpoNotifications.cancelScheduledNotificationAsync(notif.identifier),
		),
	);
}

/**
 * Parse an hour key like "2026-05-13T15:00:00" into a Date.
 * SQLite's strftime with 'localtime' produces local-time strings without timezone offsets,
 * so we interpret these as local time.
 */
function parseHourKeyToDate(hourKey: string): Date {
	const [datePart, timePart] = hourKey.split("T");
	const [year, month, day] = datePart!.split("-").map(Number);
	const [hour, minute, second] = timePart!.split(":").map(Number);
	return new Date(year!, month! - 1, day!, hour!, minute!, second!);
}
