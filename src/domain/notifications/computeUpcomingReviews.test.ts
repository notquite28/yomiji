import { computeUpcomingReviewSchedule } from "./computeUpcomingReviews";

// Minimal mock for expo-sqlite's SQLiteDatabase interface.
// Only stubs the methods used by computeUpcomingReviewSchedule.
function mockDb(overrides: {
	user?: { vacation_started_at: string | null } | undefined;
	availableCount?: number;
	buckets?: { bucket: string; value: number }[];
}) {
	return {
		getFirstAsync: jest.fn().mockImplementation((sql: string) => {
			if (sql.includes("vacation_started_at")) {
				return Promise.resolve(overrides.user ?? { vacation_started_at: null });
			}
			if (sql.includes("COUNT(*)")) {
				return Promise.resolve({ value: overrides.availableCount ?? 0 });
			}
			return Promise.resolve(undefined);
		}),
		getAllAsync: jest.fn().mockResolvedValue(overrides.buckets ?? []),
	} as unknown as Parameters<typeof computeUpcomingReviewSchedule>[0];
}

describe("computeUpcomingReviewSchedule", () => {
	test("returns available count of 0 when no assignments exist", async () => {
		const db = mockDb({});
		const result = await computeUpcomingReviewSchedule(db, 48, new Date("2026-05-14T10:30:00"));
		expect(result.availableReviewCount).toBe(0);
		expect(result.upcomingHours).toEqual([]);
		expect(result.isVacation).toBe(false);
	});

	test("returns vacation mode when vacation_started_at is set", async () => {
		const db = mockDb({
			user: { vacation_started_at: "2026-05-13T00:00:00" },
			availableCount: 5,
		});
		const result = await computeUpcomingReviewSchedule(db, 48, new Date("2026-05-14T10:30:00"));
		expect(result.availableReviewCount).toBe(5);
		expect(result.upcomingHours).toEqual([]);
		expect(result.isVacation).toBe(true);
	});

	test("returns correct available review count", async () => {
		const db = mockDb({ availableCount: 42 });
		const result = await computeUpcomingReviewSchedule(db, 48, new Date("2026-05-14T10:30:00"));
		expect(result.availableReviewCount).toBe(42);
	});

	test("maps hourly buckets to upcomingHours array", async () => {
		const db = mockDb({
			availableCount: 3,
			buckets: [
				{ bucket: "2026-05-14T11:00:00", value: 5 },
				{ bucket: "2026-05-14T12:00:00", value: 2 },
				{ bucket: "2026-05-14T15:00:00", value: 1 },
			],
		});

		const now = new Date("2026-05-14T10:30:00");
		const result = await computeUpcomingReviewSchedule(db, 48, now);

		// Buckets should start from the next whole hour (11:00).
		expect(result.upcomingHours).toEqual([
			{ hour: "2026-05-14T11:00:00", newReviews: 5 },
			{ hour: "2026-05-14T12:00:00", newReviews: 2 },
			{ hour: "2026-05-14T15:00:00", newReviews: 1 },
		]);
	});

	test("excludes buckets with 0 reviews", async () => {
		const db = mockDb({
			availableCount: 0,
			buckets: [
				{ bucket: "2026-05-14T11:00:00", value: 3 },
			],
		});

		// Request 3 hours of data. Hours 2 and 3 have no bucket entry → 0 reviews.
		const now = new Date("2026-05-14T10:30:00");
		const result = await computeUpcomingReviewSchedule(db, 3, now);

		expect(result.upcomingHours).toEqual([
			{ hour: "2026-05-14T11:00:00", newReviews: 3 },
		]);
	});

	test("limits results to the requested hours window", async () => {
		const db = mockDb({
			availableCount: 0,
			buckets: [
				{ bucket: "2026-05-14T11:00:00", value: 1 },
				{ bucket: "2026-05-14T12:00:00", value: 2 },
				{ bucket: "2026-05-14T13:00:00", value: 3 },
			],
		});

		// Only 2 hours of window — should only include 11:00 and 12:00.
		const now = new Date("2026-05-14T10:30:00");
		const result = await computeUpcomingReviewSchedule(db, 2, now);

		expect(result.upcomingHours).toEqual([
			{ hour: "2026-05-14T11:00:00", newReviews: 1 },
			{ hour: "2026-05-14T12:00:00", newReviews: 2 },
		]);
	});

	test("uses parameterized queries (not string interpolation)", async () => {
		const db = mockDb({ availableCount: 0 });
		await computeUpcomingReviewSchedule(db, 48, new Date("2026-05-14T10:30:00"));

		// Verify that SQL queries use ? placeholders, not interpolated values.
		const getAllCalls = (db as unknown as { getAllAsync: jest.Mock }).getAllAsync.mock.calls;
		for (const call of getAllCalls) {
			const sql = call[0] as string;
			expect(sql).not.toMatch(/2026/);
			expect(sql).toContain("?");
		}
	});
});
