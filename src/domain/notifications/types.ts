/** Notification scheduling configuration derived from user settings. */
export type NotificationConfig = {
	/** Master toggle: schedule notifications. */
	enabled: boolean;
	/** Update the app icon badge with current review count. */
	badging: boolean;
	/** Play a sound when notification fires. */
	sounds: boolean;
	/** Review count threshold for early notification. */
	threshold: number;
	/** Hour (0-23) for daily reminder notification, or null to disable. */
	dailyTime: number | null;
};

/** Notification identifier for the review-available notification. */
export const NOTIFICATION_ID_REVIEW = "review-available";

/** Notification identifier for the daily summary notification. */
export const NOTIFICATION_ID_DAILY = "review-daily";
