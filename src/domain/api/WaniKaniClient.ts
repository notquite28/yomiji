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
// On HTTP 429 the client waits for the authoritative rate-limit window
// (RateLimit-Reset / Retry-After) to elapse and then retries, rather than
// failing the whole sync. The wait is NOT clamped: retrying before the window
// resets would just burn a retry attempt on a guaranteed second 429. Instead,
// if the server's own reset is further out than MAX_RATE_LIMIT_WAIT_MS we stop
// retrying and surface the error, so a misbehaving server can't stall a sync
// indefinitely while we still honor a legitimate long reset by waiting it out.
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type WaniKaniClientOptions = {
  // Injectable so tests can skip the real rate-limit backoff wait.
  sleep?: (ms: number) => Promise<void>;
};

export type CollectionPageProgress = {
  collection: string;
  loaded: number;
  total?: number;
};

export type CollectionPageProgressCallback = (progress: CollectionPageProgress) => void;

export class WaniKaniApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly retryAfterMs?: number;

  constructor(status: number, message: string, code?: number, retryAfterMs?: number) {
    super(message);
    this.name = 'WaniKaniApiError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export class WaniKaniClient {
  private readonly fetcher: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private estimatedClockSkewMs = 0;
  private lastRequestServerDate?: Date;
  private requestsInLastInterval = 0;
  private rateLimitLimit = RATE_LIMIT_PER_SERVER_MINUTE;
  private rateLimitRemaining?: number;
  private rateLimitResetAtMs?: number;

  constructor(
    private readonly apiToken: string,
    fetcher: typeof fetch = fetch,
    options: WaniKaniClientOptions = {},
  ) {
    this.fetcher = fetcher;
    this.sleep = options.sleep ?? delay;
  }

  get requestsRemainingInInterval() {
    if (this.rateLimitResetMs <= 0) {
      this.rateLimitRemaining = undefined;
      return this.rateLimitLimit;
    }
    return this.rateLimitRemaining ?? Math.max(0, this.rateLimitLimit - this.requestsInLastInterval);
  }

  get rateLimitResetMs() {
    const resetAtMs = this.rateLimitResetAtMs;
    if (resetAtMs !== undefined) {
      const remainingMs = resetAtMs - Date.now();
      if (remainingMs > 0) {
        return remainingMs;
      }
      return 0;
    }

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

  async getStudyMaterialBySubjectId(subjectId: number) {
    const result = await this.getStudyMaterialsForSubject(subjectId);
    return result.items[0] ?? null;
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

  async upsertStudyMaterial(payload: StudyMaterialPayload): Promise<ApiResource<StudyMaterialData> | null> {
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

    if (payload.id && payload.id > 0) {
      return this.request<ApiResource<StudyMaterialData> | null>(`/study_materials/${payload.id}`, {
        method: 'PUT',
        body: JSON.stringify({ study_material: studyMaterial }),
      });
    }

    const remote = await this.getStudyMaterialBySubjectId(payload.subjectId);
    if (remote?.id && remote.id > 0) {
      return this.request<ApiResource<StudyMaterialData> | null>(`/study_materials/${remote.id}`, {
        method: 'PUT',
        body: JSON.stringify({ study_material: studyMaterial }),
      });
    }

    studyMaterial.subject_id = payload.subjectId;
    return this.request<ApiResource<StudyMaterialData> | null>('/study_materials', {
      method: 'POST',
      body: JSON.stringify({ study_material: studyMaterial }),
    });
  }

  private async getCollection<TData>(path: string, query: Record<string, string | undefined>, onPage?: CollectionPageProgressCallback) {
    const items: Array<ApiResource<TData>> = [];
    let totalCount: number | undefined;
    let dataUpdatedAt = query.updated_after ?? '';
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

  private async request<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.performRequest<T>(pathOrUrl, init);
      } catch (error) {
        // Honor WaniKani's 429 + RateLimit-Reset by waiting for the window to
        // reset and retrying, so a burst mid-sync self-heals instead of failing
        // the whole sync. Give up after MAX_RATE_LIMIT_RETRIES.
        if (
          error instanceof WaniKaniApiError &&
          error.status === 429 &&
          attempt < MAX_RATE_LIMIT_RETRIES
        ) {
          // Wait for the full authoritative reset rather than a clamped value:
          // retrying before the window resets only burns an attempt on another
          // guaranteed 429. If the reset is further out than we are willing to
          // block, stop retrying and surface the error instead.
          const waitMs = Math.max(0, error.retryAfterMs ?? this.rateLimitResetMs ?? 0);
          if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
            throw error;
          }
          await this.sleep(waitMs > 0 ? waitMs : 1000);
          continue;
        }
        throw error;
      }
    }
  }

  private async performRequest<T>(pathOrUrl: string, init: RequestInit = {}) {
    const startedAt = Date.now();
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : this.buildUrl(pathOrUrl).toString();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.apiToken}`);
    headers.set('Wanikani-Revision', '20170710');
    headers.set('Accept', 'application/json');

    if (init.body) {
      headers.set('Content-Type', 'application/json');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetcher(url, { ...init, headers, signal: controller.signal });
      this.updateRateLimit(response.headers, Date.now() - startedAt);

      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (error) {
        if (response.status >= 200 && response.status < 300) {
          throw error;
        }
      }

      if (response.status >= 200 && response.status < 300) {
        return payload as T;
      }

      const errorPayload = isErrorResponse(payload) ? payload : null;
      const retryAfterMs = response.status === 429 ? this.retryAfterMsFromHeaders(response.headers) : undefined;
      throw new WaniKaniApiError(
        response.status,
        errorPayload?.error ?? `WaniKani request failed with HTTP ${response.status}`,
        errorPayload?.code,
        retryAfterMs,
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

  private serverEpochMsToLocalMs(serverEpochMs: number) {
    return serverEpochMs - this.estimatedClockSkewMs;
  }

  private updateRateLimit(headers: Headers, roundTripMs: number) {
    const limit = Number(headers.get('RateLimit-Limit'));
    if (Number.isFinite(limit) && limit > 0) {
      this.rateLimitLimit = limit;
    }

    const remaining = Number(headers.get('RateLimit-Remaining'));
    if (Number.isFinite(remaining) && remaining >= 0) {
      this.rateLimitRemaining = remaining;
    }

    const dateHeader = headers.get('date');
    if (dateHeader) {
      const serverDate = new Date(dateHeader);
      if (!Number.isNaN(serverDate.getTime())) {
        if (this.lastRequestServerDate && this.minuteKey(this.lastRequestServerDate) !== this.minuteKey(serverDate)) {
          this.requestsInLastInterval = 0;
        }

        this.requestsInLastInterval += 1;
        this.lastRequestServerDate = serverDate;
        this.estimatedClockSkewMs = serverDate.getTime() + roundTripMs / 2 - Date.now();
      }
    }

    const resetSeconds = Number(headers.get('RateLimit-Reset'));
    if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
      this.rateLimitResetAtMs = this.serverEpochMsToLocalMs(resetSeconds * 1000);
    }
  }

  private retryAfterMsFromHeaders(headers: Headers): number | undefined {
    const resetSeconds = Number(headers.get('RateLimit-Reset'));
    if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
      return Math.max(0, this.serverEpochMsToLocalMs(resetSeconds * 1000) - Date.now());
    }

    const retryAfter = headers.get('Retry-After');
    if (!retryAfter) {
      return undefined;
    }

    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds)) {
      return Math.max(0, retryAfterSeconds * 1000);
    }

    const retryAfterDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryAfterDate)) {
      return Math.max(0, this.serverEpochMsToLocalMs(retryAfterDate) - Date.now());
    }

    return undefined;
  }

  private minuteKey(date: Date) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes());
  }
}

function isErrorResponse(payload: unknown): payload is ErrorResponse {
  return typeof payload === 'object' && payload !== null && 'error' in payload;
}
