/**
 * Integration tests for rescheduleReviewNotifications.
 *
 * Mocks: expoNotifications, Platform.
 * Uses real in-memory SQLite via createTestDatabase and real Zustand settings store.
 */
import { createTestDatabase } from "../../test/testDb";
import type { AppDatabase } from "../db/database";
import { useSettingsStore } from "../settings/settingsStore";
import { defaultSettings } from "../settings/settings";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Track all expo-notifications calls for assertions.
const scheduled: Array<{
	identifier: string;
	content: Record<string, unknown>;
	trigger: Record<string, unknown>;
}> = [];
let badgeCount = 0;
const cancelledIds: string[] = [];
let permissionStatus: "granted" | "denied" | "undetermined" = "granted";

// expo-constants is imported by expoNotifications.ts; mock it before anything
// loads the real module.
jest.mock("expo-constants", () => ({
	default: { executionEnvironment: "developmentClient" },
	__esModule: true,
}));

// Mock expo-notifications so the lazy wrapper doesn't try to require it.
jest.mock("expo-notifications", () => ({
	SchedulableTriggerInputTypes: {
		DATE: "date",
		DAILY: "daily",
	},
	AndroidImportance: { HIGH: 4 },
	IosAuthorizationStatus: {
		PROVISIONAL: "provisional",
		EPHEMERAL: "ephemeral",
		NOT_DETERMINED: "notDetermined",
	},
	setNotificationHandler: jest.fn(),
	getPermissionsAsync: jest.fn(() =>
		Promise.resolve({
			granted: permissionStatus === "granted",
			canAskAgain: true,
			expires: "never",
			ios: {
				status: permissionStatus === "granted" ? "authorized" : "denied",
				allowsAlert: true,
				allowsBadge: true,
				allowsSound: true,
			},
		}),
	),
	requestPermissionsAsync: jest.fn(() =>
		Promise.resolve({ granted: true, canAskAgain: false, expires: "never" }),
	),
	scheduleNotificationAsync: jest.fn((req) => {
		scheduled.push({
			identifier: req.identifier ?? "auto",
			content: req.content ?? {},
			trigger: req.trigger as Record<string, unknown>,
		});
		return Promise.resolve(req.identifier ?? "auto");
	}),
	cancelScheduledNotificationAsync: jest.fn((id) => {
		cancelledIds.push(id);
		return Promise.resolve();
	}),
	cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
	getAllScheduledNotificationsAsync: jest.fn(() => {
		// Return legacy notifications for legacy-cancellation tests.
		return Promise.resolve([
			{ identifier: "review-hour-8", content: {}, trigger: {} },
			{ identifier: "review-hour-14", content: {}, trigger: {} },
			{ identifier: "some-other", content: {}, trigger: {} },
		]);
	}),
	setBadgeCountAsync: jest.fn((c) => {
		badgeCount = c;
		return Promise.resolve(true);
	}),
	getBadgeCountAsync: jest.fn(() => Promise.resolve(badgeCount)),
	setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
}));

// Mock @react-native-async-storage/async-storage for the settings store.
jest.mock("@react-native-async-storage/async-storage", () => ({
	getItem: jest.fn(() => Promise.resolve(null)),
	setItem: jest.fn(() => Promise.resolve()),
	removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock Platform.OS for all tests (default to ios for capability checks).
jest.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

// Mock openAppDatabase so notificationService uses our test DB.
// Keep all other real exports (applyMigrations, etc.) intact.
let testDb: AppDatabase;
jest.mock("../db/database", () => {
	const actual = jest.requireActual("../db/database");
	return {
		...actual,
		openAppDatabase: jest.fn(() => Promise.resolve(testDb)),
	};
});

// Import AFTER mocks are set up.
import { rescheduleReviewNotifications, clearReviewNotifications } from "./notificationService";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Set notification-related settings in the Zustand store directly.
 * All non-notification fields retain their default values.
 */
function setNotificationSettings(overrides: Partial<{
	notificationsEnabled: boolean;
	notificationsBadging: boolean;
	notificationSounds: boolean;
	notificationThreshold: number;
	notificationDailyTime: number | null;
}>) {
	const { hydrate, updateSetting } = useSettingsStore.getState();
	useSettingsStore.setState({
		...defaultSettings,
		notificationsEnabled: true,
		notificationsBadging: true,
		notificationSounds: false,
		notificationThreshold: 5,
		notificationDailyTime: null,
		...overrides,
		_hydrated: true,
		hydrate,
		updateSetting,
	});
}

function resetMockState() {
	scheduled.length = 0;
	cancelledIds.length = 0;
	badgeCount = 0;
	permissionStatus = "granted";
	// Preserve store methods; reset only the data fields.
	const { hydrate, updateSetting } = useSettingsStore.getState();
	useSettingsStore.setState({ ...defaultSettings, _hydrated: true, hydrate, updateSetting });
}

function futureIso(daysFromNow: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + daysFromNow);
	date.setUTCHours(0, 0, 0, 0);
	return date.toISOString();
}


async function insertAvailableAssignment(
	db: AppDatabase,
	subjectId: number,
	availableAt: string,
) {
	// Insert a minimal subject row to satisfy FK.
	await db.runAsync(
		`INSERT OR IGNORE INTO subjects (id, japanese, level, subject_type, payload, updated_at)
     VALUES (?, 'test', 1, 'vocabulary', '{}', '2026-01-01T00:00:00Z')`,
		subjectId,
	);
	await db.runAsync(
		`INSERT INTO assignments (id, subject_id, level, srs_stage, available_at, subject_type, payload)
     VALUES (?, ?, 1, 4, ?, 'vocabulary', '{}')`,
		subjectId,
		subjectId,
		availableAt,
	);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("rescheduleReviewNotifications", () => {
	let cleanup: () => Promise<void>;

	beforeEach(async () => {
		resetMockState();
		const result = await createTestDatabase();
		testDb = result.db;
		cleanup = result.cleanup;
		// Insert a user row (not on vacation).
		await insertUser({ vacation_started_at: null });
	});

	afterEach(async () => {
		await cleanup();
	});

	test("vacation mode clears badge and notifications", async () => {
		await insertUser({ vacation_started_at: "2026-01-01T00:00:00Z" });
		setNotificationSettings({
			notificationsEnabled: true,
		});

		await rescheduleReviewNotifications();

		expect(scheduled).toHaveLength(0);
		expect(badgeCount).toBe(0);
	});

	test("badge-only mode sets badge without scheduling notifications", async () => {
		setNotificationSettings({
			notificationsEnabled: false,
			notificationsBadging: true,
		});

		// Insert 3 available reviews.
		for (let i = 1; i <= 3; i++) {
			await insertAvailableAssignment(testDb, i, "2026-01-01T00:00:00Z");
		}

		await rescheduleReviewNotifications();

		expect(badgeCount).toBe(3);
		expect(scheduled).toHaveLength(0);
	});

	test("threshold not yet met — schedules review-available for the Nth future review", async () => {
		setNotificationSettings({
			notificationsEnabled: true,
			notificationsBadging: false,
			notificationThreshold: 3,
			notificationDailyTime: null,
		});

		// 0 currently available, 3rd future review is computed from wall-clock time.
		await insertAvailableAssignment(testDb, 1, futureIso(1));
		await insertAvailableAssignment(testDb, 2, futureIso(2));
		await insertAvailableAssignment(testDb, 3, futureIso(3));

		await rescheduleReviewNotifications();

		// Should have scheduled exactly 1 notification.
		const thresholdNots = scheduled.filter(
			(n) => n.identifier === "review-available",
		);
		expect(thresholdNots).toHaveLength(1);
		expect(thresholdNots[0]!.trigger.type).toBe("date"); // DATE trigger
		// Body should mention the threshold.
		expect(thresholdNots[0]!.content.body).toBe("3 reviews are waiting");
	});

	test("threshold already met — no review-available scheduled", async () => {
		setNotificationSettings({
			notificationsEnabled: true,
			notificationsBadging: false,
			notificationThreshold: 3,
			notificationDailyTime: null,
		});

		// Insert 5 already-available reviews (>= threshold of 3).
		for (let i = 1; i <= 5; i++) {
			await insertAvailableAssignment(testDb, i, "2026-01-01T00:00:00Z");
		}

		await rescheduleReviewNotifications();

		const thresholdNots = scheduled.filter(
			(n) => n.identifier === "review-available",
		);
		expect(thresholdNots).toHaveLength(0);
	});

	test("daily time configured — uses DAILY trigger type", async () => {
		setNotificationSettings({
			notificationsEnabled: true,
			notificationsBadging: false,
			notificationThreshold: 50,
			notificationDailyTime: 20,
		});

		await rescheduleReviewNotifications();

		const dailyNots = scheduled.filter(
			(n) => n.identifier === "review-daily",
		);
		expect(dailyNots).toHaveLength(1);
		expect(dailyNots[0]!.trigger.type).toBe("daily"); // DAILY trigger
		expect(dailyNots[0]!.trigger.hour).toBe(20);
		expect(dailyNots[0]!.trigger.minute).toBe(0);
	});

	test("both triggers — both scheduled independently", async () => {
		setNotificationSettings({
			notificationsEnabled: true,
			notificationsBadging: false,
			notificationThreshold: 2,
			notificationDailyTime: 8,
		});

		// 1 available now, threshold=2, so need 1 more future.
		await insertAvailableAssignment(testDb, 1, "2026-01-01T00:00:00Z");
		await insertAvailableAssignment(testDb, 2, "2026-12-01T00:00:00Z");

		await rescheduleReviewNotifications();

		const ids = scheduled.map((n) => n.identifier);
		expect(ids).toContain("review-available");
		expect(ids).toContain("review-daily");
	});

	test("legacy review-hour-* notifications are cancelled on reschedule", async () => {
		setNotificationSettings({
			notificationsEnabled: true,
			notificationsBadging: false,
			notificationThreshold: 50,
			notificationDailyTime: null,
		});

		await rescheduleReviewNotifications();

		expect(cancelledIds).toContain("review-hour-8");
		expect(cancelledIds).toContain("review-hour-14");
		expect(cancelledIds).not.toContain("some-other");
	});

	test("no notification content includes badge property", async () => {
		setNotificationSettings({
			notificationsEnabled: true,
			notificationsBadging: true,
			notificationThreshold: 2,
			notificationDailyTime: 20,
		});

		// 1 available now, threshold=2.
		await insertAvailableAssignment(testDb, 1, "2026-01-01T00:00:00Z");
		await insertAvailableAssignment(testDb, 2, "2026-12-01T00:00:00Z");

		await rescheduleReviewNotifications();

		for (const n of scheduled) {
			expect(n.content).not.toHaveProperty("badge");
		}
	});

	test("denied permission clears notifications", async () => {
		permissionStatus = "denied";
		setNotificationSettings({
			notificationsEnabled: true,
			notificationsBadging: true,
		});

		await rescheduleReviewNotifications();

		expect(scheduled).toHaveLength(0);
		expect(badgeCount).toBe(0);
	});
});

describe("clearReviewNotifications", () => {
	test("cancels review notifications and resets badge", async () => {
		const result = await createTestDatabase();
		testDb = result.db;
		await insertUser({ vacation_started_at: null });

		await clearReviewNotifications();

		expect(cancelledIds).toContain("review-available");
		expect(cancelledIds).toContain("review-daily");
		expect(badgeCount).toBe(0);

		await result.cleanup();
	});
});

async function insertUser(overrides: { vacation_started_at: string | null }) {
	await testDb.runAsync(
		`INSERT OR REPLACE INTO user (id, username, level, vacation_started_at, payload, updated_at)
     VALUES (1, 'test', 1, ?, '{}', '2026-01-01T00:00:00Z')`,
		overrides.vacation_started_at,
	);
}
