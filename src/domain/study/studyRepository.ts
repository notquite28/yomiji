import { AssignmentData, StudyMaterialData } from '../api/types';
import { SubjectAnswerData, StudyMaterialAnswerData } from '../answers/answerChecker';
import { clearAssignmentAvailableAt, markAssignmentStarted } from '../db/assignmentRepository';
import { AppDatabase } from '../db/database';
import { upsertWithSynonyms } from '../db/studyMaterialRepository';
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
    if (result.incorrectMeaningAnswers > 0 || result.incorrectReadingAnswers > 0) {
      await markRecentMistake(db, result.assignmentId, createdAt);
    }
    await clearAssignmentAvailableAt(db, result.assignmentId);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

async function markRecentMistake(db: AppDatabase, assignmentId: number, mistakeAt: string) {
  const row = await db.getFirstAsync<{
    subject_id: number;
    level: number | null;
    srs_stage: number;
    subject_type: string | null;
  }>(
    `SELECT subject_id, level, srs_stage, subject_type
     FROM assignments
     WHERE id = ?`,
    assignmentId,
  );

  if (!row) {
    return;
  }

  await db.runAsync(
    `INSERT INTO subject_progress (subject_id, level, srs_stage, subject_type, last_mistake_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(subject_id) DO UPDATE SET
       level = excluded.level,
       srs_stage = excluded.srs_stage,
       subject_type = excluded.subject_type,
       last_mistake_at = excluded.last_mistake_at`,
    row.subject_id,
    row.level,
    row.srs_stage,
    row.subject_type,
    mistakeAt,
  );
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

export async function queueStudyMaterialUpdate(db: AppDatabase, payload: StudyMaterialPayload) {
  const createdAt = new Date().toISOString();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    await db.runAsync(
      `INSERT INTO pending_study_materials (id, subject_id, payload, created_at)
       VALUES (?, ?, ?, ?)`,
      `study-material:${payload.subjectId}:${Date.now()}`,
      payload.subjectId,
      JSON.stringify(payload),
      createdAt,
    );
    await upsertWithSynonyms(db, payload);
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

export async function getSubjectsByIds(db: AppDatabase, ids: number[]): Promise<Map<number, SubjectAnswerData>> {
  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ id: number; payload: string }>(
    `SELECT id, payload FROM subjects WHERE id IN (${placeholders})`,
    ...ids,
  );

  const result = new Map<number, SubjectAnswerData>();
  for (const row of rows) {
    const parsed = parseSubjectPayload(row.id, row.payload);
    if (parsed) result.set(row.id, parsed);
  }
  return result;
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
