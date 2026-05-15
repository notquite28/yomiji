import { computeUpcomingReviewSchedule } from "./computeUpcomingReviews";
import { isInQuietHours } from "./quietHours";
import { NOTIFICATION_ID_PREFIX, MAX_SCHEDULED_NOTIFICATIONS } from "./types";

describe("notification types", () => {
	test("NOTIFICATION_ID_PREFIX is stable", () => {
		expect(NOTIFICATION_ID_PREFIX).toBe("review-hour-");
	});

	test("MAX_SCHEDULED_NOTIFICATIONS is under iOS 64-notification cap", () => {
		expect(MAX_SCHEDULED_NOTIFICATIONS).toBeLessThanOrEqual(63);
		expect(MAX_SCHEDULED_NOTIFICATIONS).toBe(50);
	});
});

describe("computeUpcomingReviewSchedule hour-key format", () => {
	test("hour keys follow the expected format", async () => {
		const mockDb = {
			getFirstAsync: jest.fn().mockResolvedValue({ vacation_started_at: null }),
			getAllAsync: jest.fn().mockResolvedValue([
				{ bucket: "2026-05-14T11:00:00", value: 5 },
			]),
		} as unknown as Parameters<typeof computeUpcomingReviewSchedule>[0];

		(mockDb.getFirstAsync as jest.Mock).mockImplementation((sql: string) => {
			if (sql.includes("vacation_started_at")) {
				return Promise.resolve({ vacation_started_at: null });
			}
			return Promise.resolve({ value: 0 });
		});

		const result = await computeUpcomingReviewSchedule(
			mockDb,
			48,
			new Date("2026-05-14T10:30:00"),
		);

		for (const hour of result.upcomingHours) {
			expect(hour.hour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00$/);
		}
	});
});

describe("isInQuietHours", () => {
	function dateAtHour(hour: number): Date {
		return new Date(2026, 4, 14, hour, 30, 0);
	}

	test("returns false when start equals end", () => {
		const date = dateAtHour(12);
		expect(isInQuietHours(date, { quietHoursStart: 10, quietHoursEnd: 10 })).toBe(false);
	});

	test("same-day range: hour inside quiet hours", () => {
		expect(isInQuietHours(dateAtHour(9), { quietHoursStart: 8, quietHoursEnd: 12 })).toBe(true);
		expect(isInQuietHours(dateAtHour(11), { quietHoursStart: 8, quietHoursEnd: 12 })).toBe(true);
	});

	test("same-day range: hour outside quiet hours", () => {
		expect(isInQuietHours(dateAtHour(7), { quietHoursStart: 8, quietHoursEnd: 12 })).toBe(false);
		expect(isInQuietHours(dateAtHour(12), { quietHoursStart: 8, quietHoursEnd: 12 })).toBe(false);
		expect(isInQuietHours(dateAtHour(15), { quietHoursStart: 8, quietHoursEnd: 12 })).toBe(false);
	});

	test("wrap-midnight range: hour inside quiet hours", () => {
		expect(isInQuietHours(dateAtHour(22), { quietHoursStart: 22, quietHoursEnd: 7 })).toBe(true);
		expect(isInQuietHours(dateAtHour(23), { quietHoursStart: 22, quietHoursEnd: 7 })).toBe(true);
		expect(isInQuietHours(dateAtHour(0), { quietHoursStart: 22, quietHoursEnd: 7 })).toBe(true);
		expect(isInQuietHours(dateAtHour(3), { quietHoursStart: 22, quietHoursEnd: 7 })).toBe(true);
		expect(isInQuietHours(dateAtHour(6), { quietHoursStart: 22, quietHoursEnd: 7 })).toBe(true);
	});

	test("wrap-midnight range: hour outside quiet hours", () => {
		expect(isInQuietHours(dateAtHour(7), { quietHoursStart: 22, quietHoursEnd: 7 })).toBe(false);
		expect(isInQuietHours(dateAtHour(12), { quietHoursStart: 22, quietHoursEnd: 7 })).toBe(false);
		expect(isInQuietHours(dateAtHour(21), { quietHoursStart: 22, quietHoursEnd: 7 })).toBe(false);
	});

	test("boundary: start hour is included, end hour is excluded", () => {
		expect(isInQuietHours(dateAtHour(22), { quietHoursStart: 22, quietHoursEnd: 6 })).toBe(true);
		expect(isInQuietHours(dateAtHour(6), { quietHoursStart: 22, quietHoursEnd: 6 })).toBe(false);
	});

	test("full-day range (0 to 23)", () => {
		expect(isInQuietHours(dateAtHour(0), { quietHoursStart: 0, quietHoursEnd: 23 })).toBe(true);
		expect(isInQuietHours(dateAtHour(12), { quietHoursStart: 0, quietHoursEnd: 23 })).toBe(true);
		expect(isInQuietHours(dateAtHour(22), { quietHoursStart: 0, quietHoursEnd: 23 })).toBe(true);
		expect(isInQuietHours(dateAtHour(23), { quietHoursStart: 0, quietHoursEnd: 23 })).toBe(false);
	});
});
