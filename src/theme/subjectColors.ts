import { AppColors } from './palette';

export function colorForSubjectType(colors: AppColors, subjectType: string) {
  switch (subjectType) {
    case 'radical':
      return colors.radical;
    case 'kanji':
      return colors.kanji;
    case 'vocabulary':
    case 'kana_vocabulary':
      return colors.vocabulary;
    default:
      return colors.vocabulary;
  }
}
