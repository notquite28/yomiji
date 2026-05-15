/** Hourly review forecast for notification scheduling. */
export type UpcomingReviewHour = {
	/** ISO datetime string for the start of this hour bucket. */
	hour: string;
	/** Number of new reviews becoming available in this hour. */
	newReviews: number;
};

/** Result of computing upcoming reviews for notification scheduling. */
export type UpcomingReviewSchedule = {
	/** Number of reviews available right now. */
	availableReviewCount: number;
	/** Hourly buckets for the scheduling window (starting from next whole hour). */
	upcomingHours: UpcomingReviewHour[];
	/** Whether the user is in vacation mode. */
	isVacation: boolean;
};

/** Notification scheduling configuration derived from user settings. */
export type NotificationConfig = {
	/** Send alert notifications when reviews become available. */
	allReviews: boolean;
	/** Update the app icon badge with cumulative review count. */
	badging: boolean;
	/** Play a sound with notifications. */
	sounds: boolean;
	/** Whether quiet hours suppression is enabled. */
	quietHoursEnabled: boolean;
	/** Quiet hours start hour (0-23, local time). */
	quietHoursStart: number;
	/** Quiet hours end hour (0-23, local time). */
	quietHoursEnd: number;
	/** How many hours ahead to schedule notifications. */
	scheduleWindow: number;
	/** Minimum cumulative review count to trigger a notification. */
	minReviewCount: number;
};

/** Maximum number of scheduled notifications (iOS caps at 64). */
export const MAX_SCHEDULED_NOTIFICATIONS = 50;

/** Notification identifier prefix for review hour slots. */
export const NOTIFICATION_ID_PREFIX = "review-hour-";
