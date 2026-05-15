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

export type NotificationScheduleWindow = 12 | 24 | 48 | 72;

export type AppSettings = {
  appearance: AppearanceMode;
  notificationsAllReviews: boolean;
  notificationsBadging: boolean;
  notificationSounds: boolean;
  notificationQuietHoursEnabled: boolean;
  notificationQuietHoursStart: number;
  notificationQuietHoursEnd: number;
  notificationScheduleWindow: NotificationScheduleWindow;
  notificationMinReviewCount: number;
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
  notificationsAllReviews: false,
  notificationsBadging: true,
  notificationSounds: false,
  notificationQuietHoursEnabled: false,
  notificationQuietHoursStart: 22,
  notificationQuietHoursEnd: 7,
  notificationScheduleWindow: 48,
  notificationMinReviewCount: 1,
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

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return defaultSettings;
  }

  return {
    ...defaultSettings,
    ...(JSON.parse(raw) as Partial<AppSettings>),
  };
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const next = {
    ...(await loadSettings()),
    ...patch,
  };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
