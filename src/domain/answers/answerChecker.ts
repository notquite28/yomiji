/** Discriminates whether the answer is being checked against a reading or meaning task. */
export type TaskType = 'reading' | 'meaning';
export type KanaAlphabet = 'hiragana' | 'katakana';

export type TextRange = {
  start: number;
  length: number;
};

/** Represents the outcome of an answer check. Each variant carries the data needed to provide feedback to the user. */
export type AnswerCheckResult =
  | { kind: 'precise' }
  | { kind: 'imprecise' }
  | { kind: 'otherKanjiReading' }
  | { kind: 'mismatchingOkurigana'; ranges: TextRange[] }
  | { kind: 'containsInvalidCharacters'; ranges: TextRange[] }
  | { kind: 'isReadingButWantMeaning' }
  | { kind: 'incorrect' };

/** A possible meaning match for a subject. Tracks whether the user's answer maps to a primary, secondary, or blacklisted meaning, and whether it was accepted. */
export type MeaningCandidate = {
  meaning: string;
  type?: 'primary' | 'secondary' | 'auxiliary_whitelist' | 'blacklist' | string;
  acceptedAnswer?: boolean;
};

/** A possible reading match for a subject. Indicates the reading text, whether it is a primary/alternate reading, the reading type (onyomi/kunyomi/nanori), and whether it was accepted. */
export type ReadingCandidate = {
  reading: string;
  primary?: boolean;
  acceptedAnswer?: boolean;
  type?: 'onyomi' | 'kunyomi' | 'nanori' | string;
};

export type SubjectAnswerData = {
  id?: number;
  type: 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary' | string;
  japanese: string;
  characterImageUrl?: string;
  characterImageIsSvg?: boolean;
  meanings: MeaningCandidate[];
  readings?: ReadingCandidate[];
  componentSubjectIds?: number[];
  meaningMnemonic?: string;
  meaningHint?: string;
  readingMnemonic?: string;
  readingHint?: string;
  contextSentences?: Array<{ en: string; ja: string }>;
  partsOfSpeech?: string[];
  amalgamationSubjectIds?: number[];
};

export type StudyMaterialAnswerData = {
  meaningSynonyms?: string[];
};

export type AnswerCheckOptions = {
  taskType: TaskType;
  alphabet?: KanaAlphabet;
  studyMaterials?: StudyMaterialAnswerData | null;
  lookupSubject?: (subjectId: number) => SubjectAnswerData | undefined;
  exactMatch?: boolean;
};

const PRECISE: AnswerCheckResult = { kind: 'precise' };
const IMPRECISE: AnswerCheckResult = { kind: 'imprecise' };
const OTHER_KANJI_READING: AnswerCheckResult = { kind: 'otherKanjiReading' };
const IS_READING_BUT_WANT_MEANING: AnswerCheckResult = { kind: 'isReadingButWantMeaning' };
const INCORRECT: AnswerCheckResult = { kind: 'incorrect' };

export function convertKatakanaToHiragana(text: string) {
  return Array.from(text)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (!codePoint || character === 'ー') {
        return character;
      }
      if (codePoint >= 0x30a1 && codePoint <= 0x30f6) {
        return String.fromCodePoint(codePoint - 0x60);
      }
      return character;
    })
    .join('');
}

export function normalizeAnswer(text: string, taskType: TaskType, alphabet: KanaAlphabet = 'hiragana') {
  let normalized = text
    .trim()
    .toLowerCase()
    .replaceAll('-', ' ')
    .replaceAll('.', '')
    .replaceAll("'", '')
    .replaceAll('/', '');

  if (taskType === 'reading') {
    normalized = normalized
      .replaceAll('n', alphabet === 'hiragana' ? 'ん' : 'ン')
      .replaceAll('ｎ', alphabet === 'hiragana' ? 'ん' : 'ン')
      .replaceAll(' ', '');
  }

  return normalized;
}

export function checkAnswer(rawAnswer: string, subject: SubjectAnswerData, options: AnswerCheckOptions): AnswerCheckResult {
  const answer = normalizeAnswer(rawAnswer, options.taskType, options.alphabet);

  if (options.taskType === 'reading') {
    return checkReadingAnswer(answer, subject, options);
  }

  return checkMeaningAnswer(answer, subject, options);
}

function checkReadingAnswer(answer: string, subject: SubjectAnswerData, options: AnswerCheckOptions): AnswerCheckResult {
  const hiraganaText = convertKatakanaToHiragana(answer);
  const invalidRanges = findNonKanaRanges(answer);
  if (invalidRanges.length) {
    return { kind: 'containsInvalidCharacters', ranges: invalidRanges };
  }

  for (const reading of primaryReadings(subject)) {
    if (reading.reading === hiraganaText || convertKatakanaToHiragana(reading.reading) === hiraganaText) {
      return PRECISE;
    }
  }

  for (const reading of alternateReadings(subject)) {
    if (reading.reading === hiraganaText || convertKatakanaToHiragana(reading.reading) === hiraganaText) {
      return subject.type === 'kanji' ? OTHER_KANJI_READING : PRECISE;
    }
  }

  const componentSubjectId = subject.componentSubjectIds?.[0];
  if ((subject.type === 'vocabulary' || subject.type === 'kana_vocabulary') && Array.from(subject.japanese).length === 1 && componentSubjectId !== undefined) {
    const component = options.lookupSubject?.(componentSubjectId);
    if (component) {
      const componentResult = checkReadingAnswer(answer, component, options);
      if (componentResult.kind === 'precise') {
        return OTHER_KANJI_READING;
      }
    }
  }

  if (subject.type === 'vocabulary' || subject.type === 'kana_vocabulary') {
    const ranges = mismatchingOkurigana(answer, subject.japanese);
    if (ranges.length) {
      return { kind: 'mismatchingOkurigana', ranges };
    }
  }

  return INCORRECT;
}

function checkMeaningAnswer(answer: string, subject: SubjectAnswerData, options: AnswerCheckOptions): AnswerCheckResult {
  const invalidRanges = findJapaneseRanges(answer);
  if (invalidRanges.length) {
    return { kind: 'containsInvalidCharacters', ranges: invalidRanges };
  }

  for (const meaning of subject.meanings) {
    if (isBlacklistedMeaning(meaning) && normalizeAnswer(meaning.meaning, 'meaning') === answer) {
      return INCORRECT;
    }
  }

  const meanings = [
    ...(options.studyMaterials?.meaningSynonyms ?? []),
    ...subject.meanings.filter((meaning) => !isBlacklistedMeaning(meaning) && meaning.acceptedAnswer !== false).map((meaning) => meaning.meaning),
  ];

  for (const meaning of meanings) {
    if (normalizeAnswer(meaning, 'meaning') === answer) {
      return PRECISE;
    }
  }

  if (!options.exactMatch) {
    for (const meaning of meanings) {
      const normalizedMeaning = normalizeAnswer(meaning, 'meaning');
      if (levenshteinDistance(normalizedMeaning, answer) <= distanceTolerance(normalizedMeaning)) {
        return IMPRECISE;
      }
    }
  }

  const kanaText = convertKatakanaToHiragana(answer);
  const readingResult = checkReadingAnswer(kanaText, subject, options);
  if (readingResult.kind === 'precise' || readingResult.kind === 'imprecise') {
    return IS_READING_BUT_WANT_MEANING;
  }
  if (readingResult.kind === 'otherKanjiReading') {
    return OTHER_KANJI_READING;
  }

  return INCORRECT;
}

function primaryReadings(subject: SubjectAnswerData) {
  return (subject.readings ?? []).filter((reading) => reading.primary === true || reading.acceptedAnswer === true);
}

function alternateReadings(subject: SubjectAnswerData) {
  return (subject.readings ?? []).filter((reading) => !primaryReadings(subject).includes(reading));
}

function isBlacklistedMeaning(meaning: MeaningCandidate) {
  return meaning.type === 'blacklist' || meaning.acceptedAnswer === false;
}

function distanceTolerance(answer: string) {
  const length = Array.from(answer).length;
  if (length <= 3) {
    return 0;
  }
  if (length <= 5) {
    return 1;
  }
  if (length <= 7) {
    return 2;
  }
  return 2 + Math.floor(length / 7);
}

export function levenshteinDistance(a: string, b: string) {
  const left = Array.from(a);
  const right = Array.from(b);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let i = 0; i < left.length; i += 1) {
    current[0] = i + 1;
    for (let j = 0; j < right.length; j += 1) {
      const cost = (left[i] ?? '') === (right[j] ?? '') ? 0 : 1;
      const insertion = (current[j] ?? 0) + 1;
      const deletion = (previous[j + 1] ?? 0) + 1;
      const substitution = (previous[j] ?? 0) + cost;
      current[j + 1] = Math.min(insertion, deletion, substitution);
    }
    for (let j = 0; j < previous.length; j += 1) {
      previous[j] = current[j] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
}

function mismatchingOkurigana(answer: string, japanese: string) {
  const answerChars = Array.from(answer);
  const japaneseChars = Array.from(japanese);

  if (answerChars.length < japaneseChars.length) {
    return [];
  }

  const ranges: TextRange[] = [];
  const prefix = mismatchingOkuriganaDirection(answerChars, japaneseChars);
  if (prefix) {
    ranges.push(prefix);
  }

  const suffix = mismatchingOkuriganaDirection([...answerChars].reverse(), [...japaneseChars].reverse());
  if (suffix) {
    ranges.push({
      start: answerChars.length - suffix.start - suffix.length,
      length: suffix.length,
    });
  }

  return ranges;
}

function mismatchingOkuriganaDirection(answerChars: string[], japaneseChars: string[]) {
  let begin: number | undefined;
  let end: number | undefined;
  const max = Math.min(answerChars.length, japaneseChars.length);

  for (let index = 0; index < max; index += 1) {
    const japaneseChar = japaneseChars[index];
    const answerChar = answerChars[index];
    if (!japaneseChar || !answerChar || !isHiragana(japaneseChar)) {
      break;
    }
    if (japaneseChar !== answerChar) {
      begin = Math.min(index, begin ?? index);
      end = Math.max(index, end ?? index);
    }
  }

  if (begin === undefined || end === undefined) {
    return undefined;
  }

  return { start: begin, length: end - begin + 1 } satisfies TextRange;
}

function findNonKanaRanges(text: string) {
  return findCharacterRanges(text, (codePoint) => !isAllKanaCodePoint(codePoint));
}

function findJapaneseRanges(text: string) {
  return findCharacterRanges(text, isJapaneseCodePoint);
}

function findCharacterRanges(text: string, predicate: (codePoint: number) => boolean) {
  const ranges: TextRange[] = [];
  const chars = Array.from(text);
  let start: number | undefined;
  let length = 0;

  chars.forEach((char, index) => {
    const codePoint = char.codePointAt(0) ?? 0;
    if (predicate(codePoint)) {
      start ??= index;
      length += 1;
      return;
    }

    if (start !== undefined) {
      ranges.push({ start, length });
      start = undefined;
      length = 0;
    }
  });

  if (start !== undefined) {
    ranges.push({ start, length });
  }

  return ranges;
}

function isHiragana(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint >= 0x3040 && codePoint < 0x309d;
}

function isAllKanaCodePoint(codePoint: number) {
  return codePoint >= 0x3040 && codePoint < 0x3100;
}

function isJapaneseCodePoint(codePoint: number) {
  return (
    isAllKanaCodePoint(codePoint) ||
    (codePoint >= 0x3400 && codePoint < 0x4dc0) ||
    (codePoint >= 0x4e00 && codePoint < 0xa000) ||
    (codePoint >= 0xf900 && codePoint < 0xfb00) ||
    (codePoint >= 0xff66 && codePoint < 0xffa0)
  );
}
