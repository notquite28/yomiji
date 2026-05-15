/**
 * Mock WaniKani API client for integration tests.
 *
 * Implements the same interface as WaniKaniClient but with configurable responses.
 * Tracks all method calls for assertion.
 */
import { WaniKaniApiError } from '../domain/api/WaniKaniClient';
import type {
  ApiResource,
  AssignmentData,
  CollectionResult,
  LevelProgressionData,
  LessonStartPayload,
  ReviewProgressPayload,
  ReviewStatisticData,
  StudyMaterialData,
  StudyMaterialPayload,
  SubjectData,
  VoiceActorData,
  WaniKaniUserData,
} from '../domain/api/types';

export type MockApiCall = {
  method: string;
  args: unknown[];
};

/**
 * Type returned by createMockApi.
 */
export type MockApiClient = {
  calls: MockApiCall[];
  getUser(): Promise<ApiResource<WaniKaniUserData>>;
  getSubjects(updatedAfter?: string): Promise<CollectionResult<SubjectData>>;
  getAssignments(updatedAfter?: string): Promise<CollectionResult<AssignmentData>>;
  getStudyMaterials(updatedAfter?: string): Promise<CollectionResult<StudyMaterialData>>;
  getLevelProgressions(updatedAfter?: string): Promise<CollectionResult<LevelProgressionData>>;
  getVoiceActors(updatedAfter?: string): Promise<CollectionResult<VoiceActorData>>;
  getReviewStatistics(updatedAfter?: string): Promise<CollectionResult<ReviewStatisticData>>;
  startAssignment(payload: LessonStartPayload): Promise<void>;
  createReview(payload: ReviewProgressPayload): Promise<void>;
  upsertStudyMaterial(payload: StudyMaterialPayload): Promise<void>;
};

/**
 * Create a mock API client that tracks calls and returns configured data.
 */
export function createMockApi(overrides: {
  getUser?: () => Promise<ApiResource<WaniKaniUserData>>;
  getSubjects?: (updatedAfter?: string) => Promise<CollectionResult<SubjectData>>;
  getAssignments?: (updatedAfter?: string) => Promise<CollectionResult<AssignmentData>>;
  getStudyMaterials?: (updatedAfter?: string) => Promise<CollectionResult<StudyMaterialData>>;
  getLevelProgressions?: (updatedAfter?: string) => Promise<CollectionResult<LevelProgressionData>>;
  getVoiceActors?: (updatedAfter?: string) => Promise<CollectionResult<VoiceActorData>>;
  getReviewStatistics?: (updatedAfter?: string) => Promise<CollectionResult<ReviewStatisticData>>;
  startAssignment?: (payload: LessonStartPayload) => Promise<void>;
  createReview?: (payload: ReviewProgressPayload) => Promise<void>;
  upsertStudyMaterial?: (payload: StudyMaterialPayload) => Promise<void>;
} = {}): MockApiClient {
  const calls: MockApiCall[] = [];
  const track = (method: string, ...args: unknown[]) => { calls.push({ method, args }); };
  const empty = <T>(): CollectionResult<T> => ({ items: [], dataUpdatedAt: '2024-06-01T00:00:00.000Z', totalCount: 0 });

  return {
    calls,

    async getUser(): Promise<ApiResource<WaniKaniUserData>> {
      track('getUser');
      return overrides.getUser?.() ?? (() => { throw new Error('getUser not configured'); })();
    },

    async getSubjects(updatedAfter?: string): Promise<CollectionResult<SubjectData>> {
      track('getSubjects', updatedAfter);
      return overrides.getSubjects?.(updatedAfter) ?? empty();
    },

    async getAssignments(updatedAfter?: string): Promise<CollectionResult<AssignmentData>> {
      track('getAssignments', updatedAfter);
      return overrides.getAssignments?.(updatedAfter) ?? empty();
    },

    async getStudyMaterials(updatedAfter?: string): Promise<CollectionResult<StudyMaterialData>> {
      track('getStudyMaterials', updatedAfter);
      return overrides.getStudyMaterials?.(updatedAfter) ?? empty();
    },

    async getLevelProgressions(updatedAfter?: string): Promise<CollectionResult<LevelProgressionData>> {
      track('getLevelProgressions', updatedAfter);
      return overrides.getLevelProgressions?.(updatedAfter) ?? empty();
    },

    async getVoiceActors(updatedAfter?: string): Promise<CollectionResult<VoiceActorData>> {
      track('getVoiceActors', updatedAfter);
      return overrides.getVoiceActors?.(updatedAfter) ?? empty();
    },

    async getReviewStatistics(updatedAfter?: string): Promise<CollectionResult<ReviewStatisticData>> {
      track('getReviewStatistics', updatedAfter);
      return overrides.getReviewStatistics?.(updatedAfter) ?? empty();
    },

    async startAssignment(payload: LessonStartPayload): Promise<void> {
      track('startAssignment', payload);
      return overrides.startAssignment?.(payload);
    },

    async createReview(payload: ReviewProgressPayload): Promise<void> {
      track('createReview', payload);
      return overrides.createReview?.(payload);
    },

    async upsertStudyMaterial(payload: StudyMaterialPayload): Promise<void> {
      track('upsertStudyMaterial', payload);
      return overrides.upsertStudyMaterial?.(payload);
    },
  };
}

/**
 * Helper to create a WaniKaniApiError, matching the real error class.
 */
export function apiError(status: number, message: string, retryAfterMs?: number) {
  return new WaniKaniApiError(status, message, undefined, retryAfterMs);
}
