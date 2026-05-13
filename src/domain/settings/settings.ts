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

export type AnkiModeTaskType = 'both' | 'readingOnly' | 'meaningOnly';
export type AppearanceMode = 'system' | 'light' | 'dark';
export type SubjectType = 'radical' | 'kanji' | 'vocabulary';

export type AppSettings = {
  appearance: AppearanceMode;
  notificationsAllReviews: boolean;
  notificationsBadging: boolean;
  notificationSounds: boolean;
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
  showAnswerImmediately: boolean;
  showFullAnswer: boolean;
  exactMatch: boolean;
  enableCheats: boolean;
  skipKanjiReadings: boolean;
  minimizeReviewPenalty: boolean;
  ankiMode: boolean;
  ankiModeTaskType: AnkiModeTaskType;
  ankiModeCombineReadingMeaning: boolean;
  showKanaOnlyVocab: boolean;
  leechThreshold: number;
  playAudioAutomatically: boolean;
  interruptBackgroundAudio: boolean;
  preferredVoiceActorId: number | null;
  offlineAudio: boolean;
  offlineAudioCellular: boolean;
};

export const defaultSettings: AppSettings = {
  appearance: 'system',
  notificationsAllReviews: false,
  notificationsBadging: true,
  notificationSounds: false,
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
  showAnswerImmediately: true,
  showFullAnswer: false,
  exactMatch: false,
  enableCheats: true,
  skipKanjiReadings: false,
  minimizeReviewPenalty: true,
  ankiMode: false,
  ankiModeTaskType: 'both',
  ankiModeCombineReadingMeaning: false,
  showKanaOnlyVocab: true,
  leechThreshold: 1,
  playAudioAutomatically: false,
  interruptBackgroundAudio: false,
  preferredVoiceActorId: null,
  offlineAudio: false,
  offlineAudioCellular: false,
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
