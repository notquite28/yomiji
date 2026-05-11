import { SubjectAnswerData } from '../answers/answerChecker';
import { defaultSettings } from '../settings/settings';
import { StudyQueueItem } from './studyRepository';
import {
  createReviewItem,
  MarkResult,
  ReviewItem,
  ReviewSession,
  ReviewSessionSettings,
  sortReviewQueue,
  tasksForItem,
} from './reviewSession';

function makeSubject(overrides: Partial<SubjectAnswerData> = {}): SubjectAnswerData {
  return {
    id: 1,
    type: 'vocabulary',
    japanese: '猫',
    meanings: [{ meaning: 'cat', type: 'primary', acceptedAnswer: true }],
    readings: [{ reading: 'ねこ', primary: true, acceptedAnswer: true }],
    ...overrides,
  };
}

function makeItem(
  id: number,
  overrides: Partial<StudyQueueItem> = {},
): StudyQueueItem {
  return {
    assignmentId: id,
    subjectId: id,
    subjectType: 'vocabulary',
    level: 1,
    srsStage: 1,
    subject: makeSubject({ id }),
    ...overrides,
  };
}

function makeSettings(
  overrides: Partial<ReviewSessionSettings> = {},
): ReviewSessionSettings {
  return {
    reviewOrder: 'random',
    reviewBatchSize: 5,
    reviewItemsLimit: 15,
    reviewItemsLimitEnabled: false,
    groupMeaningReading: false,
    meaningFirst: true,
    minimizeReviewPenalty: false,
    skipKanjiReadings: false,
    ...overrides,
  };
}

function makeKanjiItem(id: number, level = 1): StudyQueueItem {
  return {
    assignmentId: id,
    subjectId: id,
    subjectType: 'kanji',
    level,
    srsStage: 2,
    subject: {
      id,
      type: 'kanji',
      japanese: '火',
      meanings: [{ meaning: 'fire', type: 'primary', acceptedAnswer: true }],
      readings: [
        { reading: 'か', primary: true, acceptedAnswer: true },
        { reading: 'ひ', primary: false, acceptedAnswer: true },
      ],
    },
  };
}

function makeRadicalItem(id: number): StudyQueueItem {
  return {
    assignmentId: id,
    subjectId: id,
    subjectType: 'radical',
    level: 1,
    srsStage: 1,
    subject: {
      id,
      type: 'radical',
      japanese: '一',
      meanings: [{ meaning: 'one', type: 'primary', acceptedAnswer: true }],
    },
  };
}

function runAllCorrect(session: ReviewSession): MarkResult[] {
  const results: MarkResult[] = [];
  let safety = 0;
  while (!session.isComplete && safety < 500) {
    session.nextTask();
    const item = session.currentItem;
    if (!item) {
      break;
    }
    const result = session.markAnswer(true);
    results.push(result);
    safety += 1;
  }
  return results;
}

describe('ReviewSession', () => {
  describe('initialization', () => {
    it('creates an active queue from items', () => {
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      const session = new ReviewSession(items, makeSettings({ reviewBatchSize: 2 }));
      expect(session.activeQueueLength).toBe(2);
      expect(session.reviewQueueLength).toBe(1);
      expect(session.totalReviews).toBe(3);
      expect(session.isComplete).toBe(false);
    });

    it('respects item limit when enabled', () => {
      const items = Array.from({ length: 20 }, (_, i) => makeItem(i + 1));
      const session = new ReviewSession(
        items,
        makeSettings({ reviewItemsLimitEnabled: true, reviewItemsLimit: 5 }),
      );
      expect(session.totalReviews).toBe(5);
    });

    it('ignores item limit when disabled', () => {
      const items = Array.from({ length: 20 }, (_, i) => makeItem(i + 1));
      const session = new ReviewSession(
        items,
        makeSettings({ reviewItemsLimitEnabled: false, reviewItemsLimit: 5 }),
      );
      expect(session.totalReviews).toBe(20);
    });

    it('uses batch size for active queue', () => {
      const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1));
      const session = new ReviewSession(items, makeSettings({ reviewBatchSize: 3 }));
      expect(session.activeQueueLength).toBe(3);
      expect(session.reviewQueueLength).toBe(7);
    });

    it('forces active queue size to 1 in grouped mode', () => {
      const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1));
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true, reviewBatchSize: 5 }),
      );
      expect(session.activeQueueLength).toBe(1);
    });

    it('forces active queue size to 1 in practice mode', () => {
      const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1));
      const session = new ReviewSession(
        items,
        makeSettings({ reviewBatchSize: 5 }),
        true,
      );
      expect(session.activeQueueLength).toBe(1);
      expect(session.isPracticeSession).toBe(true);
    });
  });

  describe('basic correct flow', () => {
    it('completes a session with all correct answers', () => {
      const items = [makeItem(1), makeItem(2)];
      const session = new ReviewSession(items, makeSettings({ reviewBatchSize: 5 }));
      const results = runAllCorrect(session);

      expect(session.isComplete).toBe(true);
      expect(session.reviewsCompleted).toBe(2);
      expect(session.tasksAnsweredCorrectly).toBeGreaterThanOrEqual(2);
    });

    it('handles radical with meaning only', () => {
      const items = [makeRadicalItem(1)];
      const session = new ReviewSession(items, makeSettings());
      session.nextTask();

      expect(session.currentTaskType).toBe('meaning');
      const result = session.markAnswer(true);
      expect(result.subjectFinished).toBe(true);
      expect(result.correct).toBe(true);
    });

    it('handles vocabulary with meaning and reading', () => {
      const items = [makeItem(1)];
      const session = new ReviewSession(items, makeSettings());
      session.nextTask();

      const firstTask = session.currentTaskType;
      const result1 = session.markAnswer(true);
      expect(result1.subjectFinished).toBe(false);

      session.nextTask();
      const secondTask = session.currentTaskType;
      expect(firstTask).not.toBe(secondTask);

      const result2 = session.markAnswer(true);
      expect(result2.subjectFinished).toBe(true);
    });
  });

  describe('wrong answer re-queuing', () => {
    it('sets return delay on wrong answer', () => {
      const items = [
        makeItem(1),
        makeItem(2),
        makeItem(3),
        makeItem(4),
        makeItem(5),
        makeItem(6),
        makeItem(7),
      ];
      const session = new ReviewSession(
        items,
        makeSettings({ reviewBatchSize: 5, reviewOrder: 'ascendingSrsStage' }),
      );

      session.nextTask();
      const item = session.currentItem!;
      const result = session.markAnswer(false);

      expect(result.correct).toBe(false);
      expect(item.returnDelay).toBe(5);
      expect(item.meaningWrongCount + item.readingWrongCount).toBeGreaterThan(0);
    });

    it('does not set return delay in grouped mode', () => {
      const items = [makeItem(1), makeItem(2)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true }),
      );

      session.nextTask();
      const item = session.currentItem!;
      session.markAnswer(false);

      expect(item.returnDelay).toBe(0);
    });

    it('does not set return delay in practice mode', () => {
      const items = [makeItem(1), makeItem(2)];
      const session = new ReviewSession(items, makeSettings(), true);

      session.nextTask();
      const item = session.currentItem!;
      session.markAnswer(false);

      expect(item.returnDelay).toBe(0);
    });

    it('item comes back after delay counts down', () => {
      const items = [
        makeItem(1, { subjectId: 1, subject: makeSubject({ id: 1, japanese: '一' }) }),
        makeItem(2, { subjectId: 2, subject: makeSubject({ id: 2, japanese: '二' }) }),
        makeItem(3, { subjectId: 3, subject: makeSubject({ id: 3, japanese: '三' }) }),
        makeItem(4, { subjectId: 4, subject: makeSubject({ id: 4, japanese: '四' }) }),
        makeItem(5, { subjectId: 5, subject: makeSubject({ id: 5, japanese: '五' }) }),
        makeItem(6, { subjectId: 6, subject: makeSubject({ id: 6, japanese: '六' }) }),
      ];
      const session = new ReviewSession(
        items,
        makeSettings({ reviewBatchSize: 5, reviewOrder: 'ascendingSrsStage' }),
      );

      session.nextTask();
      const wrongItem = session.currentItem!;
      session.markAnswer(false);

      expect(wrongItem.returnDelay).toBe(5);

      for (let i = 0; i < 6; i++) {
        session.nextTask();
        session.markAnswer(true);
      }

      expect(wrongItem.returnDelay).toBe(0);
    });
  });

  describe('marking and wrong counts', () => {
    it('tracks meaning wrong count', () => {
      const items = [makeItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true }),
      );

      session.nextTask();
      if (session.currentTaskType !== 'meaning') {
        session.markAnswer(true);
        session.nextTask();
      }

      session.markAnswer(false);
      expect(session.currentItem!.meaningWrong).toBe(true);
      expect(session.currentItem!.meaningWrongCount).toBe(1);
    });

    it('only sets wrong flag on first wrong answer', () => {
      const items = [makeItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true }),
      );

      session.nextTask();
      if (session.currentTaskType !== 'meaning') {
        session.markAnswer(true);
        session.nextTask();
      }

      session.markAnswer(false);
      session.nextTask();
      session.markAnswer(false);

      expect(session.currentItem!.meaningWrongCount).toBe(2);
      expect(session.currentItem!.meaningWrong).toBe(true);
    });

    it('minimizes review penalty on subject finish', () => {
      const items = [makeItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true, minimizeReviewPenalty: true }),
      );

      session.nextTask();
      if (session.currentTaskType !== 'meaning') {
        session.markAnswer(true);
        session.nextTask();
      }

      session.markAnswer(false);
      session.nextTask();
      session.markAnswer(false);
      session.nextTask();
      session.markAnswer(false);

      expect(session.currentItem!.meaningWrongCount).toBe(3);

      session.markAnswer(true);

      expect(session.currentItem!.meaningWrongCount).toBe(3);

      session.nextTask();
      const result = session.markAnswer(true);
      expect(result.subjectFinished).toBe(true);

      const completed = session.completedItems[0]!;
      expect(completed.meaningWrongCount).toBe(1);
    });

    it('skips kanji readings when setting enabled', () => {
      const items = [makeKanjiItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ skipKanjiReadings: true, groupMeaningReading: true }),
      );

      session.nextTask();
      expect(session.currentTaskType).toBe('meaning');
      const result = session.markAnswer(true);
      expect(result.subjectFinished).toBe(true);
    });

    it('does not select kanji reading prompts when skipped outside grouped mode', () => {
      const items = [makeKanjiItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ skipKanjiReadings: true, groupMeaningReading: false }),
      );

      session.nextTask();
      expect(session.currentTaskType).toBe('meaning');
      expect(session.markAnswer(true).subjectFinished).toBe(true);
    });
  });

  describe('grouped meaning/reading mode', () => {
    it('stays on same item for back-to-back', () => {
      const items = [makeItem(1), makeItem(2)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true }),
      );

      session.nextTask();
      const firstItem = session.currentItem;
      const firstType = session.currentTaskType;
      session.markAnswer(true);

      session.nextTask();
      expect(session.currentItem).toBe(firstItem);
      expect(session.currentTaskType).not.toBe(firstType);
    });

    it('respects meaningFirst setting', () => {
      const items = [makeItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true, meaningFirst: true }),
      );

      session.nextTask();
      expect(session.currentTaskType).toBe('meaning');
    });

    it('respects reading-first setting', () => {
      const items = [makeItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true, meaningFirst: false }),
      );

      session.nextTask();
      expect(session.currentTaskType).toBe('reading');
    });
  });

  describe('wrap-up mode', () => {
    it('moves unattempted items back to review queue', () => {
      const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1));
      const session = new ReviewSession(
        items,
        makeSettings({ reviewBatchSize: 5, reviewOrder: 'ascendingSrsStage' }),
      );

      session.nextTask();
      session.markAnswer(true);
      session.nextTask();
      session.markAnswer(true);

      const activeBeforeWrap = session.activeQueueLength;
      session.setWrappingUp(true);

      expect(session.wrappingUp).toBe(true);
      expect(session.activeQueueLength).toBeLessThanOrEqual(activeBeforeWrap);
    });

    it('session ends when active queue empties during wrap-up', () => {
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      const session = new ReviewSession(
        items,
        makeSettings({ reviewBatchSize: 3, reviewOrder: 'ascendingSrsStage' }),
      );

      session.nextTask();
      session.markAnswer(true);
      session.nextTask();
      session.setWrappingUp(true);

      while (!session.isComplete) {
        session.nextTask();
        session.markAnswer(true);
      }

      expect(session.isComplete).toBe(true);
    });
  });

  describe('moveActiveTaskToEnd', () => {
    it('resets item and moves it to end of queue', () => {
      const items = [makeItem(1), makeItem(2), makeItem(3), makeItem(4)];
      const session = new ReviewSession(
        items,
        makeSettings({ reviewBatchSize: 2, reviewOrder: 'ascendingSrsStage' }),
      );

      expect(session.activeQueueLength).toBe(2);
      expect(session.reviewQueueLength).toBe(2);

      session.nextTask();
      const item = session.currentItem!;
      session.markAnswer(false);

      session.moveActiveTaskToEnd();

      expect(item.answeredMeaning).toBe(false);
      expect(item.answeredReading).toBe(false);
      expect(item.meaningWrongCount).toBe(0);
      expect(item.readingWrongCount).toBe(0);
      expect(item.returnDelay).toBe(0);

      expect(session.activeQueueLength).toBe(2);
      expect(session.activeQueueLength + session.reviewQueueLength).toBe(4);
    });
  });

  describe('overrideCorrect', () => {
    it('reverses a wrong answer', () => {
      const items = [makeItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true }),
      );

      session.nextTask();
      if (session.currentTaskType !== 'meaning') {
        session.markAnswer(true);
        session.nextTask();
      }

      session.markAnswer(false);
      expect(session.currentItem!.meaningWrong).toBe(true);
      expect(session.currentItem!.meaningWrongCount).toBe(1);

      session.overrideCorrect();
      expect(session.currentItem!.meaningWrong).toBe(false);
      expect(session.currentItem!.meaningWrongCount).toBe(0);
      expect(session.currentItem!.answeredMeaning).toBe(true);
    });
  });

  describe('success rate', () => {
    it('calculates success rate text', () => {
      const items = [makeItem(1)];
      const session = new ReviewSession(
        items,
        makeSettings({ groupMeaningReading: true }),
      );

      expect(session.successRateText).toBe('100%');

      session.nextTask();
      if (session.currentTaskType !== 'meaning') {
        session.markAnswer(true);
        session.nextTask();
      }

      session.markAnswer(false);
      expect(session.successRateText).toBe('0%');

      session.nextTask();
      session.markAnswer(true);
      expect(session.successRateText).toBe('50%');
    });
  });

  describe('practice mode', () => {
    it('tracks completed items without side effects', () => {
      const items = [makeItem(1), makeItem(2)];
      const session = new ReviewSession(items, makeSettings(), true);
      runAllCorrect(session);

      expect(session.isComplete).toBe(true);
      expect(session.reviewsCompleted).toBe(2);
      expect(session.isPracticeSession).toBe(true);
    });
  });
});

describe('sortReviewQueue', () => {
  const makeItemForSort = (
    id: number,
    srsStage: number,
    level = 1,
    availableAt?: string,
  ): ReviewItem => ({
    assignmentId: id,
    subjectId: id,
    subjectType: 'vocabulary',
    level,
    srsStage,
    subject: makeSubject({ id }),
    availableAt,
    answeredMeaning: false,
    answeredReading: false,
    meaningWrong: false,
    readingWrong: false,
    meaningWrongCount: 0,
    readingWrongCount: 0,
    returnDelay: 0,
  });

  it('sorts by ascending SRS stage', () => {
    const items = [
      makeItemForSort(1, 5),
      makeItemForSort(2, 1),
      makeItemForSort(3, 8),
    ];
    const sorted = sortReviewQueue(items, 'ascendingSrsStage');
    expect(sorted.map((i) => i.srsStage)).toEqual([1, 5, 8]);
  });

  it('sorts by descending SRS stage', () => {
    const items = [
      makeItemForSort(1, 5),
      makeItemForSort(2, 1),
      makeItemForSort(3, 8),
    ];
    const sorted = sortReviewQueue(items, 'descendingSrsStage');
    expect(sorted.map((i) => i.srsStage)).toEqual([8, 5, 1]);
  });

  it('sorts current level first', () => {
    const items = [
      makeItemForSort(1, 1, 5),
      makeItemForSort(2, 1, 3),
      makeItemForSort(3, 1, 3),
    ];
    const sorted = sortReviewQueue(items, 'currentLevelFirst', 3);
    expect(sorted[0]!.level).toBe(3);
    expect(sorted[1]!.level).toBe(3);
    expect(sorted[2]!.level).toBe(5);
  });

  it('sorts by lowest level first', () => {
    const items = [
      makeItemForSort(1, 1, 5),
      makeItemForSort(2, 1, 2),
      makeItemForSort(3, 1, 8),
    ];
    const sorted = sortReviewQueue(items, 'lowestLevelFirst');
    expect(sorted.map((i) => i.level)).toEqual([2, 5, 8]);
  });

  it('sorts by oldest available first', () => {
    const items = [
      makeItemForSort(1, 1, 1, '2024-01-03'),
      makeItemForSort(2, 1, 1, '2024-01-01'),
      makeItemForSort(3, 1, 1, '2024-01-02'),
    ];
    const sorted = sortReviewQueue(items, 'oldestAvailableFirst');
    expect(sorted.map((i) => i.availableAt)).toEqual([
      '2024-01-01',
      '2024-01-02',
      '2024-01-03',
    ]);
  });

  it('sorts by newest available first', () => {
    const items = [
      makeItemForSort(1, 1, 1, '2024-01-01'),
      makeItemForSort(2, 1, 1, '2024-01-03'),
      makeItemForSort(3, 1, 1, '2024-01-02'),
    ];
    const sorted = sortReviewQueue(items, 'newestAvailableFirst');
    expect(sorted.map((i) => i.availableAt)).toEqual([
      '2024-01-03',
      '2024-01-02',
      '2024-01-01',
    ]);
  });

  it('alternates SRS stages', () => {
    const items = [
      makeItemForSort(1, 1),
      makeItemForSort(2, 2),
      makeItemForSort(3, 3),
      makeItemForSort(4, 4),
      makeItemForSort(5, 5),
    ];
    const sorted = sortReviewQueue(items, 'alternatingSrsStage');
    expect(sorted[0]!.srsStage).toBe(1);
    expect(sorted[1]!.srsStage).toBe(5);
    expect(sorted[2]!.srsStage).toBe(2);
    expect(sorted[3]!.srsStage).toBe(4);
    expect(sorted[4]!.srsStage).toBe(3);
  });

  it('does not mutate original array', () => {
    const items = [
      makeItemForSort(1, 5),
      makeItemForSort(2, 1),
      makeItemForSort(3, 8),
    ];
    const ids = items.map((i) => i.assignmentId);
    sortReviewQueue(items, 'ascendingSrsStage');
    expect(items.map((i) => i.assignmentId)).toEqual(ids);
  });
});

describe('tasksForItem', () => {
  it('returns meaning and reading for vocabulary', () => {
    const item = createReviewItem(makeItem(1));
    expect(tasksForItem(item)).toEqual(['meaning', 'reading']);
  });

  it('returns meaning only for radicals', () => {
    const item = createReviewItem(makeRadicalItem(1));
    expect(tasksForItem(item)).toEqual(['meaning']);
  });

  it('returns meaning only when no accepted readings', () => {
    const item = createReviewItem(
      makeItem(1, {
        subject: makeSubject({
          id: 1,
          readings: [{ reading: 'ねこ', primary: true, acceptedAnswer: false }],
        }),
      }),
    );
    expect(tasksForItem(item)).toEqual(['meaning']);
  });
});

describe('createReviewItem', () => {
  it('initializes mutable state to defaults', () => {
    const item = createReviewItem(makeItem(1));
    expect(item.answeredMeaning).toBe(false);
    expect(item.answeredReading).toBe(false);
    expect(item.meaningWrong).toBe(false);
    expect(item.readingWrong).toBe(false);
    expect(item.meaningWrongCount).toBe(0);
    expect(item.readingWrongCount).toBe(0);
    expect(item.returnDelay).toBe(0);
  });

  it('preserves study queue item data', () => {
    const source = makeItem(42, {
      subjectType: 'kanji',
      level: 7,
      srsStage: 4,
    });
    const item = createReviewItem(source, '2024-01-01');
    expect(item.assignmentId).toBe(42);
    expect(item.subjectType).toBe('kanji');
    expect(item.level).toBe(7);
    expect(item.srsStage).toBe(4);
    expect(item.availableAt).toBe('2024-01-01');
  });
});
