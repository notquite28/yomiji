import { AnswerCheckResult, TaskType } from './answerChecker';
import { ReviewItem } from '../study/reviewSession';

export function feedbackTitle(result: AnswerCheckResult) {
  switch (result.kind) {
    case 'precise':
      return 'Correct';
    case 'imprecise':
      return 'Close enough';
    case 'containsInvalidCharacters':
      return 'Invalid characters';
    case 'isReadingButWantMeaning':
      return 'That is the reading';
    case 'otherKanjiReading':
      return 'That is another reading';
    case 'mismatchingOkurigana':
      return 'Check the okurigana';
    case 'incorrect':
      return 'Incorrect';
  }
}

export function correctAnswerText(item: ReviewItem, taskType: TaskType) {
  if (taskType === 'reading') {
    return `Accepted readings: ${item.subject.readings?.filter((reading) => reading.acceptedAnswer !== false).map((reading) => reading.reading).join(', ') || 'none'}`;
  }
  return `Accepted meanings: ${item.subject.meanings.filter((meaning) => meaning.acceptedAnswer !== false && meaning.type !== 'blacklist').map((meaning) => meaning.meaning).join(', ')}`;
}
