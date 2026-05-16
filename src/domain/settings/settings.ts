import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'appSettings';

export type ReviewOrder =
  | 'random'
  | 'ascendingSrsStage'
  | 'descendingSrsStage'
  | 'alternatingSrsStage'
  | 'currentLevelFirst'
  | 'lowestLevelFirst'
  | 'newestAvailableFirst'
  | 'oldestAvailableFirst'
  | 'longestRelativeWait';

export type AppearanceMode = 'system' | 'light' | 'dark';
export type SubjectType = 'radical' | 'kanji' | 'vocabulary';

export type AppSettings = {
  appearance: AppearanceMode;
  notificationsEnabled: boolean;
  notificationsBadging: boolean;
  notificationSounds: boolean;
  notificationThreshold: number;
  notificationDailyTime: number | null;
  prioritizeCurrentLevel: boolean;
  interleaveLessons: boolean;
  lessonOrder: SubjectType[];
  lessonBatchSize: number;
  lessonSessionSize: number;
  reviewOrder: ReviewOrder;
  reviewBatchSize: number;
  reviewItemsLimit: number;
  reviewItemsLimitEnabled: boolean;
  groupMeaningReading: boolean;
  meaningFirst: boolean;
  showFullAnswer: boolean;
  exactMatch: boolean;
  enableCheats: boolean;
  minimizeReviewPenalty: boolean;
  ankiMode: boolean;
  showKanaOnlyVocab: boolean;
  leechThreshold: number;
  playAudioAutomatically: boolean;
  interruptBackgroundAudio: boolean;
  preferredVoiceActorId: number | null;
  offlineAudio: boolean;
  offlineAudioCellular: boolean;
  useKatakanaForOnyomi: boolean;
  showAllReadings: boolean;
};

export const defaultSettings: AppSettings = {
  appearance: 'system',
  notificationsEnabled: true,
  notificationsBadging: true,
  notificationSounds: false,
  notificationThreshold: 50,
  notificationDailyTime: 20,
  prioritizeCurrentLevel: false,
  interleaveLessons: false,
  lessonOrder: ['radical', 'kanji', 'vocabulary'],
  lessonBatchSize: 5,
  lessonSessionSize: 15,
  reviewOrder: 'random',
  reviewBatchSize: 5,
  reviewItemsLimit: 15,
  reviewItemsLimitEnabled: false,
  groupMeaningReading: false,
  meaningFirst: true,
  showFullAnswer: false,
  exactMatch: false,
  enableCheats: true,
  minimizeReviewPenalty: true,
  ankiMode: false,
  showKanaOnlyVocab: true,
  leechThreshold: 1,
  playAudioAutomatically: false,
  interruptBackgroundAudio: false,
  preferredVoiceActorId: null,
  offlineAudio: false,
  offlineAudioCellular: false,
  useKatakanaForOnyomi: false,
  showAllReadings: false,
};

export type SettingsMigration = {
  version: number;
  migrate(stored: Record<string, unknown>): Record<string, unknown>;
};

const STALE_NOTIFICATION_KEYS = [
  'notificationsAllReviews',
  'notificationQuietHoursEnabled',
  'notificationQuietHoursStart',
  'notificationQuietHoursEnd',
  'notificationScheduleWindow',
  'notificationMinReviewCount',
];

export const settingsMigrations: SettingsMigration[] = [
  {
    version: 1,
    migrate(stored: Record<string, unknown>): Record<string, unknown> {
      const result = { ...stored };
      if ('notificationsAllReviews' in result && !('notificationsEnabled' in result)) {
        result.notificationsEnabled =
          result['notificationsAllReviews'] === true;
        const migratedThreshold = result['notificationMinReviewCount'] as number | undefined;
        result.notificationThreshold =
          migratedThreshold != null ? Math.min(migratedThreshold, 50) : 50;
        result.notificationDailyTime = null;
      }
      for (const k of STALE_NOTIFICATION_KEYS) {
        delete result[k];
      }
      return result;
    },
  },
];

export const CURRENT_SETTINGS_VERSION = settingsMigrations.length > 0
  ? settingsMigrations[settingsMigrations.length - 1]!.version
  : 0;

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return defaultSettings;
  }

  let stored = JSON.parse(raw) as Record<string, unknown>;
  const storedVersion = typeof stored['_version'] === 'number' ? stored['_version'] : 0;

  let migrated = false;
  for (const migration of settingsMigrations) {
    if (migration.version > storedVersion) {
      stored = migration.migrate(stored);
      migrated = true;
    }
  }

  // Strip _version before merging with defaults (it's not part of AppSettings)
  delete stored['_version'];
  const merged = { ...defaultSettings, ...stored } as AppSettings;

  if (migrated) {
    const toStore = { ...merged, _version: CURRENT_SETTINGS_VERSION } as Record<string, unknown>;
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(toStore));
  }

  return merged;
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const current = await loadSettings();
  const next = { ...current, ...patch } as Record<string, unknown>;
  next['_version'] = CURRENT_SETTINGS_VERSION;
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return { ...current, ...patch } as AppSettings;
}
