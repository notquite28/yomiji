import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Alert,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
	getVoiceActorOptions,
	type VoiceActorOption,
} from "../domain/audio/vocabularyAudio";
import { openAppDatabase, resetLocalData } from "../domain/db/database";
import {
	clearReviewNotifications,
	getNotificationPermissionStatus,
	requestNotificationPermissions,
	rescheduleReviewNotifications,
} from "../domain/notifications";
import {
	type AppSettings,
	defaultSettings,
	loadSettings,
	saveSettings,
	type ReviewOrder,
	type SubjectType,
	type NotificationScheduleWindow,
} from "../domain/settings/settings";
import { deleteApiToken } from "../domain/storage/secureToken";
import type { RootStackParamList } from "../navigation/types";
import {
	type AppTheme,
	type AppearanceMode,
	useAppTheme,
} from "../theme/AppThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Settings"> & {
	onLoggedOut: () => void;
};

const REVIEW_ORDER_LABELS: Record<ReviewOrder, string> = {
	random: "Random",
	ascendingSrsStage: "Ascending SRS",
	descendingSrsStage: "Descending SRS",
	alternatingSrsStage: "Alternating SRS",
	currentLevelFirst: "Current Level First",
	lowestLevelFirst: "Lowest Level First",
	newestAvailableFirst: "Newest Available",
	oldestAvailableFirst: "Oldest Available",
	longestRelativeWait: "Longest Wait",
};

const APPEARANCE_OPTIONS: { value: AppearanceMode; label: string }[] = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

const LESSON_ORDER_LABELS: Record<SubjectType, string> = {
  radical: "Radicals",
  kanji: "Kanji",
  vocabulary: "Vocabulary",
};

const SCHEDULE_WINDOW_OPTIONS: { value: NotificationScheduleWindow; label: string }[] = [
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
  { value: 72, label: "72h" },
];

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function SettingsScreen({ navigation, onLoggedOut }: Props) {
	const theme = useAppTheme();
	const styles = makeStyles(theme);
	const [settings, setSettings] = useState<AppSettings>(defaultSettings);
	const [voiceActors, setVoiceActors] = useState<VoiceActorOption[]>([]);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;
		(async () => {
			const [loadedSettings, db] = await Promise.all([
				loadSettings(),
				openAppDatabase(),
			]);
			const loadedVoiceActors = await getVoiceActorOptions(db);
			if (!isMounted) {
				return;
			}
			setSettings(loadedSettings);
			setVoiceActors(loadedVoiceActors);
		})().catch(() => {});
		return () => {
			isMounted = false;
		};
	}, []);

	// When returning to this screen, check if notification permission was revoked
	// while toggles are still ON. Show a one-time Alert if so.
	const hasWarnedRevoked = useRef(false);
	useEffect(() => {
		const unsubscribe = navigation.addListener("focus", async () => {
			if (hasWarnedRevoked.current) return;

			// Read settings directly from storage to avoid stale default state.
			const currentSettings = await loadSettings();
			const hasNotificationEnabled =
				currentSettings.notificationsAllReviews ||
				currentSettings.notificationsBadging ||
				currentSettings.notificationSounds;
			if (!hasNotificationEnabled) return;

			const status = await getNotificationPermissionStatus();
			if (status === "denied") {
				hasWarnedRevoked.current = true;
				Alert.alert(
					"Notifications Disabled",
					"Notification permission was revoked in system settings. Notifications won't be delivered until you re-enable them.",
					[
						{ text: "Dismiss", style: "cancel" },
						{
							text: "Open Settings",
							onPress: () => Linking.openSettings(),
						},
					],
				);
			}
		});
		return unsubscribe;
	}, [navigation]);

	const updateSetting = useCallback(
		<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
			setSettings((prev) => ({ ...prev, [key]: value }));
			saveSettings({ [key]: value }).catch(() => {});
		},
		[],
	);

	const updateNotificationSetting = useCallback(
		async <
			K extends
				| "notificationsAllReviews"
				| "notificationsBadging"
				| "notificationSounds"
				| "notificationQuietHoursEnabled"
				| "notificationQuietHoursStart"
				| "notificationQuietHoursEnd"
				| "notificationScheduleWindow"
				| "notificationMinReviewCount",
		>(
			key: K,
			value: AppSettings[K],
		) => {
			if (
				value === true &&
				(key === "notificationsAllReviews" ||
					key === "notificationsBadging" ||
					key === "notificationSounds")
			) {
				const granted = await requestNotificationPermissions();
				if (!granted) {
					Alert.alert(
						"Notifications Disabled",
						"Open system settings to allow notifications for 読路.",
						[
							{ text: "Cancel", style: "cancel" },
							{
								text: "Open Settings",
								onPress: () => Linking.openSettings(),
							},
						],
					);
					return;
				}
			}

			setSettings((prev) => ({ ...prev, [key]: value }));
			await saveSettings({ [key]: value });
			await rescheduleReviewNotifications();
		},
		[],
	);

	const logout = async () => {
		setError(null);
		setIsLoggingOut(true);
		try {
			const db = await openAppDatabase();
			await deleteApiToken();
			try {
				await resetLocalData(db);
			} catch (caught) {
				const message =
					caught instanceof Error ? caught.message : String(caught);
				setError(`Token removed, but cache clear failed: ${message}`);
			}
			await clearReviewNotifications();
			onLoggedOut();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
		} finally {
			setIsLoggingOut(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.content}>
				<Pressable
					onPress={() => navigation.goBack()}
					style={styles.backButton}
				>
					<Text style={styles.backText}>Back</Text>
				</Pressable>
				<View style={styles.headerBlock}>
					<Text style={styles.kicker}>読路</Text>
					<Text style={styles.title}>Settings</Text>
					<Text style={styles.subtitle}>
						Account, appearance, and study preferences.
					</Text>
				</View>

				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Appearance</Text>
					<Text style={styles.sectionLabel}>Theme</Text>
					<View style={styles.segmentGroup}>
						{APPEARANCE_OPTIONS.map((opt) => (
							<Pressable
								key={opt.value}
								onPress={() => theme.setMode(opt.value)}
								style={[
									styles.segmentButton,
									theme.mode === opt.value && styles.segmentActive,
								]}
							>
								<Text
									style={[
										styles.segmentText,
										theme.mode === opt.value && styles.segmentTextActive,
									]}
								>
									{opt.label}
								</Text>
							</Pressable>
						))}
					</View>
				</View>

				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Reviews</Text>

					<Text style={styles.sectionLabel}>Review Order</Text>
					<View style={styles.pillGroup}>
						{(
							Object.entries(REVIEW_ORDER_LABELS) as [ReviewOrder, string][]
						).map(([value, label]) => (
							<Pressable
								key={value}
								onPress={() => updateSetting("reviewOrder", value)}
								style={[
									styles.pill,
									settings.reviewOrder === value && styles.pillActive,
								]}
							>
								<Text
									style={[
										styles.pillText,
										settings.reviewOrder === value && styles.pillTextActive,
									]}
								>
									{label}
								</Text>
							</Pressable>
						))}
					</View>

					<SettingToggle
						label="Anki Mode"
						detail="Reveal the answer first, then self-grade. One card per item."
						value={settings.ankiMode}
						onValueChange={(v) => updateSetting("ankiMode", v)}
						theme={theme}
					/>

					<SettingToggle
						label="Exact Match"
						detail="Disable fuzzy matching for meaning answers."
						value={settings.exactMatch}
						onValueChange={(v) => updateSetting("exactMatch", v)}
						theme={theme}
					/>

					{!settings.ankiMode ? (
						<>
							<SettingToggle
								label="Group Meaning & Reading"
								detail="Ask meaning and reading back-to-back for each item."
								value={settings.groupMeaningReading}
								onValueChange={(v) => updateSetting("groupMeaningReading", v)}
								theme={theme}
							/>

							{settings.groupMeaningReading ? (
								<SettingToggle
									label="Meaning First"
									detail="Ask meaning before reading when grouped."
									value={settings.meaningFirst}
									onValueChange={(v) => updateSetting("meaningFirst", v)}
									theme={theme}
								/>
							) : null}
						</>
					) : null}

					<SettingToggle
						label="Minimize Review Penalty"
						detail="Cap wrong counts to 1 per task type."
						value={settings.minimizeReviewPenalty}
						onValueChange={(v) => updateSetting("minimizeReviewPenalty", v)}
						theme={theme}
					/>

					<SettingToggle
						label="Enable Cheats"
						detail="Allow override correct, try again later, and add synonym."
						value={settings.enableCheats}
						onValueChange={(v) => updateSetting("enableCheats", v)}
						theme={theme}
					/>

					<SettingStepper
						label="Batch Size"
						detail="Items in the active review queue."
						value={settings.reviewBatchSize}
						min={1}
						max={15}
						onChange={(v) => updateSetting("reviewBatchSize", v)}
						theme={theme}
					/>

					<SettingToggle
						label="Limit Review Count"
						detail={`Cap reviews at ${settings.reviewItemsLimit} items.`}
						value={settings.reviewItemsLimitEnabled}
						onValueChange={(v) => updateSetting("reviewItemsLimitEnabled", v)}
						theme={theme}
					/>

					{settings.reviewItemsLimitEnabled ? (
						<SettingStepper
							label="Review Limit"
							detail="Maximum reviews per session."
							value={settings.reviewItemsLimit}
							min={5}
							max={500}
							step={5}
							onChange={(v) => updateSetting("reviewItemsLimit", v)}
							theme={theme}
						/>
					) : null}

					<SettingStepper
						label="Leech Threshold"
						detail="Incorrect/correct ratio threshold for leech detection."
						value={settings.leechThreshold}
						min={1}
						max={10}
						onChange={(v) => updateSetting("leechThreshold", v)}
						theme={theme}
					/>
				</View>

				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Audio</Text>
					<Text style={styles.bodyText}>
						Stream vocabulary pronunciation audio during reviews. Offline
						downloads are not enabled yet.
					</Text>

					<Text style={styles.sectionLabel}>Voice Actor</Text>
					<View style={styles.pillGroup}>
						<Pressable
							onPress={() => updateSetting("preferredVoiceActorId", null)}
							style={[
								styles.pill,
								settings.preferredVoiceActorId === null && styles.pillActive,
							]}
						>
							<Text
								style={[
									styles.pillText,
									settings.preferredVoiceActorId === null &&
										styles.pillTextActive,
								]}
							>
								Auto
							</Text>
						</Pressable>
						{voiceActors.map((voiceActor) => {
							const active = settings.preferredVoiceActorId === voiceActor.id;
							const subtitle = [voiceActor.description, voiceActor.gender]
								.filter(Boolean)
								.join(" - ");
							return (
								<Pressable
									key={voiceActor.id}
									onPress={() =>
										updateSetting("preferredVoiceActorId", voiceActor.id)
									}
									style={[styles.pill, active && styles.pillActive]}
									accessibilityLabel={
										subtitle
											? `${voiceActor.name}, ${subtitle}`
											: voiceActor.name
									}
								>
									<Text
										style={[styles.pillText, active && styles.pillTextActive]}
									>
										{voiceActor.name}
									</Text>
								</Pressable>
							);
						})}
					</View>
					{voiceActors.length === 0 ? (
						<Text style={styles.bodyText}>
							Voice actors will appear after sync downloads them.
						</Text>
					) : null}

					<SettingToggle
						label="Play Audio Automatically"
						detail="Play vocabulary audio after correct reading answers."
						value={settings.playAudioAutomatically}
						onValueChange={(v) => updateSetting("playAudioAutomatically", v)}
						theme={theme}
					/>

					<SettingToggle
						label="Interrupt Background Audio"
						detail="Duck other audio while pronunciation audio plays."
						value={settings.interruptBackgroundAudio}
						onValueChange={(v) => updateSetting("interruptBackgroundAudio", v)}
						theme={theme}
					/>
				</View>

				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Notifications</Text>

					<SettingToggle
						label="Notify for All Reviews"
						detail="Get notified each hour when new reviews become available."
						value={settings.notificationsAllReviews}
						onValueChange={(v) =>
							updateNotificationSetting("notificationsAllReviews", v)
						}
						theme={theme}
					/>

					<SettingToggle
						label="Badge Icon"
						detail="Show review count on the app icon."
						value={settings.notificationsBadging}
						onValueChange={(v) =>
							updateNotificationSetting("notificationsBadging", v)
						}
						theme={theme}
					/>

					<SettingToggle
						label="Notification Sounds"
						detail="Play a sound when review notifications arrive."
						value={settings.notificationSounds}
						onValueChange={(v) =>
							updateNotificationSetting("notificationSounds", v)
						}
						theme={theme}
					/>

					<Text style={styles.sectionLabel}>Schedule</Text>

					<Text style={styles.bodyText}>
						How far ahead to schedule review notifications.
					</Text>
					<View style={styles.pillGroup}>
						{SCHEDULE_WINDOW_OPTIONS.map((opt) => (
							<Pressable
								key={opt.value}
								onPress={() =>
									updateNotificationSetting("notificationScheduleWindow", opt.value)
								}
								style={[
									styles.pill,
									settings.notificationScheduleWindow === opt.value &&
										styles.pillActive,
								]}
							>
								<Text
									style={[
										styles.pillText,
										settings.notificationScheduleWindow === opt.value &&
											styles.pillTextActive,
									]}
								>
									{opt.label}
								</Text>
							</Pressable>
						))}
					</View>

					<SettingStepper
						label="Minimum Review Count"
						detail="Only notify when this many reviews are available."
						value={settings.notificationMinReviewCount}
						min={1}
						max={50}
						onChange={(v) =>
							updateNotificationSetting("notificationMinReviewCount", v)
						}
						theme={theme}
					/>

					<Text style={styles.sectionLabel}>Quiet Hours</Text>

					<SettingToggle
						label="Enable Quiet Hours"
						detail={`Suppress notifications from ${formatHour(settings.notificationQuietHoursStart)} to ${formatHour(settings.notificationQuietHoursEnd)}.`}
						value={settings.notificationQuietHoursEnabled}
						onValueChange={(v) =>
							updateNotificationSetting("notificationQuietHoursEnabled", v)
						}
						theme={theme}
					/>

					{settings.notificationQuietHoursEnabled ? (
						<>
							<SettingStepper
								label="Start"
								detail={`Quiet hours begin at ${formatHour(settings.notificationQuietHoursStart)}.`}
								value={settings.notificationQuietHoursStart}
								min={0}
								max={23}
								onChange={(v) =>
									updateNotificationSetting("notificationQuietHoursStart", v)
								}
								theme={theme}
							/>

							<SettingStepper
								label="End"
								detail={`Quiet hours end at ${formatHour(settings.notificationQuietHoursEnd)}.`}
								value={settings.notificationQuietHoursEnd}
								min={0}
								max={23}
								onChange={(v) =>
									updateNotificationSetting("notificationQuietHoursEnd", v)
								}
								theme={theme}
							/>
						</>
					) : null}
				</View>

				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Lessons</Text>

					<SettingStepper
						label="New Items Per Quiz"
						detail="New lessons introduced before each lesson quiz."
						value={settings.lessonBatchSize}
						min={1}
						max={10}
						onChange={(v) => updateSetting("lessonBatchSize", v)}
						theme={theme}
					/>

					<SettingStepper
						label="Max Lessons Per Session"
						detail="Maximum lessons pulled from the dashboard Lessons card."
						value={settings.lessonSessionSize}
						min={1}
						max={50}
						onChange={(v) => updateSetting("lessonSessionSize", v)}
						theme={theme}
					/>

					<SettingToggle
						label="Prioritize Current Level"
						detail="Show current-level items first in lessons."
						value={settings.prioritizeCurrentLevel}
						onValueChange={(v) => updateSetting("prioritizeCurrentLevel", v)}
						theme={theme}
					/>

					<SettingToggle
						label="Interleave Lessons"
						detail="Randomize item order across types within each level."
						value={settings.interleaveLessons}
						onValueChange={(v) => updateSetting("interleaveLessons", v)}
						theme={theme}
					/>

					<SettingToggle
						label="Show Kana-Only Vocabulary"
						detail="Include kana-only vocabulary in lessons."
						value={settings.showKanaOnlyVocab}
						onValueChange={(v) => updateSetting("showKanaOnlyVocab", v)}
						theme={theme}
					/>

					<Text style={styles.sectionLabel}>Subject Type Order</Text>
					<Text style={styles.bodyText}>
						Drag to reorder priority during lessons.
					</Text>
					<LessonOrderEditor
						order={settings.lessonOrder}
						onChange={(order) => updateSetting("lessonOrder", order)}
						theme={theme}
					/>
				</View>

				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Subject Details</Text>

					<SettingToggle
						label="Katakana for Onyomi"
						detail="Display onyomi (Chinese-origin) kanji readings in katakana."
						value={settings.useKatakanaForOnyomi}
						onValueChange={(v) => updateSetting("useKatakanaForOnyomi", v)}
						theme={theme}
					/>

					<SettingToggle
						label="Show All Readings"
						detail="Show all accepted readings, not just primary."
						value={settings.showAllReadings}
						onValueChange={(v) => updateSetting("showAllReadings", v)}
						theme={theme}
					/>
				</View>

				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Diagnostics</Text>
					<Text style={styles.bodyText}>
						View cache stats, sync state, and error log.
					</Text>
					<Pressable
						onPress={() => navigation.navigate("Diagnostics")}
						style={({ pressed }) => [
							styles.diagnosticsButton,
							pressed && styles.pressed,
						]}
					>
						<Text style={styles.diagnosticsButtonText}>Open Diagnostics</Text>
					</Pressable>
				</View>

				<View style={styles.dangerPanel}>
					<Text style={styles.panelTitle}>Log Out</Text>
					<Text style={styles.bodyText}>
						Clears token, cache, and pending queues.
					</Text>
					{error ? <Text style={styles.errorText}>{error}</Text> : null}
					<Pressable
						disabled={isLoggingOut}
						onPress={logout}
						style={({ pressed }) => [
							styles.logoutButton,
							(pressed || isLoggingOut) && styles.pressed,
						]}
					>
						<Text style={styles.logoutText}>
							{isLoggingOut ? "Logging out..." : "Log Out and Clear Cache"}
						</Text>
					</Pressable>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

function SettingToggle({
	label,
	detail,
	value,
	onValueChange,
	theme,
}: {
	label: string;
	detail?: string;
	value: boolean;
	onValueChange: (value: boolean) => void;
	theme: AppTheme;
}) {
	const styles = makeStyles(theme);
	return (
		<View style={styles.row}>
			<View style={styles.rowText}>
				<Text style={styles.rowLabel}>{label}</Text>
				{detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
			</View>
			<Switch
				value={value}
				onValueChange={onValueChange}
				trackColor={{ false: theme.colors.border, true: theme.colors.kanji }}
				thumbColor="#ffffff"
			/>
		</View>
	);
}

function SettingStepper({
	label,
	detail,
	value,
	min,
	max,
	step = 1,
	onChange,
	theme,
}: {
	label: string;
	detail?: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
	theme: AppTheme;
}) {
	const styles = makeStyles(theme);
	return (
		<View style={styles.row}>
			<View style={styles.rowText}>
				<Text style={styles.rowLabel}>{label}</Text>
				{detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
			</View>
			<View style={styles.stepperGroup}>
				<Pressable
					disabled={value <= min}
					onPress={() => onChange(Math.max(min, value - step))}
					style={[styles.stepperButton, value <= min && styles.stepperDisabled]}
					accessibilityLabel={`Decrease ${label}`}
					accessibilityHint={`Current value: ${value}`}
					accessibilityRole="button"
				>
					<Text style={styles.stepperButtonText}>-</Text>
				</Pressable>
				<Text
					style={styles.stepperValue}
					accessibilityLabel={`${label}: ${value}`}
				>
					{value}
				</Text>
				<Pressable
					disabled={value >= max}
					onPress={() => onChange(Math.min(max, value + step))}
					style={[styles.stepperButton, value >= max && styles.stepperDisabled]}
					accessibilityLabel={`Increase ${label}`}
					accessibilityHint={`Current value: ${value}`}
					accessibilityRole="button"
				>
					<Text style={styles.stepperButtonText}>+</Text>
				</Pressable>
			</View>
		</View>
	);
}

function LessonOrderEditor({
	order,
	onChange,
	theme,
}: {
	order: SubjectType[];
	onChange: (order: SubjectType[]) => void;
	theme: AppTheme;
}) {
	const styles = makeStyles(theme);

	function move(fromIndex: number, toIndex: number) {
		const next = [...order];
		const removed = next.splice(fromIndex, 1);
		next.splice(toIndex, 0, removed[0]!);
		onChange(next);
	}

	return (
		<View style={styles.lessonOrderList}>
			{order.map((type, idx) => (
				<View key={type} style={styles.lessonOrderRow}>
					<Text style={styles.lessonOrderLabel}>
						{LESSON_ORDER_LABELS[type]}
					</Text>
					<View style={styles.lessonOrderButtons}>
						<Pressable
							disabled={idx === 0}
							onPress={() => move(idx, idx - 1)}
							style={[
								styles.stepperButton,
								idx === 0 && styles.stepperDisabled,
							]}
							accessibilityLabel={`Move ${LESSON_ORDER_LABELS[type]} up`}
							accessibilityRole="button"
						>
							<Text style={styles.stepperButtonText}>↑</Text>
						</Pressable>
						<Pressable
							disabled={idx === order.length - 1}
							onPress={() => move(idx, idx + 1)}
							style={[
								styles.stepperButton,
								idx === order.length - 1 && styles.stepperDisabled,
							]}
							accessibilityLabel={`Move ${LESSON_ORDER_LABELS[type]} down`}
							accessibilityRole="button"
						>
							<Text style={styles.stepperButtonText}>↓</Text>
						</Pressable>
					</View>
				</View>
			))}
		</View>
	);
}

function makeStyles(theme: AppTheme) {
	return StyleSheet.create({
		safeArea: {
			flex: 1,
			backgroundColor: theme.isDark ? "#0c0b0f" : "#f7f4ef",
		},
		content: {
			paddingHorizontal: 20,
			paddingTop: 16,
			paddingBottom: 28,
			gap: 14,
		},
		backButton: {
			alignSelf: "flex-start",
			borderRadius: 999,
			paddingHorizontal: 13,
			paddingVertical: 9,
			backgroundColor: theme.isDark ? "#201e26" : "#f2eee8",
			borderWidth: 1,
			borderColor: theme.isDark
				? "rgba(255, 255, 255, 0.08)"
				: "rgba(32, 26, 36, 0.06)",
		},
		backText: {
			color: theme.colors.text,
			fontWeight: "900",
		},
		headerBlock: {
			paddingHorizontal: 2,
			paddingTop: 14,
			paddingBottom: 6,
		},
		kicker: {
			color: theme.colors.mutedText,
			fontSize: 12,
			fontWeight: "800",
			letterSpacing: 1.2,
			textTransform: "uppercase",
		},
		title: {
			marginTop: 6,
			color: theme.colors.text,
			fontSize: 40,
			lineHeight: 46,
			fontWeight: "900",
			letterSpacing: -1.4,
		},
		subtitle: {
			marginTop: 10,
			color: theme.colors.mutedText,
			fontSize: 16,
			lineHeight: 22,
			fontWeight: "700",
		},
		panel: {
			borderRadius: 26,
			padding: 18,
			backgroundColor: theme.isDark ? "#15141a" : "#fffdf8",
			borderWidth: 1,
			borderColor: theme.isDark
				? "rgba(255, 255, 255, 0.08)"
				: "rgba(32, 26, 36, 0.08)",
			gap: 10,
			shadowColor: "#000000",
			shadowOpacity: theme.isDark ? 0.16 : 0.05,
			shadowRadius: 18,
			shadowOffset: { width: 0, height: 10 },
			elevation: 4,
		},
		dangerPanel: {
			borderRadius: 26,
			padding: 18,
			backgroundColor: theme.isDark ? "#15141a" : "#fffdf8",
			borderWidth: 1,
			borderColor: theme.colors.danger,
			gap: 12,
			shadowColor: "#000000",
			shadowOpacity: theme.isDark ? 0.16 : 0.05,
			shadowRadius: 18,
			shadowOffset: { width: 0, height: 10 },
			elevation: 4,
		},
		panelTitle: {
			color: theme.colors.text,
			fontSize: 21,
			fontWeight: "900",
			letterSpacing: -0.3,
		},
		sectionLabel: {
			color: theme.colors.mutedText,
			fontSize: 12,
			fontWeight: "900",
			letterSpacing: 0.8,
			textTransform: "uppercase",
			marginTop: 6,
		},
		bodyText: {
			color: theme.colors.mutedText,
			fontSize: 15,
			lineHeight: 21,
			fontWeight: "700",
		},
		errorText: {
			color: theme.colors.danger,
			fontWeight: "800",
		},
		segmentGroup: {
			flexDirection: "row",
			gap: 8,
		},
		segmentButton: {
			flex: 1,
			minHeight: 44,
			alignItems: "center",
			justifyContent: "center",
			borderRadius: 14,
			backgroundColor: theme.colors.surface,
			borderWidth: 1,
			borderColor: theme.colors.border,
		},
		segmentActive: {
			backgroundColor: theme.colors.kanji,
			borderColor: theme.colors.kanji,
		},
		segmentText: {
			color: theme.colors.text,
			fontSize: 14,
			fontWeight: "800",
		},
		segmentTextActive: {
			color: "#ffffff",
		},
		pillGroup: {
			flexDirection: "row",
			flexWrap: "wrap",
			gap: 8,
		},
		pill: {
			borderRadius: 999,
			paddingHorizontal: 14,
			paddingVertical: 8,
			backgroundColor: theme.colors.surface,
			borderWidth: 1,
			borderColor: theme.colors.border,
		},
		pillActive: {
			backgroundColor: theme.colors.kanji,
			borderColor: theme.colors.kanji,
		},
		pillText: {
			color: theme.colors.text,
			fontSize: 13,
			fontWeight: "800",
		},
		pillTextActive: {
			color: "#ffffff",
		},
		row: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 12,
			paddingTop: 10,
			borderTopWidth: 1,
			borderTopColor: theme.colors.border,
		},
		rowText: {
			flex: 1,
			gap: 2,
		},
		rowLabel: {
			color: theme.colors.text,
			fontSize: 15,
			fontWeight: "800",
		},
		rowDetail: {
			color: theme.colors.mutedText,
			fontSize: 13,
			lineHeight: 18,
			fontWeight: "700",
		},
		stepperGroup: {
			flexDirection: "row",
			alignItems: "center",
			gap: 8,
		},
		stepperButton: {
			width: 36,
			height: 36,
			alignItems: "center",
			justifyContent: "center",
			borderRadius: 12,
			backgroundColor: theme.colors.surfaceElevated,
			borderWidth: 1,
			borderColor: theme.colors.border,
		},
		stepperDisabled: {
			opacity: 0.4,
		},
		stepperButtonText: {
			color: theme.colors.text,
			fontSize: 18,
			fontWeight: "900",
		},
		stepperValue: {
			color: theme.colors.text,
			fontSize: 16,
			fontWeight: "900",
			minWidth: 32,
			textAlign: "center",
		},
		logoutButton: {
			minHeight: 54,
			alignItems: "center",
			justifyContent: "center",
			borderRadius: 20,
			backgroundColor: theme.colors.danger,
			shadowColor: "#000000",
			shadowOpacity: theme.isDark ? 0.2 : 0.12,
			shadowRadius: 12,
			shadowOffset: { width: 0, height: 6 },
			elevation: 4,
		},
		diagnosticsButton: {
			minHeight: 44,
			alignItems: "center",
			justifyContent: "center",
			borderRadius: 14,
			backgroundColor: theme.colors.surface,
			borderWidth: 1,
			borderColor: theme.colors.border,
		},
		diagnosticsButtonText: {
			color: theme.colors.text,
			fontSize: 14,
			fontWeight: "900",
		},
		logoutText: {
			color: "#ffffff",
			fontSize: 16,
			fontWeight: "900",
		},
		pressed: {
			opacity: 0.72,
			transform: [{ scale: 0.99 }],
		},
		lessonOrderList: {
			gap: 6,
		},
		lessonOrderRow: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			borderRadius: 12,
			paddingHorizontal: 12,
			paddingVertical: 10,
			backgroundColor: theme.colors.surfaceElevated,
			borderWidth: 1,
			borderColor: theme.colors.border,
		},
		lessonOrderLabel: {
			color: theme.colors.text,
			fontSize: 15,
			fontWeight: "800",
		},
		lessonOrderButtons: {
			flexDirection: "row",
			gap: 6,
		},
	});
}
