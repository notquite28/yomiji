import { SubjectData } from '../api/types';
import { SubjectAnswerData } from '../answers/answerChecker';
import { AppDatabase } from './database';

type SubjectResource = {
  id: number;
  object: string;
  data: SubjectData;
};

export async function getSubjectById(db: AppDatabase, id: number): Promise<SubjectAnswerData | null> {
  const row = await db.getFirstAsync<{ id: number; payload: string }>(
    'SELECT id, payload FROM subjects WHERE id = ?',
    id,
  );
  if (!row) return null;
  return parseSubjectPayload(row.id, row.payload);
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

export async function countSubjects(db: AppDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: number }>('SELECT COUNT(*) AS value FROM subjects');
  return row?.value ?? 0;
}

export type RadicalImageRow = {
  id: number;
  level: number;
  payload: string;
};

export async function getImageOnlyRadicals(db: AppDatabase, limit = 100): Promise<RadicalImageRow[]> {
  return db.getAllAsync<RadicalImageRow>(
    `SELECT id, level, payload
     FROM subjects
     WHERE subject_type = 'radical'
       AND (japanese IS NULL OR japanese = '')
     ORDER BY level ASC, id ASC
     LIMIT ?`,
    limit,
  );
}

export function parseSubjectPayload(id: number, payload: string): SubjectAnswerData {
  const resource = JSON.parse(payload) as SubjectResource;
  const subjectType = normalizeSubjectType(resource.object);
  return {
    id,
    type: subjectType,
    japanese: resource.data.characters ?? '',
    characterImageUrl: getCharacterImageUrl(resource.data),
    characterImageIsSvg: isCharacterImageSvg(resource.data),
    meanings: [
      ...(resource.data.meanings ?? []).map((meaning) => ({
        meaning: meaning.meaning,
        type: meaning.primary ? 'primary' as const : 'secondary' as const,
        acceptedAnswer: meaning.accepted_answer ?? true,
      })),
      ...(resource.data.auxiliary_meanings ?? []).map((meaning) => ({
        meaning: meaning.meaning,
        type: meaning.type === 'blacklist' ? 'blacklist' as const : 'auxiliary_whitelist' as const,
        acceptedAnswer: meaning.type !== 'blacklist',
      })),
    ],
    readings: (resource.data.readings ?? []).map((reading) => ({
      reading: reading.reading,
      primary: reading.primary ?? reading.accepted_answer ?? false,
      acceptedAnswer: reading.accepted_answer ?? reading.primary ?? true,
    })),
    componentSubjectIds: resource.data.component_subject_ids ?? [],
    meaningMnemonic: resource.data.meaning_mnemonic,
    meaningHint: resource.data.meaning_hint,
    readingMnemonic: resource.data.reading_mnemonic,
    readingHint: resource.data.reading_hint,
    contextSentences: resource.data.context_sentences,
    partsOfSpeech: resource.data.parts_of_speech,
    amalgamationSubjectIds: resource.data.amalgamation_subject_ids ?? [],
  };
}

export function parseSubjectResource(payload: string): SubjectResource {
  return JSON.parse(payload) as SubjectResource;
}

export function normalizeSubjectType(subjectType: string): string {
  return subjectType === 'kana_vocabulary' ? 'vocabulary' : subjectType;
}

export function getCharacterImageUrl(subject: SubjectData): string | undefined {
  const images = subject.character_images ?? [];

  const svgWithInlineStyles = images.find(
    (image) => image.content_type === 'image/svg+xml' && image.metadata?.inline_styles === true,
  );
  if (svgWithInlineStyles?.url) return svgWithInlineStyles.url;

  const pngs = images.filter((image) => image.content_type === 'image/png');
  return (
    pngs.find((image) => image.metadata?.style_name === 'original')?.url ??
    pngs[0]?.url ??
    images.find((image) => image.content_type === 'image/svg+xml')?.url
  );
}

export function isCharacterImageSvg(subject: SubjectData): boolean {
  const images = subject.character_images ?? [];
  const url = getCharacterImageUrl(subject);
  if (!url) return false;
  return images.some((image) => image.url === url && image.content_type === 'image/svg+xml');
}
