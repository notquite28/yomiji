export type WaniKaniObject =
  | 'assignment'
  | 'collection'
  | 'kanji'
  | 'kana_vocabulary'
  | 'level_progression'
  | 'radical'
  | 'review_statistic'
  | 'study_material'
  | 'user'
  | 'vocabulary'
  | 'voice_actor';

export type CollectionPages = {
  per_page?: number;
  next_url?: string | null;
  previous_url?: string | null;
};

export type ApiResource<TData> = {
  id?: number;
  object: WaniKaniObject | string;
  url?: string;
  data_updated_at?: string;
  data: TData;
};

export type CollectionResponse<TData> = {
  object: 'collection';
  url: string;
  pages?: CollectionPages;
  total_count?: number;
  data_updated_at?: string;
  data: Array<ApiResource<TData>>;
};

export type CollectionResult<TData> = {
  items: Array<ApiResource<TData>>;
  dataUpdatedAt: string;
  totalCount?: number;
};

export type ErrorResponse = {
  error?: string;
  code?: number;
};

export type WaniKaniUserData = {
  username: string;
  level: number;
  profile_url?: string;
  current_vacation_started_at?: string | null;
  subscription?: {
    active?: boolean;
    max_level_granted?: number;
    period_ends_at?: string | null;
    type?: string;
  };
  preferences?: Record<string, unknown>;
};

export type SubjectMeaningData = {
  meaning: string;
  primary?: boolean;
  accepted_answer?: boolean;
};

export type SubjectAuxiliaryMeaningData = {
  meaning: string;
  type: 'whitelist' | 'blacklist' | string;
};

export type SubjectReadingData = {
  type?: 'onyomi' | 'kunyomi' | 'nanori' | string;
  primary?: boolean;
  accepted_answer?: boolean;
  reading: string;
};

export type PronunciationAudioData = {
  url: string;
  metadata?: {
    voice_actor_id?: number;
    voice_actor_name?: string;
    voice_description?: string;
  };
  content_type?: string;
};

export type CharacterImageData = {
  url: string;
  content_type?: string;
  metadata?: {
    color?: string;
    dimensions?: string;
    inline_styles?: boolean;
    style_name?: string;
  };
};

export type SubjectData = {
  slug?: string;
  level: number;
  characters?: string | null;
  character_images?: CharacterImageData[];
  meanings?: SubjectMeaningData[];
  auxiliary_meanings?: SubjectAuxiliaryMeaningData[];
  readings?: SubjectReadingData[];
  component_subject_ids?: number[];
  amalgamation_subject_ids?: number[];
  document_url?: string;
  hidden_at?: string | null;
  lesson_position?: number;
  meaning_mnemonic?: string;
  meaning_hint?: string;
  reading_mnemonic?: string;
  reading_hint?: string;
  context_sentences?: Array<{ en: string; ja: string }>;
  parts_of_speech?: string[];
  pronunciation_audios?: PronunciationAudioData[];
};

export type AssignmentData = {
  subject_id: number;
  subject_type: 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary' | string;
  srs_stage: number;
  available_at?: string | null;
  started_at?: string | null;
  passed_at?: string | null;
  burned_at?: string | null;
  unlocked_at?: string | null;
  hidden?: boolean;
};

export type StudyMaterialData = {
  subject_id: number;
  meaning_note?: string | null;
  reading_note?: string | null;
  meaning_synonyms?: string[];
  hidden?: boolean;
};

export type LevelProgressionData = {
  level: number;
  unlocked_at?: string | null;
  started_at?: string | null;
  passed_at?: string | null;
  completed_at?: string | null;
  abandoned_at?: string | null;
};

export type VoiceActorData = {
  name: string;
  gender?: 'male' | 'female' | string;
  description?: string;
};

export type ReviewStatisticData = {
  subject_id: number;
  subject_type?: 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary' | string;
  meaning_correct?: number;
  meaning_incorrect?: number;
  meaning_max_streak?: number;
  meaning_current_streak?: number;
  reading_correct?: number;
  reading_incorrect?: number;
  reading_max_streak?: number;
  reading_current_streak?: number;
  percentage_correct?: number;
  hidden?: boolean;
  created_at?: string;
};

export type ReviewProgressPayload = {
  assignmentId: number;
  incorrectMeaningAnswers: number;
  incorrectReadingAnswers: number;
  createdAt?: string;
};

export type LessonStartPayload = {
  assignmentId: number;
  startedAt?: string;
};

export type StudyMaterialPayload = {
  id?: number;
  subjectId: number;
  meaningNote?: string | null;
  readingNote?: string | null;
  meaningSynonyms?: string[];
};
