import { AssignmentData, StudyMaterialData, SubjectData } from '../api/types';
import { SubjectAnswerData, StudyMaterialAnswerData } from '../answers/answerChecker';
import { AppDatabase } from '../db/database';
import { StudyMaterialPayload } from '../api/types';
import { AppSettings, SubjectType } from '../settings/settings';

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
    .filter(({ item, row }) => hasPrompt(item) && !isFiltered(item, row, settings));

  if (settings.interleaveLessons) {
    shuffleArray(items);
  }

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
    .filter(({ item, row }) => hasPrompt(item) && !isFiltered(item, row, settings) && subjectIds.has(item.subjectId))
    .map(({ item }) => item);
}

function isFiltered(item: StudyQueueItem, row: StudyQueueRow, settings: AppSettings): boolean {
  if (!settings.showKanaOnlyVocab && item.subjectType === 'vocabulary' && isKanaOnly(row)) {
    return true;
  }
  if (item.subjectType === 'vocabulary' && isHidden(row)) {
    return true;
  }
  return false;
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

    const existing = await db.getFirstAsync<{ id: number; payload: string }>(
      'SELECT id, payload FROM study_materials WHERE subject_id = ?',
      payload.subjectId,
    );

    if (existing) {
      const parsed = JSON.parse(existing.payload) as { data: Record<string, unknown> };
      if (payload.meaningSynonyms !== undefined) {
        parsed.data.meaning_synonyms = payload.meaningSynonyms;
      }
      await db.runAsync(
        'UPDATE study_materials SET payload = ? WHERE id = ?',
        JSON.stringify(parsed),
        existing.id,
      );
    } else {
      const localId = -payload.subjectId;
      await db.runAsync(
        `INSERT INTO study_materials (id, subject_id, payload, updated_at)
         VALUES (?, ?, ?, ?)`,
        localId,
        payload.subjectId,
        JSON.stringify({
          id: localId,
          object: 'study_material',
          data: {
            subject_id: payload.subjectId,
            meaning_synonyms: payload.meaningSynonyms ?? [],
            meaning_note: payload.meaningNote ?? '',
            reading_note: payload.readingNote ?? '',
          },
        }),
        createdAt,
      );
    }

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
      characterImageIsSvg: isCharacterImageSvg(subject.data),
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
      meaningMnemonic: subject.data.meaning_mnemonic,
      meaningHint: subject.data.meaning_hint,
      readingMnemonic: subject.data.reading_mnemonic,
      readingHint: subject.data.reading_hint,
      contextSentences: subject.data.context_sentences,
      partsOfSpeech: subject.data.parts_of_speech,
      amalgamationSubjectIds: subject.data.amalgamation_subject_ids ?? [],
    },
    studyMaterials: studyMaterial
      ? {
          meaningSynonyms: studyMaterial.data.meaning_synonyms ?? [],
        }
      : undefined,
    availableAt: row.available_at ?? undefined,
  };
}

export async function getSubjectsByIds(db: AppDatabase, ids: number[]): Promise<Map<number, SubjectAnswerData>> {
  if (ids.length === 0) {
    return new Map();
  }

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ id: number; payload: string }>(
    `SELECT id, payload FROM subjects WHERE id IN (${placeholders})`,
    ...ids,
  );

  const result = new Map<number, SubjectAnswerData>();
  for (const row of rows) {
    const resource = JSON.parse(row.payload) as SubjectResource;
    const subjectType = normalizeSubjectType(resource.object);
    result.set(row.id, {
      id: row.id,
      type: subjectType,
      japanese: resource.data.characters ?? '',
      characterImageUrl: getCharacterImageUrl(resource.data),
      characterImageIsSvg: isCharacterImageSvg(resource.data),
      meanings: [
        ...(resource.data.meanings ?? []).map((meaning) => ({
          meaning: meaning.meaning,
          type: meaning.primary ? 'primary' : 'secondary',
          acceptedAnswer: meaning.accepted_answer ?? true,
        })),
        ...(resource.data.auxiliary_meanings ?? []).map((meaning) => ({
          meaning: meaning.meaning,
          type: meaning.type === 'blacklist' ? 'blacklist' : 'auxiliary_whitelist',
          acceptedAnswer: meaning.type !== 'blacklist',
        })),
      ],
      readings: (resource.data.readings ?? []).map((reading) => ({
        reading: reading.reading,
        primary: reading.primary ?? reading.accepted_answer ?? false,
        acceptedAnswer: reading.accepted_answer ?? reading.primary ?? true,
      })),
    });
  }
  return result;
}

function normalizeSubjectType(subjectType: string) {
  return subjectType === 'kana_vocabulary' ? 'vocabulary' : subjectType;
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

export function getCharacterImageUrl(subject: SubjectData) {
  const images = subject.character_images ?? [];

  const svgWithInlineStyles = images.find(
    (image) => image.content_type === 'image/svg+xml' && image.metadata?.inline_styles === true,
  );
  if (svgWithInlineStyles?.url) {
    return svgWithInlineStyles.url;
  }

  const pngs = images.filter((image) => image.content_type === 'image/png');
  return (
    pngs.find((image) => image.metadata?.style_name === 'original')?.url ??
    pngs[0]?.url ??
    images.find((image) => image.content_type === 'image/svg+xml')?.url
  );
}

function isDarkImageColor(color?: string) {
  if (!color) {
    return false;
  }
  const normalized = color.replace('#', '').toLowerCase();
  if (normalized.length !== 6) {
    return false;
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue)) {
    return false;
  }
  return red * 0.299 + green * 0.587 + blue * 0.114 < 180;
}

export function isCharacterImageSvg(subject: SubjectData) {
  const images = subject.character_images ?? [];
  const url = getCharacterImageUrl(subject);
  if (!url) {
    return false;
  }
  return images.some(
    (image) => image.url === url && image.content_type === 'image/svg+xml',
  );
}
