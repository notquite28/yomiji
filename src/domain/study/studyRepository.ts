import { AssignmentData, StudyMaterialData, SubjectData } from '../api/types';
import { SubjectAnswerData, StudyMaterialAnswerData } from '../answers/answerChecker';
import { AppDatabase } from '../db/database';

type AssignmentResource = {
  id: number;
  data: AssignmentData;
};

type SubjectResource = {
  id: number;
  object: string;
  data: SubjectData;
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
};

export type StudyQueueItem = {
  assignmentId: number;
  subjectId: number;
  subjectType: string;
  level?: number;
  srsStage: number;
  subject: SubjectAnswerData;
  studyMaterials?: StudyMaterialAnswerData;
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

export async function getLessonQueue(db: AppDatabase, limit = 100) {
  const rows = await db.getAllAsync<StudyQueueRow>(
    `SELECT
       assignments.id AS assignment_id,
       assignments.subject_id,
       assignments.subject_type,
       assignments.level,
       assignments.srs_stage,
       assignments.payload AS assignment_payload,
       subjects.payload AS subject_payload,
       study_materials.payload AS study_material_payload
     FROM assignments
     INNER JOIN subjects ON subjects.id = assignments.subject_id
     LEFT JOIN study_materials ON study_materials.subject_id = assignments.subject_id
     WHERE assignments.srs_stage = 0
       AND assignments.started_at IS NULL
     ORDER BY assignments.level ASC, assignments.subject_type ASC, assignments.id ASC
     LIMIT ?`,
    limit,
  );

  return rows.map(rowToStudyQueueItem).filter(hasPrompt);
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
    await db.runAsync('UPDATE assignments SET available_at = NULL WHERE id = ?', result.assignmentId);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
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
    await db.runAsync('UPDATE assignments SET started_at = ?, srs_stage = 1 WHERE id = ?', startedAt, assignmentId);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

function rowToStudyQueueItem(row: StudyQueueRow): StudyQueueItem {
  const assignment = JSON.parse(row.assignment_payload) as AssignmentResource;
  const subject = JSON.parse(row.subject_payload) as SubjectResource;
  const studyMaterial = row.study_material_payload ? (JSON.parse(row.study_material_payload) as StudyMaterialResource) : undefined;
  const subjectType = normalizeSubjectType(subject.object || row.subject_type || assignment.data.subject_type);

  return {
    assignmentId: row.assignment_id,
    subjectId: row.subject_id,
    subjectType,
    level: row.level ?? subject.data.level,
    srsStage: row.srs_stage,
    subject: {
      id: row.subject_id,
      type: subjectType,
      japanese: subject.data.characters ?? '',
      characterImageUrl: getCharacterImageUrl(subject.data),
      meanings: [
        ...(subject.data.meanings ?? []).map((meaning) => ({
          meaning: meaning.meaning,
          type: meaning.primary ? 'primary' : 'secondary',
          acceptedAnswer: meaning.accepted_answer ?? true,
        })),
        ...(subject.data.auxiliary_meanings ?? []).map((meaning) => ({
          meaning: meaning.meaning,
          type: meaning.type === 'blacklist' ? 'blacklist' : 'auxiliary_whitelist',
          acceptedAnswer: meaning.type !== 'blacklist',
        })),
      ],
      readings: (subject.data.readings ?? []).map((reading) => ({
        reading: reading.reading,
        primary: reading.primary ?? reading.accepted_answer ?? false,
        acceptedAnswer: reading.accepted_answer ?? reading.primary ?? true,
      })),
      componentSubjectIds: subject.data.component_subject_ids ?? [],
    },
    studyMaterials: studyMaterial
      ? {
          meaningSynonyms: studyMaterial.data.meaning_synonyms ?? [],
        }
      : undefined,
  };
}

function normalizeSubjectType(subjectType: string) {
  return subjectType === 'kana_vocabulary' ? 'vocabulary' : subjectType;
}

function hasPrompt(item: StudyQueueItem) {
  return Boolean(item.subject.japanese || item.subject.characterImageUrl);
}

function getCharacterImageUrl(subject: SubjectData) {
  const images = subject.character_images ?? [];
  return images.find((image) => image.content_type === 'image/png')?.url ?? images.find((image) => image.content_type !== 'image/svg+xml')?.url;
}
