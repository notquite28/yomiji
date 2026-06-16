import { WaniKaniApiError, WaniKaniClient } from './WaniKaniClient';
import { CollectionResponse, SubjectData } from './types';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ Date: new Date().toUTCString() }),
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ Date: new Date().toUTCString() }),
    text: async () => body,
  } as Response;
}

function jsonResponseWithHeaders(status: number, body: unknown, headers: HeadersInit): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => JSON.stringify(body),
  } as Response;
}

function subject(id: number): CollectionResponse<SubjectData>['data'][number] {
  return {
    id,
    object: 'kanji',
    data_updated_at: `2024-01-0${id}T00:00:00.000Z`,
    data: {
      level: 1,
      characters: String(id),
      meanings: [{ meaning: `Subject ${id}`, primary: true, accepted_answer: true }],
      readings: [{ reading: 'いち', primary: true, accepted_answer: true, type: 'onyomi' }],
    },
  };
}


describe('WaniKaniClient request headers', () => {
  it('sends Bearer auth, revision, and JSON accept headers', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(jsonResponse({
      id: 1,
      object: 'user',
      data: { username: 'tester', level: 1 },
    }));
    const client = new WaniKaniClient('test-token', fetcher as unknown as typeof fetch);

    await client.getUser();

    const headers = fetcher.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('Wanikani-Revision')).toBe('20170710');
    expect(headers.get('Accept')).toBe('application/json');
  });
});

describe('WaniKaniClient rate limits', () => {
  it('uses RateLimit-Reset retry delay for 429 responses', async () => {
    const resetAt = Math.ceil((Date.now() + 30_000) / 1000);
    const fetcher = jest.fn().mockResolvedValueOnce(jsonResponseWithHeaders(429, { error: 'Too Many Requests' }, {
      Date: new Date().toUTCString(),
      'RateLimit-Reset': String(resetAt),
    }));
    const client = new WaniKaniClient('token', fetcher as unknown as typeof fetch);

    await client.getUser().catch((error: unknown) => {
      expect(error).toBeInstanceOf(WaniKaniApiError);
      expect(error).toMatchObject({
        status: 429,
        retryAfterMs: expect.any(Number),
      });
      const retryAfterMs = (error as WaniKaniApiError).retryAfterMs;
      expect(retryAfterMs).toBeGreaterThanOrEqual(0);
      expect(retryAfterMs).toBeLessThanOrEqual(31_000);
    });
  });

  it('uses HTTP-date Retry-After retry delay for 429 responses', async () => {
    const retryAt = new Date(Date.now() + 20_000).toUTCString();
    const fetcher = jest.fn().mockResolvedValueOnce(jsonResponseWithHeaders(429, { error: 'Too Many Requests' }, {
      Date: new Date().toUTCString(),
      'Retry-After': retryAt,
    }));
    const client = new WaniKaniClient('token', fetcher as unknown as typeof fetch);

    await client.getUser().catch((error: unknown) => {
      expect(error).toBeInstanceOf(WaniKaniApiError);
      expect((error as WaniKaniApiError).retryAfterMs).not.toBeNaN();
    });
  });

  it('keeps requestsRemainingInInterval at zero until reset', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(jsonResponseWithHeaders(200, {
      id: 1,
      object: 'user',
      data: { username: 'tester', level: 1 },
    }, {
      Date: new Date().toUTCString(),
      'RateLimit-Limit': '60',
      'RateLimit-Remaining': '0',
      'RateLimit-Reset': String(Math.ceil((Date.now() + 30_000) / 1000)),
    }));
    const client = new WaniKaniClient('token', fetcher as unknown as typeof fetch);

    await client.getUser();

    expect(client.requestsRemainingInInterval).toBe(0);
  });
});

describe('WaniKaniClient study material upsert', () => {
  it('PUTs remote material found by subject lookup when local id is absent', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        object: 'collection',
        url: 'https://api.wanikani.com/v2/study_materials?subject_ids=500',
        data_updated_at: '2024-01-01T00:00:00.000Z',
        data: [{ id: 123, object: 'study_material', data: { subject_id: 500 } }],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 123, object: 'study_material', data: { subject_id: 500 } }));
    const client = new WaniKaniClient('token', fetcher as unknown as typeof fetch);

    await client.upsertStudyMaterial({ subjectId: 500, meaningNote: 'note' });

    expect(fetcher.mock.calls[0]![0]).toContain('/study_materials?');
    expect(fetcher.mock.calls[0]![0]).toContain('subject_ids=500');
    expect(fetcher.mock.calls[1]![0]).toContain('/study_materials/123');
    expect(fetcher.mock.calls[1]![1]!.method).toBe('PUT');
  });

  it('POSTs a new material when subject lookup is empty', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        object: 'collection',
        url: 'https://api.wanikani.com/v2/study_materials?subject_ids=500',
        data_updated_at: null,
        data: [],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 123, object: 'study_material', data: { subject_id: 500 } }));
    const client = new WaniKaniClient('token', fetcher as unknown as typeof fetch);

    await client.upsertStudyMaterial({ subjectId: 500, meaningNote: 'note' });

    expect(fetcher.mock.calls[1]![0]).toContain('/study_materials');
    expect(fetcher.mock.calls[1]![1]!.method).toBe('POST');
    expect(fetcher.mock.calls[1]![1]!.body).toContain('"subject_id":500');
  });
});
describe('WaniKaniClient collection pagination', () => {
  it('follows next_url pages and reports aggregate progress', async () => {
    const page1: CollectionResponse<SubjectData> = {
      object: 'collection',
      url: 'https://api.wanikani.com/v2/subjects',
      pages: { next_url: 'https://api.wanikani.com/v2/subjects?page_after_id=1' },
      total_count: 2,
      data_updated_at: '2024-01-01T00:00:00.000Z',
      data: [subject(1)],
    };
    const page2: CollectionResponse<SubjectData> = {
      object: 'collection',
      url: 'https://api.wanikani.com/v2/subjects?page_after_id=1',
      pages: { next_url: null },
      total_count: 2,
      data_updated_at: '2024-01-02T00:00:00.000Z',
      data: [subject(2)],
    };
    const fetcher = jest.fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));
    const client = new WaniKaniClient('token', fetcher as unknown as typeof fetch);
    const progress = jest.fn();

    const result = await client.getSubjects('2023-12-31T00:00:00.000Z', progress);

    expect(result.items.map((item) => item.id)).toEqual([1, 2]);
    expect(result.dataUpdatedAt).toBe('2024-01-02T00:00:00.000Z');
    expect(result.totalCount).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]![0]).toContain('/subjects?');
    expect(fetcher.mock.calls[0]![0]).toContain('hidden=false');
    expect(fetcher.mock.calls[0]![0]).toContain('updated_after=2023-12-31T00%3A00%3A00.000Z');
    expect(fetcher.mock.calls[1]![0]).toBe('https://api.wanikani.com/v2/subjects?page_after_id=1');
    expect(progress).toHaveBeenNthCalledWith(1, { collection: 'subjects', loaded: 1, total: 2 });
    expect(progress).toHaveBeenNthCalledWith(2, { collection: 'subjects', loaded: 2, total: 2 });
  });

  it('keeps HTTP status when an error response is not JSON', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(textResponse(503, '<html>unavailable</html>'));
    const client = new WaniKaniClient('token', fetcher as unknown as typeof fetch);

    await expect(client.getUser()).rejects.toMatchObject({
      status: 503,
      message: 'WaniKani request failed with HTTP 503',
    });
  });
});
