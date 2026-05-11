import { SubjectAnswerData, StudyMaterialAnswerData, TaskType } from '../answers/answerChecker';
import { ReviewOrder } from '../settings/settings';
import { StudyQueueItem } from './studyRepository';

export type ReviewSessionSettings = {
  reviewOrder: ReviewOrder;
  reviewBatchSize: number;
  reviewItemsLimit: number;
  reviewItemsLimitEnabled: boolean;
  groupMeaningReading: boolean;
  meaningFirst: boolean;
  minimizeReviewPenalty: boolean;
  skipKanjiReadings: boolean;
  enableCheats: boolean;
};

export type ReviewItem = {
  assignmentId: number;
  subjectId: number;
  subjectType: string;
  level?: number;
  srsStage: number;
  subject: SubjectAnswerData;
  studyMaterials?: StudyMaterialAnswerData;
  availableAt?: string;
  answeredMeaning: boolean;
  answeredReading: boolean;
  meaningWrong: boolean;
  readingWrong: boolean;
  meaningWrongCount: number;
  readingWrongCount: number;
  returnDelay: number;
};

export type MarkResult = {
  subjectFinished: boolean;
  correct: boolean;
};

export function createReviewItem(item: StudyQueueItem, availableAt?: string): ReviewItem {
  return {
    assignmentId: item.assignmentId,
    subjectId: item.subjectId,
    subjectType: item.subjectType,
    level: item.level,
    srsStage: item.srsStage,
    subject: item.subject,
    studyMaterials: item.studyMaterials,
    availableAt,
    answeredMeaning: false,
    answeredReading: false,
    meaningWrong: false,
    readingWrong: false,
    meaningWrongCount: 0,
    readingWrongCount: 0,
    returnDelay: 0,
  };
}

export function tasksForItem(item: ReviewItem): TaskType[] {
  const tasks: TaskType[] = ['meaning'];
  if (hasAcceptedReading(item)) {
    tasks.push('reading');
  }
  return tasks;
}

function hasAcceptedReading(item: ReviewItem) {
  return item.subject.readings?.some((r) => r.acceptedAnswer !== false) ?? false;
}

function shouldSkipReading(item: ReviewItem, settings: ReviewSessionSettings) {
  return item.subjectType === 'kanji' && settings.skipKanjiReadings;
}

function canAskReading(item: ReviewItem, settings: ReviewSessionSettings) {
  return hasAcceptedReading(item) && !shouldSkipReading(item, settings);
}

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i]!;
    array[i] = array[j]!;
    array[j] = temp;
  }
  return array;
}

export function sortReviewQueue(
  items: ReviewItem[],
  order: ReviewOrder,
  userLevel?: number,
): ReviewItem[] {
  const sorted = [...items];
  switch (order) {
    case 'random':
      return shuffle(sorted);
    case 'ascendingSrsStage':
      return sorted.sort((a, b) => a.srsStage - b.srsStage);
    case 'descendingSrsStage':
      return sorted.sort((a, b) => b.srsStage - a.srsStage);
    case 'alternatingSrsStage': {
      const arranged = [...sorted].sort((a, b) => a.srsStage - b.srsStage);
      const result: ReviewItem[] = [];
      let lo = 0;
      let hi = arranged.length - 1;
      while (lo <= hi) {
        result.push(arranged[lo]!);
        if (lo !== hi) {
          result.push(arranged[hi]!);
        }
        lo += 1;
        hi -= 1;
      }
      return result;
    }
    case 'currentLevelFirst': {
      return sorted.sort((a, b) => {
        const aCurrent = (a.level ?? 0) === (userLevel ?? 0) ? 0 : 1;
        const bCurrent = (b.level ?? 0) === (userLevel ?? 0) ? 0 : 1;
        return aCurrent - bCurrent;
      });
    }
    case 'lowestLevelFirst':
      return sorted.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    case 'newestAvailableFirst':
      return sorted.sort((a, b) =>
        (b.availableAt ?? '').localeCompare(a.availableAt ?? ''),
      );
    case 'oldestAvailableFirst':
      return sorted.sort((a, b) =>
        (a.availableAt ?? '').localeCompare(b.availableAt ?? ''),
      );
    case 'longestRelativeWait':
      return sorted.sort((a, b) =>
        (a.availableAt ?? '').localeCompare(b.availableAt ?? ''),
      );
    default:
      return sorted;
  }
}

export class ReviewSession {
  private activeQueue: ReviewItem[] = [];
  private reviewQueue: ReviewItem[] = [];
  private completedReviews: ReviewItem[] = [];
  private activeQueueSize: number;
  private activeTaskIndex = 0;
  private activeTaskType: TaskType | null = null;

  private _tasksAnswered = 0;
  private _tasksAnsweredCorrectly = 0;
  private _reviewsCompleted = 0;

  private readonly _settings: ReviewSessionSettings;
  private readonly _isPracticeSession: boolean;
  private _wrappingUp = false;

  constructor(
    items: StudyQueueItem[],
    settings: ReviewSessionSettings,
    isPracticeSession = false,
    availableAtMap?: Map<number, string>,
    userLevel?: number,
  ) {
    this._settings = settings;
    this._isPracticeSession = isPracticeSession;

    let queueItems = items;
    if (settings.reviewItemsLimitEnabled && settings.reviewItemsLimit > 0) {
      queueItems = items.slice(0, settings.reviewItemsLimit);
    }

    const reviewItems = queueItems.map((item) =>
      createReviewItem(item, availableAtMap?.get(item.assignmentId)),
    );
    this.reviewQueue = sortReviewQueue(reviewItems, settings.reviewOrder, userLevel);

    if (settings.groupMeaningReading || isPracticeSession) {
      this.activeQueueSize = 1;
    } else {
      this.activeQueueSize = settings.reviewBatchSize;
    }

    this.refillActiveQueue();
  }

  get hasStarted(): boolean {
    return this.activeTaskIndex < this.activeQueue.length;
  }

  get isComplete(): boolean {
    if (this._wrappingUp) {
      return this.activeQueue.length === 0;
    }
    return this.activeQueue.length === 0 && this.reviewQueue.length === 0;
  }

  get currentTaskType(): TaskType | null {
    return this.activeTaskType;
  }

  get currentItem(): ReviewItem | null {
    if (this.activeTaskIndex < this.activeQueue.length) {
      return this.activeQueue[this.activeTaskIndex] ?? null;
    }
    return null;
  }

  get tasksAnswered(): number {
    return this._tasksAnswered;
  }

  get tasksAnsweredCorrectly(): number {
    return this._tasksAnsweredCorrectly;
  }

  get reviewsCompleted(): number {
    return this._reviewsCompleted;
  }

  get totalReviews(): number {
    return this._reviewsCompleted + this.activeQueue.length + this.reviewQueue.length;
  }

  get successRateText(): string {
    if (this._tasksAnswered === 0) {
      return '100%';
    }
    return `${Math.round((this._tasksAnsweredCorrectly / this._tasksAnswered) * 100)}%`;
  }

  get wrappingUp(): boolean {
    return this._wrappingUp;
  }

  get canWrapUp(): boolean {
    if (this.activeQueue.length === 0) {
      return false;
    }
    return this.activeQueue.some(
      (item) =>
        item.answeredMeaning ||
        item.answeredReading ||
        item.meaningWrongCount > 0 ||
        item.readingWrongCount > 0,
    );
  }

  get completedItems(): readonly ReviewItem[] {
    return this.completedReviews;
  }

  get activeQueueLength(): number {
    return this.activeQueue.length;
  }

  get reviewQueueLength(): number {
    return this.reviewQueue.length;
  }

  get settings(): ReviewSessionSettings {
    return this._settings;
  }

  get isPracticeSession(): boolean {
    return this._isPracticeSession;
  }

  nextTask(): void {
    if (this.activeQueue.length === 0) {
      return;
    }

    const current = this.currentItem;

    if (
      (this._settings.groupMeaningReading || this._isPracticeSession) &&
      current !== null &&
      (!current.answeredMeaning || !current.answeredReading) &&
      current.returnDelay === 0
    ) {
      // Stay on current item for back-to-back mode
    } else {
      let eligibleIndices = this.activeQueue
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.returnDelay === 0)
        .map(({ index }) => index);

      if (eligibleIndices.length === 0 && !this._wrappingUp && this.reviewQueue.length > 0) {
        const item = this.reviewQueue.shift()!;
        this.activeQueue.push(item);
        eligibleIndices = [this.activeQueue.length - 1];
      } else if (eligibleIndices.length === 0) {
        eligibleIndices = Array.from({ length: this.activeQueue.length }, (_, i) => i);
      }

      for (let i = 0; i < this.activeQueue.length; i++) {
        const item = this.activeQueue[i]!;
        if (item.returnDelay > 0) {
          item.returnDelay -= 1;
        }
      }

      const chosenIndex = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)]!;
      this.activeTaskIndex = chosenIndex;
    }

    const task = this.currentItem;
    if (!task) {
      return;
    }

    const hasMeaning = task.subject.meanings.length > 0;
    const hasReading = canAskReading(task, this._settings);

    if (task.answeredMeaning || !hasMeaning) {
      this.activeTaskType = hasReading ? 'reading' : 'meaning';
    } else if (task.answeredReading || !hasReading) {
      this.activeTaskType = 'meaning';
    } else if (this._settings.groupMeaningReading || this._isPracticeSession) {
      this.activeTaskType = this._settings.meaningFirst ? 'meaning' : 'reading';
    } else {
      this.activeTaskType = Math.random() < 0.5 ? 'meaning' : 'reading';
    }
  }

  markAnswer(correct: boolean): MarkResult {
    const task = this.currentItem;
    const taskType = this.activeTaskType;
    if (!task || !taskType) {
      return { subjectFinished: false, correct };
    }

    if (taskType === 'meaning') {
      if (!task.meaningWrong) {
        task.meaningWrong = !correct;
      }
      task.answeredMeaning = correct;
      if (!correct) {
        task.meaningWrongCount += 1;
      }
    } else {
      if (!task.readingWrong) {
        task.readingWrong = !correct;
      }
      task.answeredReading = correct;
      if (!correct) {
        task.readingWrongCount += 1;
      }
    }

    this._tasksAnswered += 1;
    if (correct) {
      this._tasksAnsweredCorrectly += 1;
      task.returnDelay = 0;
    } else {
      if (!this._settings.groupMeaningReading && !this._isPracticeSession) {
        task.returnDelay = 5;
      }
    }

    const answeredReading = task.answeredReading || !canAskReading(task, this._settings);
    const subjectFinished =
      (task.answeredMeaning || task.subject.meanings.length === 0) &&
      answeredReading;

    if (subjectFinished) {
      if (this._settings.minimizeReviewPenalty) {
        if (task.meaningWrong) {
          task.meaningWrongCount = 1;
        }
        if (task.readingWrong) {
          task.readingWrongCount = 1;
        }
      }

      this._reviewsCompleted += 1;
      this.completedReviews.push(task);
      this.activeQueue.splice(this.activeTaskIndex, 1);
      this.refillActiveQueue();
    }

    return { subjectFinished, correct };
  }

  overrideCorrect(): MarkResult {
    const task = this.currentItem;
    const taskType = this.activeTaskType;
    if (!task || !taskType) {
      return { subjectFinished: false, correct: true };
    }

    if (taskType === 'meaning') {
      task.meaningWrong = false;
      if (task.meaningWrongCount > 0) {
        task.meaningWrongCount -= 1;
      }
      task.answeredMeaning = true;
    } else {
      task.readingWrong = false;
      if (task.readingWrongCount > 0) {
        task.readingWrongCount -= 1;
      }
      task.answeredReading = true;
    }

    this._tasksAnsweredCorrectly += 1;
    task.returnDelay = 0;

    return this.finalizeIfFinished(task);
  }

  addSynonym(text: string): MarkResult {
    const task = this.currentItem;
    if (!task) {
      return { subjectFinished: false, correct: true };
    }

    if (!task.studyMaterials) {
      task.studyMaterials = { meaningSynonyms: [] };
    }
    const existing = task.studyMaterials.meaningSynonyms ?? [];
    task.studyMaterials.meaningSynonyms = [...existing, text];

    return this.overrideCorrect();
  }

  private finalizeIfFinished(task: ReviewItem): MarkResult {
    const answeredReading = task.answeredReading || !canAskReading(task, this._settings);
    const subjectFinished =
      (task.answeredMeaning || task.subject.meanings.length === 0) &&
      answeredReading;

    if (subjectFinished) {
      if (this._settings.minimizeReviewPenalty) {
        if (task.meaningWrong) {
          task.meaningWrongCount = 1;
        }
        if (task.readingWrong) {
          task.readingWrongCount = 1;
        }
      }

      this._reviewsCompleted += 1;
      this.completedReviews.push(task);
      this.activeQueue.splice(this.activeTaskIndex, 1);
      this.refillActiveQueue();
    }

    return { subjectFinished, correct: true };
  }

  moveActiveTaskToEnd(): void {
    const task = this.currentItem;
    if (!task) {
      return;
    }

    this.activeQueue.splice(this.activeTaskIndex, 1);
    task.answeredMeaning = false;
    task.answeredReading = false;
    task.meaningWrong = false;
    task.readingWrong = false;
    task.meaningWrongCount = 0;
    task.readingWrongCount = 0;
    task.returnDelay = 0;
    this.reviewQueue.push(task);
    this.refillActiveQueue();
  }

  setWrappingUp(value: boolean): void {
    this._wrappingUp = value;
    if (value) {
      const current = this.currentItem;
      const remaining: ReviewItem[] = [];

      for (const item of this.activeQueue) {
        if (item === current) {
          continue;
        }
        const hasAttempts =
          item.answeredMeaning ||
          item.answeredReading ||
          item.meaningWrongCount > 0 ||
          item.readingWrongCount > 0;
        if (!hasAttempts) {
          item.answeredMeaning = false;
          item.answeredReading = false;
          item.returnDelay = 0;
          this.reviewQueue.push(item);
        } else {
          remaining.push(item);
        }
      }

      this.activeQueue = current ? [current, ...remaining] : remaining;
      this.activeTaskIndex = 0;
    }
  }

  private refillActiveQueue(): void {
    if (this._wrappingUp) {
      return;
    }

    while (this.activeQueue.length < this.activeQueueSize && this.reviewQueue.length > 0) {
      const item = this.reviewQueue.shift()!;
      this.activeQueue.push(item);
    }
  }
}
