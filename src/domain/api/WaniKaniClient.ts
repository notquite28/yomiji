import {
  ApiResource,
  AssignmentData,
  CollectionResponse,
  CollectionResult,
  ErrorResponse,
  LevelProgressionData,
  LessonStartPayload,
  ReviewProgressPayload,
  ReviewStatisticData,
  StudyMaterialData,
  StudyMaterialPayload,
  SubjectData,
  VoiceActorData,
  WaniKaniUserData,
} from './types';

const BASE_URL = 'https://api.wanikani.com/v2';
const RATE_LIMIT_PER_SERVER_MINUTE = 60;
const REQUEST_TIMEOUT_MS = 45_000;

export type CollectionPageProgress = {
  collection: string;
  loaded: number;
  total?: number;
};

export type CollectionPageProgressCallback = (progress: CollectionPageProgress) => void;

export class WaniKaniApiError extends Error {
  readonly status: number;
  readonly code?: number;

  constructor(status: number, message: string, code?: number) {
    super(message);
    this.name = 'WaniKaniApiError';
    this.status = status;
    this.code = code;
  }
}

export class WaniKaniClient {
  private readonly fetcher: typeof fetch;
  private estimatedClockSkewMs = 0;
  private lastRequestServerDate?: Date;
  private requestsInLastInterval = 0;

  constructor(private readonly apiToken: string, fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }

  get requestsRemainingInInterval() {
    if (this.rateLimitResetMs <= 0) {
      return RATE_LIMIT_PER_SERVER_MINUTE;
    }
    return RATE_LIMIT_PER_SERVER_MINUTE - this.requestsInLastInterval;
  }

  get rateLimitResetMs() {
    if (!this.lastRequestServerDate) {
      return 0;
    }

    const serverNow = new Date(Date.now() + this.estimatedClockSkewMs);
    const lastMinute = this.minuteKey(this.lastRequestServerDate);
    const currentMinute = this.minuteKey(serverNow);

    if (lastMinute < currentMinute) {
      return 0;
    }
    if (lastMinute > currentMinute) {
      return RATE_LIMIT_PER_SERVER_MINUTE * 1000;
    }

    const nextServerMinute = new Date(serverNow);
    nextServerMinute.setUTCSeconds(0, 0);
    nextServerMinute.setUTCMinutes(nextServerMinute.getUTCMinutes() + 1);
    return Math.max(0, nextServerMinute.getTime() - this.estimatedClockSkewMs - Date.now());
  }

  async getUser() {
    return this.request<ApiResource<WaniKaniUserData>>('/user');
  }

  async getAssignments(updatedAfter?: string, onPage?: CollectionPageProgressCallback) {
    return this.getCollection<AssignmentData>('/assignments', {
      unlocked: 'true',
      hidden: 'false',
      updated_after: updatedAfter,
    }, onPage);
  }

  async getSubjects(updatedAfter?: string, onPage?: CollectionPageProgressCallback) {
    return this.getCollection<SubjectData>('/subjects', {
      hidden: 'false',
      updated_after: updatedAfter,
    }, onPage);
  }

  async getStudyMaterials(updatedAfter?: string, onPage?: CollectionPageProgressCallback) {
    return this.getCollection<StudyMaterialData>('/study_materials', {
      updated_after: updatedAfter,
    }, onPage);
  }

  async getStudyMaterialsForSubject(subjectId: number, onPage?: CollectionPageProgressCallback) {
    return this.getCollection<StudyMaterialData>('/study_materials', {
      subject_ids: String(subjectId),
    }, onPage);
  }

  async getLevelProgressions(updatedAfter?: string, onPage?: CollectionPageProgressCallback) {
    return this.getCollection<LevelProgressionData>('/level_progressions', {
      updated_after: updatedAfter,
    }, onPage);
  }

  async getVoiceActors(updatedAfter?: string, onPage?: CollectionPageProgressCallback) {
    return this.getCollection<VoiceActorData>('/voice_actors', {
      updated_after: updatedAfter,
    }, onPage);
  }

  async getReviewStatistics(updatedAfter?: string, onPage?: CollectionPageProgressCallback) {
    return this.getCollection<ReviewStatisticData>('/review_statistics', {
      hidden: 'false',
      updated_after: updatedAfter,
    }, onPage);
  }

  async startAssignment(payload: LessonStartPayload) {
    const body = {
      assignment: {
        started_at: payload.startedAt,
      },
    };

    return this.request<ApiResource<AssignmentData>>(`/assignments/${payload.assignmentId}/start`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async createReview(payload: ReviewProgressPayload) {
    const review: Record<string, unknown> = {
      assignment_id: payload.assignmentId,
      incorrect_meaning_answers: payload.incorrectMeaningAnswers,
      incorrect_reading_answers: payload.incorrectReadingAnswers,
    };

    if (payload.createdAt && Date.now() - Date.parse(payload.createdAt) > 15 * 60 * 1000) {
      review.created_at = payload.createdAt;
    }

    return this.request('/reviews', {
      method: 'POST',
      body: JSON.stringify({ review }),
    });
  }

  async upsertStudyMaterial(payload: StudyMaterialPayload) {
    const studyMaterial: Record<string, unknown> = {};

    if (payload.meaningNote !== undefined) {
      studyMaterial.meaning_note = payload.meaningNote;
    }
    if (payload.readingNote !== undefined) {
      studyMaterial.reading_note = payload.readingNote;
    }
    if (payload.meaningSynonyms !== undefined) {
      studyMaterial.meaning_synonyms = payload.meaningSynonyms;
    }

    let path = '/study_materials';
    let method = 'POST';

    if (payload.id) {
      path = `/study_materials/${payload.id}`;
      method = 'PUT';
    } else {
      studyMaterial.subject_id = payload.subjectId;
    }

    return this.request(path, {
      method,
      body: JSON.stringify({ study_material: studyMaterial }),
    });
  }

  private async getCollection<TData>(path: string, query: Record<string, string | undefined>, onPage?: CollectionPageProgressCallback) {
    const items: Array<ApiResource<TData>> = [];
    let totalCount: number | undefined;
    let dataUpdatedAt = '';
    let nextUrl: string | undefined = this.buildUrl(path, query).toString();

    while (nextUrl) {
      const page: CollectionResponse<TData> = await this.request<CollectionResponse<TData>>(nextUrl);
      items.push(...page.data);
      dataUpdatedAt = page.data_updated_at ?? dataUpdatedAt;
      totalCount = page.total_count ?? totalCount;
      onPage?.({ collection: path.replace('/', ''), loaded: items.length, total: totalCount });
      nextUrl = page.pages?.next_url ?? undefined;
    }

    return { items, dataUpdatedAt, totalCount } satisfies CollectionResult<TData>;
  }

  private async request<T>(pathOrUrl: string, init: RequestInit = {}) {
    const startedAt = Date.now();
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : this.buildUrl(pathOrUrl).toString();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Token token=${this.apiToken}`);
    headers.set('Accept', 'application/json');

    if (init.body) {
      headers.set('Content-Type', 'application/json');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetcher(url, { ...init, headers, signal: controller.signal });
      this.updateRateLimit(response.headers.get('date'), Date.now() - startedAt);

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (response.status >= 200 && response.status < 300) {
        return payload as T;
      }

      const errorPayload = payload as ErrorResponse | null;
      throw new WaniKaniApiError(
        response.status,
        errorPayload?.error ?? `WaniKani request failed with HTTP ${response.status}`,
        errorPayload?.code,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WaniKaniApiError(0, `WaniKani request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(path: string, query: Record<string, string | undefined> = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
    return url;
  }

  private updateRateLimit(dateHeader: string | null, roundTripMs: number) {
    if (!dateHeader) {
      return;
    }

    const serverDate = new Date(dateHeader);
    if (Number.isNaN(serverDate.getTime())) {
      return;
    }

    if (this.lastRequestServerDate && this.minuteKey(this.lastRequestServerDate) !== this.minuteKey(serverDate)) {
      this.requestsInLastInterval = 0;
    }

    this.requestsInLastInterval += 1;
    this.lastRequestServerDate = serverDate;
    this.estimatedClockSkewMs = serverDate.getTime() + roundTripMs / 2 - Date.now();
  }

  private minuteKey(date: Date) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes());
  }
}
