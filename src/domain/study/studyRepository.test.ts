import { AppSettings, defaultSettings, SubjectType } from '../settings/settings';
import { AppDatabase } from '../db/database';
import { StudyQueueItem } from './studyRepository';
import { getCharacterImageUrl, isCharacterImageSvg, isLessonFiltered, queueReviewResult, recentMistakeCutoff, sortLessonItems } from './studyRepository';
import { SubjectData } from '../api/types';

function makeSubject(images: SubjectData['character_images']): SubjectData {
  return { level: 1, character_images: images };
}

function makeQueueItem(overrides: Partial<StudyQueueItem> = {}): StudyQueueItem {
  return {
    assignmentId: 1,
    subjectId: 1,
    subjectType: 'vocabulary',
    level: 1,
    srsStage: 0,
    subject: {
      id: 1,
      type: 'vocabulary',
      japanese: '猫',
      meanings: [{ meaning: 'cat', type: 'primary', acceptedAnswer: true }],
      readings: [{ reading: 'ねこ', primary: true, acceptedAnswer: true }],
    },
    ...overrides,
  };
}

describe('getCharacterImageUrl', () => {
  it('selects SVG with inline_styles over PNGs', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical-original.png', content_type: 'image/png', metadata: { style_name: 'original', color: '#333333' } },
      { url: 'https://cdn.example.com/radical-thumb.png', content_type: 'image/png', metadata: { style_name: 'thumbnail', color: '#333333' } },
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml', metadata: { inline_styles: true } },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical.svg');
    expect(isCharacterImageSvg(subject)).toBe(true);
  });

  it('returns SVG url as SVG', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml', metadata: { inline_styles: true } },
    ]);
    expect(isCharacterImageSvg(subject)).toBe(true);
  });

  it('selects original PNG over thumbnail PNG', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical-thumb.png', content_type: 'image/png', metadata: { style_name: 'thumbnail' } },
      { url: 'https://cdn.example.com/radical-original.png', content_type: 'image/png', metadata: { style_name: 'original' } },
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml', metadata: { inline_styles: false } },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical-original.png');
    expect(isCharacterImageSvg(subject)).toBe(false);
  });

  it('falls back to first PNG when no original style', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical.png', content_type: 'image/png' },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical.png');
  });

  it('falls back to any SVG when no PNGs', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml' },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical.svg');
    expect(isCharacterImageSvg(subject)).toBe(true);
  });

  it('returns undefined for empty images array', () => {
    const subject = makeSubject([]);
    expect(getCharacterImageUrl(subject)).toBeUndefined();
  });

  it('returns undefined for missing character_images', () => {
    const subject = makeSubject(undefined);
    expect(getCharacterImageUrl(subject)).toBeUndefined();
  });

  it('ignores SVG when PNGs exist', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical.png', content_type: 'image/png', metadata: { style_name: 'original' } },
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml' },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical.png');
    expect(isCharacterImageSvg(subject)).toBe(false);
  });
});

describe('isLessonFiltered', () => {
  it('does not filter kanji subjects', () => {
    const item = makeQueueItem({ subjectType: 'kanji' });
    expect(isLessonFiltered(item, false, false, defaultSettings)).toBe(false);
  });

  it('does not filter radical subjects', () => {
    const item = makeQueueItem({ subjectType: 'radical' });
    expect(isLessonFiltered(item, false, false, defaultSettings)).toBe(false);
  });

  it('does not filter regular vocabulary when showKanaOnlyVocab is true', () => {
    const item = makeQueueItem({ subjectType: 'vocabulary' });
    expect(isLessonFiltered(item, false, false, defaultSettings)).toBe(false);
  });

  it('does not filter kana-only vocabulary when showKanaOnlyVocab is true', () => {
    const item = makeQueueItem({ subjectType: 'vocabulary' });
    const settings = { ...defaultSettings, showKanaOnlyVocab: true };
    expect(isLessonFiltered(item, true, false, settings)).toBe(false);
  });

  it('filters kana-only vocabulary when showKanaOnlyVocab is false', () => {
    const item = makeQueueItem({ subjectType: 'vocabulary' });
    const settings = { ...defaultSettings, showKanaOnlyVocab: false };
    expect(isLessonFiltered(item, true, false, settings)).toBe(true);
  });

  it('does not filter regular vocabulary when showKanaOnlyVocab is false', () => {
    const item = makeQueueItem({ subjectType: 'vocabulary' });
    const settings = { ...defaultSettings, showKanaOnlyVocab: false };
    expect(isLessonFiltered(item, false, false, settings)).toBe(false);
  });

  it('filters hidden vocabulary', () => {
    const item = makeQueueItem({ subjectType: 'vocabulary' });
    expect(isLessonFiltered(item, false, true, defaultSettings)).toBe(true);
  });

  it('does not filter hidden non-vocabulary', () => {
    const item = makeQueueItem({ subjectType: 'kanji' });
    expect(isLessonFiltered(item, false, true, defaultSettings)).toBe(false);
  });

  it('filters kana-only AND hidden vocabulary with both flags', () => {
    const item = makeQueueItem({ subjectType: 'vocabulary' });
    const settings = { ...defaultSettings, showKanaOnlyVocab: false };
    expect(isLessonFiltered(item, true, true, settings)).toBe(true);
  });
});

describe('sortLessonItems', () => {
  function makeItem(id: number, level: number, subjectType: string): { item: StudyQueueItem } {
    return {
      item: makeQueueItem({
        subjectId: id,
        assignmentId: id,
        level,
        subjectType,
        subject: {
          id,
          type: subjectType,
          japanese: `item${id}`,
          meanings: [{ meaning: `item${id}`, type: 'primary', acceptedAnswer: true }],
          readings: [],
        },
      }),
    };
  }

  it('sorts by level ascending by default', () => {
    const items = [
      makeItem(3, 5, 'vocabulary'),
      makeItem(1, 2, 'radical'),
      makeItem(2, 3, 'kanji'),
    ];
    const result = sortLessonItems(items, defaultSettings);
    expect(result.map((r) => r.item.level)).toEqual([2, 3, 5]);
  });

  it('sorts by level descending when prioritizeCurrentLevel is true', () => {
    const items = [
      makeItem(1, 2, 'radical'),
      makeItem(2, 3, 'kanji'),
      makeItem(3, 5, 'vocabulary'),
    ];
    const settings = { ...defaultSettings, prioritizeCurrentLevel: true };
    const result = sortLessonItems(items, settings);
    expect(result.map((r) => r.item.level)).toEqual([5, 3, 2]);
  });

  it('sorts by subject type order within same level', () => {
    const items = [
      makeItem(3, 1, 'vocabulary'),
      makeItem(1, 1, 'radical'),
      makeItem(2, 1, 'kanji'),
    ];
    const result = sortLessonItems(items, defaultSettings);
    expect(result.map((r) => r.item.subjectType)).toEqual(['radical', 'kanji', 'vocabulary']);
  });

  it('sorts by subject ID when level and type are equal', () => {
    const items = [
      makeItem(5, 1, 'radical'),
      makeItem(2, 1, 'radical'),
      makeItem(8, 1, 'radical'),
    ];
    const result = sortLessonItems(items, defaultSettings);
    expect(result.map((r) => r.item.subjectId)).toEqual([2, 5, 8]);
  });

  it('sorts with custom lesson order', () => {
    const items = [
      makeItem(1, 1, 'radical'),
      makeItem(2, 1, 'kanji'),
      makeItem(3, 1, 'vocabulary'),
    ];
    const settings: AppSettings = { ...defaultSettings, lessonOrder: ['vocabulary', 'kanji', 'radical'] as SubjectType[] };
    const result = sortLessonItems(items, settings);
    expect(result.map((r) => r.item.subjectType)).toEqual(['vocabulary', 'kanji', 'radical']);
  });

  it('does not sort by type when interleave is enabled', () => {
    const items = [
      makeItem(1, 1, 'vocabulary'),
      makeItem(2, 1, 'radical'),
      makeItem(3, 1, 'kanji'),
    ];
    const settings = { ...defaultSettings, interleaveLessons: true };
    const result = sortLessonItems([...items], settings);
    expect(result.map((r) => r.item.subjectId)).toEqual([1, 2, 3]);
  });

  it('handles mixed levels and types', () => {
    const items = [
      makeItem(6, 3, 'kanji'),
      makeItem(1, 1, 'radical'),
      makeItem(4, 2, 'vocabulary'),
      makeItem(2, 1, 'kanji'),
      makeItem(5, 3, 'radical'),
      makeItem(3, 2, 'radical'),
    ];
    const result = sortLessonItems(items, defaultSettings);
    const types = result.map((r) => `${r.item.level}:${r.item.subjectType}`);
    expect(types).toEqual([
      '1:radical',
      '1:kanji',
      '2:radical',
      '2:vocabulary',
      '3:radical',
      '3:kanji',
    ]);
  });

  it('returns empty array unchanged', () => {
    const result = sortLessonItems([], defaultSettings);
    expect(result).toEqual([]);
  });
});

describe('recent mistakes', () => {
  it('uses a 24 hour cutoff', () => {
    expect(recentMistakeCutoff(new Date('2026-05-11T12:00:00.000Z')).toISOString()).toBe('2026-05-10T12:00:00.000Z');
  });

  it('records last mistake time when a queued review had incorrect answers', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      runAsync,
      getFirstAsync: jest.fn().mockResolvedValue({
        subject_id: 42,
        level: 7,
        srs_stage: 3,
        subject_type: 'kanji',
      }),
    } as unknown as AppDatabase;

    await queueReviewResult(db, {
      assignmentId: 99,
      incorrectMeaningAnswers: 1,
      incorrectReadingAnswers: 0,
    });

    expect(db.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('FROM assignments'), 99);
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO subject_progress'),
      42,
      7,
      3,
      'kanji',
      expect.any(String),
    );
  });

  it('does not record a recent mistake for fully correct reviews', async () => {
    const db = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      runAsync: jest.fn().mockResolvedValue(undefined),
      getFirstAsync: jest.fn().mockResolvedValue(null),
    } as unknown as AppDatabase;

    await queueReviewResult(db, {
      assignmentId: 99,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
    });

    expect(db.getFirstAsync).not.toHaveBeenCalled();
  });
});
