import { SubjectAnswerData } from '../answers/answerChecker';
import { AppDatabase } from '../db/database';
import {
  getCharacterImageUrl,
  getImageOnlyRadicals,
  isCharacterImageSvg,
  parseSubjectResource,
  RadicalImageRow,
} from '../db/subjectRepository';

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
  const rows = await getImageOnlyRadicals(db, limit);
  return rows.map(rowToPreviewItem).filter((item) => item.imageUrl);
}

function rowToPreviewItem(row: RadicalImageRow): RadicalImagePreviewItem {
  const subject = parseSubjectResource(row.payload);
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
