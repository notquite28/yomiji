/**
 * Factory functions for creating API resource objects used in integration tests.
 *
 * These produce realistic WaniKani API payloads that match the shapes expected
 * by the sync pipeline and database layer.
 */
import type {
  ApiResource,
  AssignmentData,
  CollectionResponse,
  LevelProgressionData,
  ReviewStatisticData,
  StudyMaterialData,
  SubjectData,
  VoiceActorData,
  WaniKaniUserData,
} from '../domain/api/types';

let nextId = 1;
export function resetIdCounter() {
  nextId = 1;
}
export function nextTestId() {
  return nextId++;
}

// ── User ──────────────────────────────────────────────────────────────────────

export function makeUser(overrides: Partial<WaniKaniUserData> = {}): ApiResource<WaniKaniUserData> {
  return {
    id: 1,
    object: 'user',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      username: 'testuser',
      level: 5,
      current_vacation_started_at: null,
      ...overrides,
    },
  };
}

// ── Subjects ─────────────────────────────────────────────────────────────────

export type SubjectOverrides = Partial<SubjectData> & { id?: number; object?: string };

export function makeRadical(overrides: SubjectOverrides = {}): ApiResource<SubjectData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'radical',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      level: 1,
      characters: '一',
      meanings: [{ meaning: 'Ground', primary: true, accepted_answer: true }],
      auxiliary_meanings: [],
      ...overrides,
    },
  };
}

export function makeKanji(overrides: SubjectOverrides = {}): ApiResource<SubjectData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'kanji',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      level: 1,
      characters: '山',
      meanings: [{ meaning: 'Mountain', primary: true, accepted_answer: true }],
      readings: [{ reading: 'さん', primary: true, accepted_answer: true, type: 'onyomi' }],
      component_subject_ids: [],
      amalgamation_subject_ids: [],
      ...overrides,
    },
  };
}

export function makeVocabulary(overrides: SubjectOverrides = {}): ApiResource<SubjectData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'vocabulary',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      level: 1,
      characters: '山',
      meanings: [{ meaning: 'Mountain', primary: true, accepted_answer: true }],
      readings: [{ reading: 'やま', primary: true, accepted_answer: true, type: 'kunyomi' }],
      component_subject_ids: [],
      context_sentences: [],
      parts_of_speech: ['noun'],
      pronunciation_audios: [],
      ...overrides,
    },
  };
}

export function makeKanaVocabulary(overrides: SubjectOverrides = {}): ApiResource<SubjectData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'kana_vocabulary',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      level: 1,
      characters: 'ちょっと',
      meanings: [{ meaning: 'A Little', primary: true, accepted_answer: true }],
      readings: [],
      component_subject_ids: [],
      context_sentences: [],
      parts_of_speech: ['adverb'],
      pronunciation_audios: [],
      ...overrides,
    },
  };
}

// ── Assignments ──────────────────────────────────────────────────────────────

export type AssignmentOverrides = Partial<AssignmentData> & { id?: number };

export function makeAssignment(subjectId: number, overrides: AssignmentOverrides = {}): ApiResource<AssignmentData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'assignment',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      subject_id: subjectId,
      subject_type: 'vocabulary',
      srs_stage: 1,
      available_at: '2024-01-01T00:00:00.000Z',
      started_at: '2024-01-01T00:00:00.000Z',
      ...overrides,
    },
  };
}

export function makeAvailableAssignment(subjectId: number, overrides: AssignmentOverrides = {}): ApiResource<AssignmentData> {
  return makeAssignment(subjectId, {
    srs_stage: 1,
    available_at: '2024-01-01T00:00:00.000Z',
    started_at: '2023-12-01T00:00:00.000Z',
    ...overrides,
  });
}

export function makeLessonAssignment(subjectId: number, overrides: AssignmentOverrides = {}): ApiResource<AssignmentData> {
  return makeAssignment(subjectId, {
    subject_type: 'vocabulary',
    srs_stage: 0,
    available_at: null,
    started_at: null,
    ...overrides,
  });
}

// ── Study Materials ──────────────────────────────────────────────────────────

export type StudyMaterialOverrides = Partial<StudyMaterialData> & { id?: number };

export function makeStudyMaterial(subjectId: number, overrides: StudyMaterialOverrides = {}): ApiResource<StudyMaterialData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'study_material',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      subject_id: subjectId,
      meaning_synonyms: [],
      ...overrides,
    },
  };
}

// ── Review Statistics ────────────────────────────────────────────────────────

export type ReviewStatOverrides = Partial<ReviewStatisticData> & { id?: number };

export function makeReviewStat(subjectId: number, overrides: ReviewStatOverrides = {}): ApiResource<ReviewStatisticData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'review_statistic',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      subject_id: subjectId,
      subject_type: 'vocabulary',
      meaning_correct: 5,
      meaning_incorrect: 1,
      meaning_max_streak: 4,
      meaning_current_streak: 2,
      reading_correct: 5,
      reading_incorrect: 0,
      reading_max_streak: 5,
      reading_current_streak: 5,
      percentage_correct: 91,
      ...overrides,
    },
  };
}

// ── Level Progressions ───────────────────────────────────────────────────────

export type LevelProgressionOverrides = Partial<LevelProgressionData> & { id?: number };

export function makeLevelProgression(overrides: LevelProgressionOverrides = {}): ApiResource<LevelProgressionData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'level_progression',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      level: 1,
      unlocked_at: '2024-01-01T00:00:00.000Z',
      started_at: '2024-01-01T00:00:00.000Z',
      ...overrides,
    },
  };
}

// ── Voice Actors ─────────────────────────────────────────────────────────────

export type VoiceActorOverrides = Partial<VoiceActorData> & { id?: number };

export function makeVoiceActor(overrides: VoiceActorOverrides = {}): ApiResource<VoiceActorData> {
  const id = overrides.id ?? nextTestId();
  return {
    id,
    object: 'voice_actor',
    data_updated_at: '2024-06-01T00:00:00.000Z',
    data: {
      name: 'Kyoko',
      gender: 'female',
      description: 'A voice actor',
      ...overrides,
    },
  };
}

// ── Collection Responses ─────────────────────────────────────────────────────

export function makeCollectionResponse<T>(
  items: Array<ApiResource<T>>,
  overrides: Partial<CollectionResponse<T>> = {},
): CollectionResponse<T> {
  return {
    object: 'collection',
    url: 'https://api.wanikani.com/v2/test',
    pages: { next_url: null },
    total_count: items.length,
    data_updated_at: items.length > 0 ? (items[items.length - 1]!.data_updated_at ?? '2024-06-01T00:00:00.000Z') : '2024-06-01T00:00:00.000Z',
    data: items,
    ...overrides,
  };
}
