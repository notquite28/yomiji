/**
 * Integration tests for pending write round-trips.
 *
 * Tests the full lifecycle of queued local mutations:
 * - Review result → queue → local DB mutations → send via API → delete on success
 * - Lesson start → queue → mark started → send via API → delete on success
 * - Study material update → queue → local upsert → send via API → delete on success
 * - 422 responses discard stale writes instead of retrying
 * - Non-422 errors increment attempts and preserve the row for retry
 * - Mixed pending writes (reviews + lessons + study materials) flush in order
 */
import { applyMigrations, putAssignments, putSubjects, putStudyMaterials } from '../../domain/db/database';
import { WaniKaniApiError } from '../../domain/api/WaniKaniClient';
import { queueReviewResult, queueLessonStart, queueStudyMaterialUpdate } from '../../domain/study/studyRepository';
import { runPendingSync } from '../../domain/sync/syncService';
import { createMockApi, type MockApiClient } from '../../test/mockApi';
import { createTestDb } from '../../test/sqliteShim';
import { makeVocabulary, makeAssignment, makeStudyMaterial, resetIdCounter } from '../../test/factories';
import type { AppDatabase } from '../../domain/db/database';
import type { WaniKaniClient } from '../../domain/api/WaniKaniClient';

async function setupDb(): Promise<AppDatabase> {
  const db = createTestDb();
  await applyMigrations(db);
  return db;
}

// Helper to seed a subject + assignment so pending writes can reference them
async function seedReviewTarget(db: AppDatabase) {
  const subjectId = 500;
  const assignmentId = 600;
  const vocab = makeVocabulary({ id: subjectId });
  const assignment = makeAssignment(subjectId, {
    id: assignmentId,
    subject_id: subjectId,
    srs_stage: 1,
    started_at: '2024-01-01T00:00:00.000Z',
    available_at: '2024-01-01T00:00:00.000Z',
  });
  await putSubjects(db, [vocab]);
  await putAssignments(db, [assignment]);
  return { subjectId, assignmentId };
}

async function seedLessonTarget(db: AppDatabase) {
  const subjectId = 501;
  const assignmentId = 601;
  const vocab = makeVocabulary({ id: subjectId });
  const assignment = makeAssignment(subjectId, {
    id: assignmentId,
    subject_id: subjectId,
    subject_type: 'vocabulary',
    srs_stage: 0,
    started_at: null,
    available_at: null,
  });
  await putSubjects(db, [vocab]);
  await putAssignments(db, [assignment]);
  return { subjectId, assignmentId };
}

async function countPending(db: AppDatabase, table: 'pending_progress' | 'pending_study_materials'): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return row?.count ?? 0;
}

// ── Review Result Round-Trip ─────────────────────────────────────────────────

describe('pending review round-trip', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('queues a review, clears available_at, and sends via API on sync', async () => {
    const { assignmentId } = await seedReviewTarget(db);

    await queueReviewResult(db, {
      assignmentId,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
    });

    // Pending row should exist
    expect(await countPending(db, 'pending_progress')).toBe(1);

    // available_at should be cleared
    const assignment = await db.getFirstAsync<{ available_at: string | null }>(
      'SELECT available_at FROM assignments WHERE id = ?', assignmentId,
    );
    expect(assignment?.available_at).toBeNull();

    // Flush via sync
    const mockApi = createMockApi();
    await runPendingSync({ db, client: mockApi as unknown as WaniKaniClient });

    // API should have been called
    const reviewCall = mockApi.calls.find((c) => c.method === 'createReview');
    expect(reviewCall).toBeDefined();
    const payload = reviewCall!.args[0] as { assignmentId: number };
    expect(payload.assignmentId).toBe(assignmentId);

    // Pending row should be deleted
    expect(await countPending(db, 'pending_progress')).toBe(0);
  });

  it('records subject_progress when review has mistakes', async () => {
    const { assignmentId, subjectId } = await seedReviewTarget(db);

    await queueReviewResult(db, {
      assignmentId,
      incorrectMeaningAnswers: 1,
      incorrectReadingAnswers: 0,
    });

    const progress = await db.getFirstAsync<{ subject_id: number; last_mistake_at: string }>(
      'SELECT subject_id, last_mistake_at FROM subject_progress WHERE subject_id = ?',
      subjectId,
    );
    expect(progress).toBeDefined();
    expect(progress!.subject_id).toBe(subjectId);
    expect(progress!.last_mistake_at).toBeTruthy();
  });

  it('records subject_progress without last mistake for correct review', async () => {
    const { assignmentId, subjectId } = await seedReviewTarget(db);

    await queueReviewResult(db, {
      assignmentId,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
    });

    const progress = await db.getFirstAsync<{ subject_id: number; last_mistake_at: string | null }>(
      'SELECT subject_id, last_mistake_at FROM subject_progress WHERE subject_id = ?',
      subjectId,
    );
    expect(progress?.subject_id).toBe(subjectId);
    expect(progress?.last_mistake_at).toBe('');
  });
});

describe('local review SRS optimism', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  async function assignmentState(assignmentId: number) {
    return db.getFirstAsync<{ srs_stage: number; available_at: string | null }>(
      'SELECT srs_stage, available_at FROM assignments WHERE id = ?',
      assignmentId,
    );
  }

  it('advances a correct review and clears availability', async () => {
    const { assignmentId } = await seedReviewTarget(db);
    await db.runAsync('UPDATE assignments SET srs_stage = 4, available_at = ? WHERE id = ?', '2024-01-01T00:00:00.000Z', assignmentId);

    await queueReviewResult(db, { assignmentId, incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0 });

    await expect(assignmentState(assignmentId)).resolves.toMatchObject({ srs_stage: 5, available_at: null });
  });

  it('regresses an incorrect review and writes last mistake', async () => {
    const { assignmentId, subjectId } = await seedReviewTarget(db);
    await db.runAsync('UPDATE assignments SET srs_stage = 4, available_at = ? WHERE id = ?', '2024-01-01T00:00:00.000Z', assignmentId);

    await queueReviewResult(db, { assignmentId, incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 });

    await expect(assignmentState(assignmentId)).resolves.toMatchObject({ srs_stage: 3, available_at: null });
    const progress = await db.getFirstAsync<{ srs_stage: number; last_mistake_at: string | null }>(
      'SELECT srs_stage, last_mistake_at FROM subject_progress WHERE subject_id = ?',
      subjectId,
    );
    expect(progress?.srs_stage).toBe(3);
    expect(progress?.last_mistake_at).toBeTruthy();
  });

  it('preserves recent mistake timestamp when a later review is correct', async () => {
    const { assignmentId, subjectId } = await seedReviewTarget(db);
    const lastMistakeAt = '2026-05-11T12:00:00.000Z';
    await db.runAsync(
      'INSERT INTO subject_progress (subject_id, level, srs_stage, subject_type, last_mistake_at) VALUES (?, ?, ?, ?, ?)',
      subjectId,
      1,
      3,
      'vocabulary',
      lastMistakeAt,
    );
    await db.runAsync('UPDATE assignments SET srs_stage = 3, available_at = ? WHERE id = ?', '2026-05-11T13:00:00.000Z', assignmentId);

    await queueReviewResult(db, { assignmentId, incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0 });

    const progress = await db.getFirstAsync<{ srs_stage: number; last_mistake_at: string | null }>(
      'SELECT srs_stage, last_mistake_at FROM subject_progress WHERE subject_id = ?',
      subjectId,
    );
    expect(progress).toMatchObject({ srs_stage: 4, last_mistake_at: lastMistakeAt });
  });

  it('keeps incorrect stage one reviews at stage one', async () => {
    const { assignmentId } = await seedReviewTarget(db);
    await db.runAsync('UPDATE assignments SET srs_stage = 1 WHERE id = ?', assignmentId);

    await queueReviewResult(db, { assignmentId, incorrectMeaningAnswers: 0, incorrectReadingAnswers: 1 });

    await expect(assignmentState(assignmentId)).resolves.toMatchObject({ srs_stage: 1 });
  });

  it('keeps correct stage nine reviews at stage nine', async () => {
    const { assignmentId } = await seedReviewTarget(db);
    await db.runAsync('UPDATE assignments SET srs_stage = 9 WHERE id = ?', assignmentId);

    await queueReviewResult(db, { assignmentId, incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0 });

    await expect(assignmentState(assignmentId)).resolves.toMatchObject({ srs_stage: 9 });
  });
});

// ── Lesson Start Round-Trip ──────────────────────────────────────────────────

describe('pending lesson start round-trip', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('queues a lesson start, marks started, and sends via API on sync', async () => {
    const { assignmentId } = await seedLessonTarget(db);

    await queueLessonStart(db, assignmentId);

    // Pending row should exist
    expect(await countPending(db, 'pending_progress')).toBe(1);

    // Assignment should be marked started
    const assignment = await db.getFirstAsync<{ started_at: string | null; srs_stage: number }>(
      'SELECT started_at, srs_stage FROM assignments WHERE id = ?', assignmentId,
    );
    expect(assignment?.started_at).not.toBeNull();
    expect(assignment?.srs_stage).toBe(1);

    // Flush via sync
    const mockApi = createMockApi();
    await runPendingSync({ db, client: mockApi as unknown as WaniKaniClient });

    // API should have been called
    const lessonCall = mockApi.calls.find((c) => c.method === 'startAssignment');
    expect(lessonCall).toBeDefined();

    // Pending row should be deleted
    expect(await countPending(db, 'pending_progress')).toBe(0);
  });
});

// ── Study Material Round-Trip ────────────────────────────────────────────────

describe('pending study material round-trip', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('queues a study material update, upserts locally, and sends via API on sync', async () => {
    const { subjectId } = await seedReviewTarget(db);

    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningSynonyms: ['tree-like'],
      meaningNote: 'Think of trees',
    });

    // Pending row should exist
    expect(await countPending(db, 'pending_study_materials')).toBe(1);

    // Local study material should be upserted
    const material = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM study_materials WHERE subject_id = ?', subjectId,
    );
    expect(material).toBeDefined();
    const parsed = JSON.parse(material!.payload) as { data: { meaning_synonyms: string[] } };
    expect(parsed.data.meaning_synonyms).toContain('tree-like');

    // Flush via sync
    const mockApi = createMockApi();
    await runPendingSync({ db, client: mockApi as unknown as WaniKaniClient });

    // API should have been called
    const smCall = mockApi.calls.find((c) => c.method === 'upsertStudyMaterial');
    expect(smCall).toBeDefined();
    const payload = smCall!.args[0] as { subjectId: number; meaningSynonyms: string[] };
    expect(payload.subjectId).toBe(subjectId);
    expect(payload.meaningSynonyms).toContain('tree-like');

    // Pending row should be deleted
    expect(await countPending(db, 'pending_study_materials')).toBe(0);
  });

  it('preserves the remote study material id for existing materials', async () => {
    const { subjectId } = await seedReviewTarget(db);
    await putStudyMaterials(db, [makeStudyMaterial(subjectId, { id: 700, meaning_synonyms: ['old'] })]);

    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningSynonyms: ['old', 'new'],
    });

    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM pending_study_materials WHERE subject_id = ?',
      subjectId,
    );
    const payload = JSON.parse(row!.payload) as { id?: number; meaningSynonyms: string[] };
    expect(payload.id).toBe(700);
    expect(payload.meaningSynonyms).toEqual(['old', 'new']);
  });

  it('preserves explicit null note clears in pending and local payloads', async () => {
    const { subjectId } = await seedReviewTarget(db);
    await putStudyMaterials(db, [makeStudyMaterial(subjectId, { id: 700, meaning_note: 'old note' })]);

    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningNote: null,
    });

    const pending = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM pending_study_materials WHERE subject_id = ?',
      subjectId,
    );
    const pendingPayload = JSON.parse(pending!.payload) as { meaningNote?: string | null };
    expect(pendingPayload).toHaveProperty('meaningNote', null);

    const material = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM study_materials WHERE subject_id = ?',
      subjectId,
    );
    const localPayload = JSON.parse(material!.payload) as { data: { meaning_note?: string | null } };
    expect(localPayload.data.meaning_note).toBeNull();
  });

  it('coalesces two offline edits for the same subject into one pending row', async () => {
    const { subjectId } = await seedReviewTarget(db);

    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningSynonyms: ['first'],
      meaningNote: 'old note',
    });
    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningSynonyms: ['second'],
      readingNote: 'new reading',
    });

    expect(await countPending(db, 'pending_study_materials')).toBe(1);
    const material = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM study_materials WHERE subject_id = ?',
      subjectId,
    );
    const parsed = JSON.parse(material!.payload) as { data: { meaning_synonyms: string[]; meaning_note: string; reading_note: string } };
    expect(parsed.data.meaning_synonyms).toEqual(['second']);
    expect(parsed.data.meaning_note).toBe('old note');
    expect(parsed.data.reading_note).toBe('new reading');
  });

  it('sends only durable pending fields and a positive remote id', async () => {
    const { subjectId } = await seedReviewTarget(db);
    await putStudyMaterials(db, [
      makeStudyMaterial(subjectId, {
        id: 700,
        meaning_synonyms: ['keep'],
        reading_note: 'keep reading',
      }),
    ]);

    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningNote: 'new note',
    });

    const mockApi = createMockApi();
    await runPendingSync({ db, client: mockApi as unknown as WaniKaniClient });

    const smCall = mockApi.calls.find((c) => c.method === 'upsertStudyMaterial');
    expect(smCall).toBeDefined();
    const payload = smCall!.args[0] as Record<string, unknown>;
    expect(payload).toEqual({ subjectId, id: 700, meaningNote: 'new note' });
    expect(Object.prototype.hasOwnProperty.call(payload, 'readingNote')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, 'meaningSynonyms')).toBe(false);
  });

  it('persists returned remote study material id over a local negative id', async () => {
    const { subjectId } = await seedReviewTarget(db);

    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningSynonyms: ['new'],
    });

    const mockApi = createMockApi({
      upsertStudyMaterial: async () => makeStudyMaterial(subjectId, { id: 123, meaning_synonyms: ['new'] }),
    });
    await runPendingSync({ db, client: mockApi as unknown as WaniKaniClient });

    const material = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM study_materials WHERE subject_id = ?',
      subjectId,
    );
    expect(material?.id).toBe(123);
    expect(await countPending(db, 'pending_study_materials')).toBe(0);
  });
});

// ── 422 Error Handling ───────────────────────────────────────────────────────

describe('422 stale write handling', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('discards pending review on 422 instead of retrying', async () => {
    const { assignmentId } = await seedReviewTarget(db);

    await queueReviewResult(db, {
      assignmentId,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
    });

    const mockApi = createMockApi({
      createReview: async () => {
        throw new WaniKaniApiError(422, 'Unprocessable Entity');
      },
    });

    // Should NOT throw — 422 is handled by discarding
    await runPendingSync({ db, client: mockApi as unknown as WaniKaniClient });

    // Pending row should be deleted (discarded as stale)
    expect(await countPending(db, 'pending_progress')).toBe(0);

    // Error should be logged
    const errors = await db.getAllAsync<{ message: string; context: string }>('SELECT message, context FROM error_log');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.context).toContain('discarded stale');
  });

  it('discards pending study material on 422', async () => {
    const { subjectId } = await seedReviewTarget(db);

    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningSynonyms: ['stale'],
    });

    const mockApi = createMockApi({
      upsertStudyMaterial: async () => {
        throw new WaniKaniApiError(422, 'Unprocessable Entity');
      },
    });

    await runPendingSync({ db, client: mockApi as unknown as WaniKaniClient });

    // Should be discarded
    expect(await countPending(db, 'pending_study_materials')).toBe(0);
  });
});

// ── Non-422 Error Handling ───────────────────────────────────────────────────

describe('non-422 error retry behavior', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('preserves pending row and increments attempts on network error', async () => {
    const { assignmentId } = await seedReviewTarget(db);

    await queueReviewResult(db, {
      assignmentId,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
    });

    const mockApi = createMockApi({
      createReview: async () => {
        throw new Error('Network timeout');
      },
    });

    // Should throw — non-422 errors abort the sync
    await expect(
      runPendingSync({ db, client: mockApi as unknown as WaniKaniClient }),
    ).rejects.toThrow('Network timeout');

    // Pending row should still exist with incremented attempts
    const row = await db.getFirstAsync<{ attempts: number; last_error: string }>(
      'SELECT attempts, last_error FROM pending_progress',
    );
    expect(row).toBeDefined();
    expect(row!.attempts).toBe(1);
    expect(row!.last_error).toContain('Network timeout');
  });

  it('preserves pending study material row on server error', async () => {
    const { subjectId } = await seedReviewTarget(db);

    await queueStudyMaterialUpdate(db, {
      subjectId,
      meaningNote: 'test',
    });

    const mockApi = createMockApi({
      upsertStudyMaterial: async () => {
        throw new Error('Internal Server Error');
      },
    });

    await expect(
      runPendingSync({ db, client: mockApi as unknown as WaniKaniClient }),
    ).rejects.toThrow();

    expect(await countPending(db, 'pending_study_materials')).toBe(1);
    const row = await db.getFirstAsync<{ attempts: number }>('SELECT attempts FROM pending_study_materials');
    expect(row!.attempts).toBe(1);
  });
});

// ── Mixed Pending Writes ─────────────────────────────────────────────────────

describe('mixed pending writes', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    resetIdCounter();
    db = await setupDb();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('flushes pending reviews, lesson starts, and study materials in order', async () => {
    const { assignmentId: reviewAssignmentId } = await seedReviewTarget(db);
    const { assignmentId: lessonAssignmentId, subjectId: lessonSubjectId } = await seedLessonTarget(db);

    // Also seed a subject+study_material for the review target so we can queue an update
    const { subjectId: reviewSubjectId } = await seedReviewTarget(db);

    await queueReviewResult(db, { assignmentId: reviewAssignmentId, incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0 });
    await queueLessonStart(db, lessonAssignmentId);
    await queueStudyMaterialUpdate(db, { subjectId: reviewSubjectId, meaningNote: 'updated' });

    const mockApi = createMockApi();
    await runPendingSync({ db, client: mockApi as unknown as WaniKaniClient });

    // All should be sent
    const methods = mockApi.calls.map((c) => c.method);
    expect(methods).toContain('createReview');
    expect(methods).toContain('startAssignment');
    expect(methods).toContain('upsertStudyMaterial');

    // Pending writes should flush in order: progress first, then study materials
    const reviewIdx = methods.indexOf('createReview');
    const lessonIdx = methods.indexOf('startAssignment');
    const materialIdx = methods.indexOf('upsertStudyMaterial');
    expect(reviewIdx).toBeLessThan(materialIdx);
    expect(lessonIdx).toBeLessThan(materialIdx);

    // All pending rows should be cleared
    expect(await countPending(db, 'pending_progress')).toBe(0);
    expect(await countPending(db, 'pending_study_materials')).toBe(0);
  });
});
