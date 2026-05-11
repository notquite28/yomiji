import { SubjectData } from '../api/types';
import { SubjectAnswerData } from '../answers/answerChecker';
import { AppDatabase } from '../db/database';
import { getCharacterImageUrl, isCharacterImageSvg } from '../study/studyRepository';

type SubjectResource = {
  id: number;
  object: string;
  data: SubjectData;
};

type RadicalImageRow = {
  id: number;
  level: number;
  payload: string;
};

export type RadicalImagePreviewItem = {
  id: number;
  level: number;
  slug?: string;
  imageUrl?: string;
  imageIsSvg: boolean;
  characterImages: Array<{ url: string; content_type?: string; style_name?: string; color?: string }>;
  subject: SubjectAnswerData;
};

export async function getRadicalImagePreviewItems(db: AppDatabase, limit = 100) {
  const rows = await db.getAllAsync<RadicalImageRow>(
    `SELECT id, level, payload
     FROM subjects
     WHERE subject_type = 'radical'
       AND (japanese IS NULL OR japanese = '')
     ORDER BY level ASC, id ASC
     LIMIT ?`,
    limit,
  );

  return rows.map(rowToPreviewItem).filter((item) => item.imageUrl);
}

function rowToPreviewItem(row: RadicalImageRow): RadicalImagePreviewItem {
  const subject = JSON.parse(row.payload) as SubjectResource;
  const imageUrl = getCharacterImageUrl(subject.data);
  const images = subject.data.character_images ?? [];
  return {
    id: row.id,
    level: row.level,
    slug: subject.data.slug,
    imageUrl,
    imageIsSvg: isCharacterImageSvg(subject.data),
    characterImages: images.map((img) => ({
      url: img.url,
      content_type: img.content_type,
      style_name: img.metadata?.style_name,
      color: img.metadata?.color,
    })),
    subject: {
      id: row.id,
      type: 'radical',
      japanese: subject.data.characters ?? '',
      characterImageUrl: imageUrl,
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
    },
  };
}
