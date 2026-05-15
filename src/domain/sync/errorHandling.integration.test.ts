/**
 * Integration tests for error handling scenarios in the sync pipeline.
 *
 * Tests:
 * - 401/403 auth errors produce SyncError with 'auth' category
 * - 429 rate limiting is classified correctly
 * - Network timeouts and connection errors are classified
 * - Vacation mode user data is preserved
 * - Token invalidation stops sync and marks auth error
 * - Error log records are created with proper context
 */
import { applyMigrations, putSubjects, putUser } from '../../domain/db/database';
import { WaniKaniApiError } from '../../domain/api/WaniKaniClient';
import { runIncrementalSync, runPendingSync, SyncError } from '../../domain/sync/syncService';
import { queueReviewResult } from '../../domain/study/studyRepository';
import { createMockApi } from '../../test/mockApi';
import { createTestDb } from '../../test/sqliteShim';
import { makeUser, makeVocabulary, makeAssignment, resetIdCounter } from '../../test/factories';
import type { AppDatabase } from '../../domain/db/database';
import type { WaniKaniClient } from '../../domain/api/WaniKaniClient';

async function setupDb(): Promise<AppDatabase> {
  const db = createTestDb();
  await applyMigrations(db);
  return db;
}

function collectionResult<T>(dataUpdatedAt: string, items: T[] = []) {
  return { items, dataUpdatedAt, totalCount: items.length };
}

function configuredClient() {
  const user = makeUser();
  return createMockApi({
    getUser: async () => user,
    getSubjects: async () => collectionResult('2024-06-01T01:00:00.000Z'),
    getAssignments: async () => collectionResult('2024-06-01T02:00:00.000Z'),
    getStudyMaterials: async () => collectionResult('2024-06-01T03:00:00.000Z'),
    getLevelProgressions: async () => collectionResult('2024-06-01T04:00:00.000Z'),
    getVoiceActors: async () => collectionResult('2024-06-01T05:00:00.000Z'),
    getReviewStatistics: async () => collectionResult('2024-06-01T06:00:00.000Z'),
  });
}

// ── Auth Errors ──────────────────────────────────────────────────────────────

describe('401/403 auth error handling', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('wraps 401 in SyncError with auth category', async () => {
    const client = createMockApi({
      getUser: async () => { throw new WaniKaniApiError(401, 'Unauthorized'); },
    });

    try {
      await runIncrementalSync({ db, client: client as unknown as WaniKaniClient });
      fail('Expected sync to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      const syncErr = error as SyncError;
      expect(syncErr.category).toBe('auth');
      expect(syncErr.isRetryable).toBe(false);
    }
  });

  it('wraps 403 in SyncError with auth category', async () => {
    const client = createMockApi({
      getUser: async () => { throw new WaniKaniApiError(403, 'Forbidden'); },
    });

    try {
      await runIncrementalSync({ db, client: client as unknown as WaniKaniClient });
      fail('Expected sync to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).category).toBe('auth');
    }
  });

  it('logs auth errors to the error log', async () => {
    const client = createMockApi({
      getUser: async () => { throw new WaniKaniApiError(401, 'Unauthorized'); },
    });

    await expect(
      runIncrementalSync({ db, client: client as unknown as WaniKaniClient }),
    ).rejects.toThrow();

    const errors = await db.getAllAsync<{ message: string; context: string }>('SELECT message, context FROM error_log');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain('Unauthorized');
    expect(errors[0]!.context).toContain('user');
  });
});

// ── Rate Limiting ────────────────────────────────────────────────────────────

describe('429 rate limiting handling', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('wraps 429 in SyncError with rate-limit category', async () => {
    const client = createMockApi({
      getUser: async () => { throw new WaniKaniApiError(429, 'Rate Limited', undefined, 30_000); },
    });

    try {
      await runIncrementalSync({ db, client: client as unknown as WaniKaniClient });
      fail('Expected sync to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      const syncErr = error as SyncError;
      expect(syncErr.category).toBe('rate-limit');
      expect(syncErr.isRetryable).toBe(true);
    }
  });
});

// ── Network Errors ───────────────────────────────────────────────────────────

describe('network error handling', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('wraps generic errors in SyncError with unknown category', async () => {
    const client = createMockApi({
      getUser: async () => { throw new Error('ECONNREFUSED'); },
    });

    try {
      await runIncrementalSync({ db, client: client as unknown as WaniKaniClient });
      fail('Expected sync to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).category).toBe('unknown');
    }
  });

  it('wraps timeout errors (status 0) with timeout category', async () => {
    const client = createMockApi({
      getUser: async () => { throw new WaniKaniApiError(0, 'Request timed out'); },
    });

    try {
      await runIncrementalSync({ db, client: client as unknown as WaniKaniClient });
      fail('Expected sync to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).category).toBe('timeout');
    }
  });

  it('wraps 500 server errors with server category', async () => {
    const client = createMockApi({
      getUser: async () => { throw new WaniKaniApiError(500, 'Internal Server Error'); },
    });

    try {
      await runIncrementalSync({ db, client: client as unknown as WaniKaniClient });
      fail('Expected sync to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).category).toBe('server');
    }
  });
});

// ── Vacation Mode ────────────────────────────────────────────────────────────

describe('vacation mode', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('stores user with vacation_started_at and syncs successfully', async () => {
    const vacationUser = makeUser({
      username: 'vacationer',
      level: 3,
      current_vacation_started_at: '2024-05-01T00:00:00.000Z',
    });

    const client = createMockApi({
      getUser: async () => vacationUser,
      getSubjects: async () => collectionResult('2024-06-01T01:00:00.000Z'),
      getAssignments: async () => collectionResult('2024-06-01T02:00:00.000Z'),
      getStudyMaterials: async () => collectionResult('2024-06-01T03:00:00.000Z'),
      getLevelProgressions: async () => collectionResult('2024-06-01T04:00:00.000Z'),
      getVoiceActors: async () => collectionResult('2024-06-01T05:00:00.000Z'),
      getReviewStatistics: async () => collectionResult('2024-06-01T06:00:00.000Z'),
    });

    await runIncrementalSync({ db, client: client as unknown as WaniKaniClient });

    const userRow = await db.getFirstAsync<{ username: string; vacation_started_at: string | null }>(
      'SELECT username, vacation_started_at FROM user WHERE id = 1',
    );
    expect(userRow?.username).toBe('vacationer');
    expect(userRow?.vacation_started_at).toBe('2024-05-01T00:00:00.000Z');
  });

  it('transitions user from active to vacation on sync', async () => {
    // Start with active user
    const activeUser = makeUser({ username: 'active', current_vacation_started_at: null });
    await putUser(db, activeUser);

    // Sync with vacationing user
    const vacationUser = makeUser({
      username: 'active',
      current_vacation_started_at: '2024-06-01T00:00:00.000Z',
    });

    const client = createMockApi({
      getUser: async () => vacationUser,
      getSubjects: async () => collectionResult('2024-06-01T01:00:00.000Z'),
      getAssignments: async () => collectionResult('2024-06-01T02:00:00.000Z'),
      getStudyMaterials: async () => collectionResult('2024-06-01T03:00:00.000Z'),
      getLevelProgressions: async () => collectionResult('2024-06-01T04:00:00.000Z'),
      getVoiceActors: async () => collectionResult('2024-06-01T05:00:00.000Z'),
      getReviewStatistics: async () => collectionResult('2024-06-01T06:00:00.000Z'),
    });

    await runIncrementalSync({ db, client: client as unknown as WaniKaniClient });

    const userRow = await db.getFirstAsync<{ vacation_started_at: string | null }>('SELECT vacation_started_at FROM user WHERE id = 1');
    expect(userRow?.vacation_started_at).toBe('2024-06-01T00:00:00.000Z');
  });
});

// ── Partial Sync Failure ─────────────────────────────────────────────────────

describe('partial sync failure', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('preserves data from completed steps when a later step fails', async () => {
    const user = makeUser({ username: 'partial' });
    const vocab = makeVocabulary({ id: 100 });

    const client = createMockApi({
      getUser: async () => user,
      getSubjects: async () => collectionResult('2024-06-01T01:00:00.000Z', [vocab]),
      getAssignments: async () => { throw new Error('Failed at assignments'); },
    });

    await expect(
      runIncrementalSync({ db, client: client as unknown as WaniKaniClient }),
    ).rejects.toThrow('Failed at assignments');

    // User and subjects should still be saved
    const userRow = await db.getFirstAsync<{ username: string }>('SELECT username FROM user WHERE id = 1');
    expect(userRow?.username).toBe('partial');

    const subjectRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM subjects WHERE id = 100');
    expect(subjectRow?.id).toBe(100);

    // Cursor for subjects should be saved
    const cursors = await import('../../domain/db/database').then((m) => m.getSyncCursors(db));
    expect(cursors.subjects).toBe('2024-06-01T01:00:00.000Z');
  });
});
