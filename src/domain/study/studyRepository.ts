import { AssignmentData, StudyMaterialData } from '../api/types';
import { SubjectAnswerData, StudyMaterialAnswerData } from '../answers/answerChecker';
import { calculateLeechScore } from '../dashboard/dashboardRepository';
import { applyLocalReviewResult, markAssignmentStarted } from '../db/assignmentRepository';
import { AppDatabase } from '../db/database';
import { findBySubjectId, upsertWithSynonyms } from '../db/studyMaterialRepository';
import {
  normalizeSubjectType,
  parseSubjectPayload,
} from '../db/subjectRepository';
import { StudyMaterialPayload } from '../api/types';
import { AppSettings, SubjectType } from '../settings/settings';

type AssignmentResource = {
  id: number;
  data: AssignmentData;
};

type StudyMaterialResource = {
  id: number;
  data: StudyMaterialData;
};

type StudyQueueRow = {
  assignment_id: number;
  subject_id: number;
  subject_type: string;
  level: number | null;
  srs_stage: number;
  assignment_payload: string;
  subject_payload: string;
  study_material_payload: string | null;
  available_at: string | null;
};

export type StudyQueueItem = {
  assignmentId: number;
  subjectId: number;
  subjectType: string;
  level?: number;
  srsStage: number;
  subject: SubjectAnswerData;
  studyMaterials?: StudyMaterialAnswerData;
  availableAt?: string;
};

export type ReviewResult = {
  assignmentId: number;
  incorrectMeaningAnswers: number;
  incorrectReadingAnswers: number;
};

export async function getReviewQueue(db: AppDatabase, limit = 100) {
  const now = new Date().toISOString();
  const rows = await db.getAllAsync<StudyQueueRow>(
    `SELECT
       assignments.id AS assignment_id,
       assignments.subject_id,
       assignments.subject_type,
       assignments.level,
       assignments.srs_stage,
       assignments.available_at,
       assignments.payload AS assignment_payload,
       subjects.payload AS subject_payload,
       study_materials.payload AS study_material_payload
     FROM assignments
     INNER JOIN subjects ON subjects.id = assignments.subject_id
     LEFT JOIN study_materials ON study_materials.subject_id = assignments.subject_id
     WHERE assignments.srs_stage BETWEEN 1 AND 8
       AND assignments.available_at IS NOT NULL
       AND assignments.available_at <= ?
     ORDER BY assignments.available_at ASC, assignments.level ASC, assignments.id ASC
     LIMIT ?`,
    now,
    limit,
  );

  return rows.map(rowToStudyQueueItem).filter(hasPrompt);
}

export async function getRecentMistakePracticeQueue(db: AppDatabase, limit = 100) {
  const cutoff = recentMistakeCutoff().toISOString();
  const rows = await db.getAllAsync<StudyQueueRow>(
    `SELECT
       assignments.id AS assignment_id,
       assignments.subject_id,
       assignments.subject_type,
       assignments.level,
       assignments.srs_stage,
       assignments.available_at,
       assignments.payload AS assignment_payload,
       subjects.payload AS subject_payload,
       study_materials.payload AS study_material_payload
     FROM subject_progress
     INNER JOIN assignments ON assignments.subject_id = subject_progress.subject_id
     INNER JOIN subjects ON subjects.id = assignments.subject_id
     LEFT JOIN study_materials ON study_materials.subject_id = assignments.subject_id
     WHERE subject_progress.last_mistake_at IS NOT NULL
       AND subject_progress.last_mistake_at >= ?
       AND assignments.srs_stage BETWEEN 1 AND 8
     ORDER BY subject_progress.last_mistake_at DESC, assignments.id ASC
     LIMIT ?`,
    cutoff,
    limit,
  );

  return rows.map(rowToStudyQueueItem).filter(hasPrompt);
}

export async function getLeechPracticeQueue(db: AppDatabase, options?: { apprenticeOnly?: boolean; threshold?: number; limit?: number }) {
  const apprenticeOnly = options?.apprenticeOnly ?? false;
  const threshold = options?.threshold ?? 1;
  const limit = options?.limit ?? 100;

  const srsFilter = apprenticeOnly ? 'AND a.srs_stage BETWEEN 1 AND 4' : '';
  type LeechRow = StudyQueueRow & {
    meaning_incorrect: number;
    meaning_correct: number;
    reading_incorrect: number;
    reading_correct: number;
  };

  const rows = await db.getAllAsync<LeechRow>(
    `SELECT
       a.id AS assignment_id,
       a.subject_id,
       a.subject_type,
       a.level,
       a.srs_stage,
       a.available_at,
       a.payload AS assignment_payload,
       s.payload AS subject_payload,
       sm.payload AS study_material_payload,
       CAST(COALESCE(json_extract(rs.payload, '$.data.meaning_incorrect'), 0) AS INTEGER) AS meaning_incorrect,
       CAST(COALESCE(json_extract(rs.payload, '$.data.meaning_correct'), 0) AS INTEGER) AS meaning_correct,
       CAST(COALESCE(json_extract(rs.payload, '$.data.reading_incorrect'), 0) AS INTEGER) AS reading_incorrect,
       CAST(COALESCE(json_extract(rs.payload, '$.data.reading_correct'), 0) AS INTEGER) AS reading_correct
     FROM review_stats rs
     JOIN subjects s ON s.id = rs.subject_id
     JOIN assignments a ON a.subject_id = rs.subject_id
     LEFT JOIN study_materials sm ON sm.subject_id = a.subject_id
     WHERE (COALESCE(json_extract(rs.payload, '$.data.meaning_incorrect'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.reading_incorrect'), 0)) > 0
       ${srsFilter}
       AND a.srs_stage BETWEEN 1 AND 9
     ORDER BY (COALESCE(json_extract(rs.payload, '$.data.meaning_incorrect'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.reading_incorrect'), 0)) * 1.0
       / NULLIF(
         COALESCE(json_extract(rs.payload, '$.data.meaning_correct'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.meaning_incorrect'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.reading_correct'), 0)
         + COALESCE(json_extract(rs.payload, '$.data.reading_incorrect'), 0), 0) DESC
     LIMIT ?`,
    limit,
  );

  return rows
    .map((row) => ({
      item: rowToStudyQueueItem(row),
      score: calculateLeechScore(
        row.meaning_incorrect + row.reading_incorrect,
        row.meaning_correct + row.reading_correct,
      ),
    }))
    .filter(({ item }) => hasPrompt(item))
    .filter(({ score }) => threshold <= 0 || score >= threshold)
    .map(({ item }) => item);
}

export async function getBurnedItemPracticeQueue(db: AppDatabase, limit = 100) {
  const rows = await db.getAllAsync<StudyQueueRow>(
    `SELECT
       a.id AS assignment_id,
       a.subject_id,
       a.subject_type,
       a.level,
       a.srs_stage,
       a.available_at,
       a.payload AS assignment_payload,
       s.payload AS subject_payload,
       sm.payload AS study_material_payload
     FROM assignments a
     INNER JOIN subjects s ON s.id = a.subject_id
     LEFT JOIN study_materials sm ON sm.subject_id = a.subject_id
     WHERE a.srs_stage = 9
     ORDER BY a.level ASC, a.subject_type ASC, a.subject_id ASC
     LIMIT ?`,
    limit,
  );

  return rows.map(rowToStudyQueueItem).filter(hasPrompt);
}

export async function getLessonQueue(db: AppDatabase, settings: AppSettings, limit = 100) {
  const rows = await db.getAllAsync<StudyQueueRow>(
    `SELECT
       assignments.id AS assignment_id,
       assignments.subject_id,
       assignments.subject_type,
       assignments.level,
       assignments.srs_stage,
       assignments.available_at,
       assignments.payload AS assignment_payload,
       subjects.payload AS subject_payload,
       study_materials.payload AS study_material_payload
     FROM assignments
     INNER JOIN subjects ON subjects.id = assignments.subject_id
     LEFT JOIN study_materials ON study_materials.subject_id = assignments.subject_id
     WHERE assignments.srs_stage = 0
       AND assignments.started_at IS NULL`,
  );

  let items = rows
    .map((row) => ({ item: rowToStudyQueueItem(row), row }))
    .filter(({ item, row }) => hasPrompt(item) && !isLessonFiltered(item, isKanaOnly(row), isHidden(row), settings));

  if (settings.interleaveLessons) {
    shuffleArray(items);
  }

  items = sortLessonItems(items, settings);

  return items.slice(0, limit).map(({ item }) => item);
}

export async function getLessonItemsByIds(db: AppDatabase, settings: AppSettings, subjectIds: Set<number>) {
  const rows = await db.getAllAsync<StudyQueueRow>(
    `SELECT
       assignments.id AS assignment_id,
       assignments.subject_id,
       assignments.subject_type,
       assignments.level,
       assignments.srs_stage,
       assignments.available_at,
       assignments.payload AS assignment_payload,
       subjects.payload AS subject_payload,
       study_materials.payload AS study_material_payload
     FROM assignments
     INNER JOIN subjects ON subjects.id = assignments.subject_id
     LEFT JOIN study_materials ON study_materials.subject_id = assignments.subject_id
     WHERE assignments.srs_stage = 0
       AND assignments.started_at IS NULL`,
  );

  return rows
    .map((row) => ({ item: rowToStudyQueueItem(row), row }))
    .filter(({ item, row }) => hasPrompt(item) && !isLessonFiltered(item, isKanaOnly(row), isHidden(row), settings) && subjectIds.has(item.subjectId))
    .map(({ item }) => item);
}

export function isLessonFiltered(item: StudyQueueItem, isKanaOnlySubject: boolean, isHiddenSubject: boolean, settings: AppSettings): boolean {
  if (!settings.showKanaOnlyVocab && item.subjectType === 'vocabulary' && isKanaOnlySubject) {
    return true;
  }
  if (item.subjectType === 'vocabulary' && isHiddenSubject) {
    return true;
  }
  return false;
}

export function sortLessonItems<T extends { item: StudyQueueItem }>(items: T[], settings: AppSettings): T[] {
  const typeOrder = new Map(settings.lessonOrder.map((type, idx) => [type, idx]));

  items.sort((a, b) => {
    const levelA = a.item.level ?? 0;
    const levelB = b.item.level ?? 0;
    if (levelA !== levelB) {
      return settings.prioritizeCurrentLevel ? levelB - levelA : levelA - levelB;
    }
    if (settings.interleaveLessons) {
      return 0;
    }
    const typeIdxA = typeOrder.get(a.item.subjectType as SubjectType) ?? 0;
    const typeIdxB = typeOrder.get(b.item.subjectType as SubjectType) ?? 0;
    if (typeIdxA !== typeIdxB) {
      return typeIdxA - typeIdxB;
    }
    return a.item.subjectId - b.item.subjectId;
  });

  return items;
}

export function chunkLessonItems<T>(items: T[], batchSize: number): T[][] {
  const size = Math.max(1, Math.floor(batchSize));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function queueReviewResult(db: AppDatabase, result: ReviewResult) {
  const createdAt = new Date().toISOString();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    await db.runAsync(
      `INSERT INTO pending_progress (id, kind, payload, created_at)
       VALUES (?, 'review', ?, ?)`,
      `review:${result.assignmentId}:${Date.now()}`,
      JSON.stringify({
        assignmentId: result.assignmentId,
        incorrectMeaningAnswers: result.incorrectMeaningAnswers,
        incorrectReadingAnswers: result.incorrectReadingAnswers,
        createdAt,
      }),
      createdAt,
    );
    await applyLocalReviewResult(
      db,
      result.assignmentId,
      result.incorrectMeaningAnswers,
      result.incorrectReadingAnswers,
      createdAt,
    );
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}


export function recentMistakeCutoff(now = new Date()) {
  return new Date(now.getTime() - 24 * 3600_000);
}

export async function queueLessonStart(db: AppDatabase, assignmentId: number) {
  const startedAt = new Date().toISOString();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    await db.runAsync(
      `INSERT INTO pending_progress (id, kind, payload, created_at)
       VALUES (?, 'lesson-start', ?, ?)`,
      `lesson-start:${assignmentId}:${Date.now()}`,
      JSON.stringify({ assignmentId, startedAt }),
      startedAt,
    );
    await markAssignmentStarted(db, assignmentId, startedAt);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

export async function queueStudyMaterialUpdate(db: AppDatabase, payload: StudyMaterialPayload) {
  const createdAt = new Date().toISOString();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    const existingPending = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM pending_study_materials WHERE subject_id = ?',
      payload.subjectId,
    );
    const pendingPayload = existingPending ? JSON.parse(existingPending.payload) as StudyMaterialPayload : undefined;
    const existing = await findBySubjectId(db, payload.subjectId);
    const localId = existing && existing.id > 0 ? existing.id : undefined;
    const payloadId = payload.id && payload.id > 0 ? payload.id : undefined;
    const pendingId = pendingPayload?.id && pendingPayload.id > 0 ? pendingPayload.id : undefined;
    const remoteId = payloadId ?? pendingId ?? localId;

    const queuedPayload: StudyMaterialPayload = { subjectId: payload.subjectId };
    const meaningSynonyms = firstDefined(payload.meaningSynonyms, pendingPayload?.meaningSynonyms);
    const meaningNote = firstDefined(payload.meaningNote, pendingPayload?.meaningNote);
    const readingNote = firstDefined(payload.readingNote, pendingPayload?.readingNote);
    const hasEditableField = meaningSynonyms !== undefined || meaningNote !== undefined || readingNote !== undefined;

    if (!hasEditableField && (!existingPending || !remoteId)) {
      await db.execAsync('COMMIT;');
      return;
    }

    if (meaningSynonyms !== undefined) queuedPayload.meaningSynonyms = meaningSynonyms;
    if (meaningNote !== undefined) queuedPayload.meaningNote = meaningNote;
    if (readingNote !== undefined) queuedPayload.readingNote = readingNote;
    if (remoteId) queuedPayload.id = remoteId;

    await db.runAsync(
      `INSERT INTO pending_study_materials (id, subject_id, payload, created_at, attempts, last_error)
       VALUES (?, ?, ?, ?, 0, NULL)
       ON CONFLICT(subject_id) DO UPDATE SET
         payload = excluded.payload,
         created_at = excluded.created_at,
         attempts = 0,
         last_error = NULL`,
      `study-material:${queuedPayload.subjectId}`,
      queuedPayload.subjectId,
      JSON.stringify(queuedPayload),
      createdAt,
    );
    if (hasEditableField) {
      await upsertWithSynonyms(db, payload);
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

function rowToStudyQueueItem(row: StudyQueueRow): StudyQueueItem {
  const assignment = JSON.parse(row.assignment_payload) as AssignmentResource;
  const studyMaterial = row.study_material_payload ? (JSON.parse(row.study_material_payload) as StudyMaterialResource) : undefined;
  const parsed = parseSubjectPayload(row.subject_id, row.subject_payload);
  const subjectType = normalizeSubjectType(row.subject_type || assignment.data.subject_type);

  return {
    assignmentId: row.assignment_id,
    subjectId: row.subject_id,
    subjectType,
    level: row.level ?? undefined,
    srsStage: row.srs_stage,
    subject: parsed,
    studyMaterials: studyMaterial
      ? {
          meaningSynonyms: studyMaterial.data.meaning_synonyms ?? [],
        }
      : undefined,
    availableAt: row.available_at ?? undefined,
  };
}

function hasPrompt(item: StudyQueueItem) {
  return Boolean(item.subject.japanese || item.subject.characterImageUrl);
}

function isKanaOnly(row: StudyQueueRow): boolean {
  const subject = JSON.parse(row.subject_payload) as { object?: string };
  return subject.object === 'kana_vocabulary';
}

function isHidden(row: StudyQueueRow): boolean {
  if (!row.study_material_payload) return false;
  const studyMaterial = JSON.parse(row.study_material_payload) as { data?: { hidden?: boolean } };
  return studyMaterial.data?.hidden === true;
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i]!;
    array[i] = array[j]!;
    array[j] = temp;
  }
}

export { getCharacterImageUrl, isCharacterImageSvg } from '../db/subjectRepository';
