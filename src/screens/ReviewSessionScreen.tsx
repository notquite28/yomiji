import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnswerCheckResult, checkAnswer, TaskType } from '../domain/answers/answerChecker';
import { convertRomajiToKanaInput } from '../domain/answers/kanaInput';
import { openAppDatabase } from '../domain/db/database';
import { defaultSettings } from '../domain/settings/settings';
import {
  MarkResult,
  ReviewItem,
  ReviewSession,
  ReviewSessionSettings,
} from '../domain/study/reviewSession';
import { getReviewQueue, queueReviewResult, StudyQueueItem } from '../domain/study/studyRepository';
import { CenteredMessage, ScreenLayout, SessionHeader } from '../components/ScreenLayout';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewSession'>;
type Feedback = {
  correct: boolean;
  message: string;
  detail: string;
  item: ReviewItem;
  taskType: TaskType;
  subjectFinished: boolean;
};

export function ReviewSessionScreen({ navigation }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [queueItems, setQueueItems] = useState<StudyQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastMarkResult, setLastMarkResult] = useState<MarkResult | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [revision, setRevision] = useState(0);

  const sessionRef = useRef<ReviewSession | null>(null);

  const settings = useMemo<ReviewSessionSettings>(
    () => ({
      reviewOrder: defaultSettings.reviewOrder,
      reviewBatchSize: defaultSettings.reviewBatchSize,
      reviewItemsLimit: defaultSettings.reviewItemsLimit,
      reviewItemsLimitEnabled: defaultSettings.reviewItemsLimitEnabled,
      groupMeaningReading: defaultSettings.groupMeaningReading,
      meaningFirst: defaultSettings.meaningFirst,
      minimizeReviewPenalty: defaultSettings.minimizeReviewPenalty,
      skipKanjiReadings: defaultSettings.skipKanjiReadings,
    }),
    [],
  );

  useEffect(() => {
    let isMounted = true;
    openAppDatabase()
      .then((db) => getReviewQueue(db))
      .then((items) => {
        if (isMounted) {
          setQueueItems(items);
        }
      })
      .catch((caught: unknown) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (queueItems.length === 0 || sessionRef.current) {
      return;
    }

    const availableAtMap = new Map<number, string>();
    for (const item of queueItems) {
      if (item.availableAt) {
        availableAtMap.set(item.assignmentId, item.availableAt);
      }
    }

    const session = new ReviewSession(queueItems, settings, false, availableAtMap);
    sessionRef.current = session;
    session.nextTask();
    setRevision((r) => r + 1);
  }, [queueItems, settings]);

  const session = sessionRef.current;
  const currentItem = session?.currentItem ?? null;
  const taskType = session?.currentTaskType ?? null;
  const displayItem = feedback?.item ?? currentItem;
  const displayTaskType = feedback?.taskType ?? taskType;
  const subjectColor = displayItem
    ? colorForSubjectType(theme.colors, displayItem.subjectType)
    : theme.colors.vocabulary;
  const isComplete = !feedback && (session?.isComplete ?? false);
  const progress = session
    ? `${Math.min(session.reviewsCompleted + (feedback?.subjectFinished ? 0 : 1), session.totalReviews)}/${session.totalReviews}`
    : '0/0';
  const completedItems = session?.completedItems ?? [];

  const subjectLookup = useMemo(
    () => new Map(queueItems.map((item) => [item.subjectId, item.subject])),
    [queueItems],
  );

  const submit = () => {
    if (!session || !currentItem || !answer.trim() || feedback) {
      return;
    }

    const result = checkAnswer(answer, currentItem.subject, {
      taskType: taskType ?? 'meaning',
      studyMaterials: currentItem.studyMaterials,
      lookupSubject: (subjectId) => subjectLookup.get(subjectId),
    });
    const correct = result.kind === 'precise' || result.kind === 'imprecise';

    const markResult = session.markAnswer(correct);
    setLastMarkResult(markResult);
    setFeedback({
      correct,
      message: feedbackTitle(result),
      detail: correct
        ? 'Continue to the next prompt.'
        : correctAnswerText(currentItem, taskType ?? 'meaning'),
      item: currentItem,
      taskType: taskType ?? 'meaning',
      subjectFinished: markResult.subjectFinished,
    });
    setRevision((r) => r + 1);
  };

  const changeAnswer = (text: string) => {
    setAnswer(taskType === 'reading' ? convertRomajiToKanaInput(text) : text);
  };

  const continueSession = async () => {
    if (!session || !feedback || isContinuing) {
      return;
    }

    setIsContinuing(true);
    setError(null);

    try {
      if (lastMarkResult?.subjectFinished && !session.isPracticeSession) {
        const item = session.completedItems[session.completedItems.length - 1];
        if (item) {
          const db = await openAppDatabase();
          await queueReviewResult(db, {
            assignmentId: item.assignmentId,
            incorrectMeaningAnswers: item.meaningWrongCount,
            incorrectReadingAnswers: item.readingWrongCount,
          });
        }
      }

      setFeedback(null);
      setAnswer('');
      setLastMarkResult(null);
      session.nextTask();
      setRevision((r) => r + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsContinuing(false);
    }
  };

  const wrapUp = () => {
    if (!session || feedback || session.wrappingUp || !session.canWrapUp) {
      return;
    }
    session.setWrappingUp(true);
    session.nextTask();
    setRevision((r) => r + 1);
  };

  if (isLoading) {
    return <CenteredMessage label="Loading reviews..." />;
  }

  if (error && !displayItem && !isComplete) {
    return (
      <CenteredMessage label={error} actionLabel="Back" onAction={() => navigation.goBack()} />
    );
  }

  if (isComplete) {
    const rate = session?.successRateText ?? '100%';
    const completed = session?.reviewsCompleted ?? 0;
    return (
      <ReviewSummary
        completed={completed}
        successRate={rate}
        completedItems={completedItems}
        wrappedUp={session?.wrappingUp ?? false}
        onBack={() => navigation.goBack()}
      />
    );
  }

  if (!displayItem) {
    return (
      <CenteredMessage
        label="No reviews are available in the local cache."
        actionLabel="Back"
        onAction={() => navigation.goBack()}
      />
    );
  }

  return (
    <ScreenLayout scrollable keyboardShouldPersistTaps>
      <SessionHeader onBack={() => navigation.goBack()} progress={progress} />

      <SubjectHeroCard
        kicker={displayTaskType === 'meaning' ? 'Meaning' : 'Reading'}
        japanese={displayItem.subject.japanese}
        characterImageUrl={displayItem.subject.characterImageUrl}
        characterImageIsSvg={displayItem.subject.characterImageIsSvg}
        subjectType={displayItem.subjectType}
        level={displayItem.level}
        color={subjectColor}
      />

      <TextInput
        value={answer}
        onChangeText={changeAnswer}
        editable={!feedback}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        spellCheck={false}
        importantForAutofill="no"
        keyboardType={displayTaskType === 'meaning' ? 'visible-password' : 'default'}
        placeholder={displayTaskType === 'meaning' ? 'Type the meaning' : 'Type the reading in kana'}
        placeholderTextColor={theme.colors.mutedText}
        style={styles.input}
        returnKeyType="done"
        onSubmitEditing={submit}
      />

      {feedback ? (
        <View
          style={[
            styles.feedbackCard,
            { borderColor: feedback.correct ? theme.colors.success : theme.colors.danger },
          ]}
        >
          <Text
            style={[
              styles.feedbackTitle,
              { color: feedback.correct ? theme.colors.success : theme.colors.danger },
            ]}
          >
            {feedback.message}
          </Text>
          <Text style={styles.feedbackDetail}>{feedback.detail}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        disabled={isContinuing || (!feedback && !answer.trim())}
        onPress={feedback ? continueSession : submit}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: subjectColor },
          (pressed || isContinuing || (!feedback && !answer.trim())) && styles.pressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {feedback ? (isContinuing ? 'Saving...' : 'Continue') : 'Submit Answer'}
        </Text>
      </Pressable>

      {session?.canWrapUp && !session.wrappingUp ? (
        <Pressable
          disabled={Boolean(feedback) || isContinuing}
          onPress={wrapUp}
          style={({ pressed }) => [styles.secondaryButton, (pressed || Boolean(feedback) || isContinuing) && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>Wrap Up</Text>
        </Pressable>
      ) : null}

      {session?.wrappingUp ? <Text style={styles.wrapUpText}>Wrap-up mode: finish the current review batch. No new reviews will be added.</Text> : null}
    </ScreenLayout>
  );
}

function ReviewSummary({
  completed,
  successRate,
  completedItems,
  wrappedUp,
  onBack,
}: {
  completed: number;
  successRate: string;
  completedItems: readonly ReviewItem[];
  wrappedUp: boolean;
  onBack: () => void;
}) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const incorrectItems = completedItems.filter((item) => item.meaningWrongCount > 0 || item.readingWrongCount > 0);
  const incorrectByLevel = groupIncorrectByLevel(incorrectItems);

  return (
    <ScreenLayout scrollable>
      <SessionHeader onBack={onBack} progress="Complete" />

      <View style={styles.summaryHero}>
        <Text style={styles.summaryKicker}>{wrappedUp ? 'Wrap-Up Complete' : 'Reviews Complete'}</Text>
        <Text style={styles.summaryRate}>{successRate}</Text>
        <Text style={styles.summaryMeta}>{completed} reviews completed</Text>
      </View>

      <View style={styles.summaryStatsRow}>
        <SummaryStat label="Correct" value={String(Math.max(0, completedItems.length - incorrectItems.length))} />
        <SummaryStat label="Needs Review" value={String(incorrectItems.length)} />
      </View>

      <View style={styles.summaryPanel}>
        <Text style={styles.summaryPanelTitle}>Incorrect Items</Text>
        {incorrectByLevel.length ? (
          incorrectByLevel.map((group) => (
            <View key={group.level} style={styles.levelGroup}>
              <Text style={styles.levelTitle}>{group.level}</Text>
              {group.items.map((item) => (
                <View key={item.assignmentId} style={styles.incorrectRow}>
                  <Text style={styles.incorrectName}>{primaryMeaning(item) || item.subject.japanese || item.subjectType}</Text>
                  <Text style={styles.incorrectCounts}>{wrongCountText(item)}</Text>
                </View>
              ))}
            </View>
          ))
        ) : (
          <Text style={styles.summaryEmpty}>No incorrect answers this session.</Text>
        )}
      </View>

      <Pressable onPress={onBack} style={[styles.primaryButton, styles.summaryActionButton]}>
        <Text style={styles.primaryButtonText}>Back to Dashboard</Text>
      </Pressable>
    </ScreenLayout>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryStatValue}>{value}</Text>
      <Text style={styles.summaryStatLabel}>{label}</Text>
    </View>
  );
}

function groupIncorrectByLevel(items: ReviewItem[]) {
  const groups = new Map<string, ReviewItem[]>();
  for (const item of items) {
    const key = `Level ${item.level ?? '?'}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([level, groupItems]) => ({ level, items: groupItems }));
}

function primaryMeaning(item: ReviewItem) {
  return item.subject.meanings.find((meaning) => meaning.acceptedAnswer !== false && meaning.type !== 'blacklist')?.meaning;
}

function wrongCountText(item: ReviewItem) {
  const parts: string[] = [];
  if (item.meaningWrongCount > 0) {
    parts.push(`${item.meaningWrongCount} meaning`);
  }
  if (item.readingWrongCount > 0) {
    parts.push(`${item.readingWrongCount} reading`);
  }
  return parts.join(' · ');
}

function feedbackTitle(result: AnswerCheckResult) {
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

function correctAnswerText(item: ReviewItem, taskType: TaskType) {
  if (taskType === 'reading') {
    return `Accepted readings: ${item.subject.readings?.filter((reading) => reading.acceptedAnswer !== false).map((reading) => reading.reading).join(', ') || 'none'}`;
  }
  return `Accepted meanings: ${item.subject.meanings.filter((meaning) => meaning.acceptedAnswer !== false && meaning.type !== 'blacklist').map((meaning) => meaning.meaning).join(', ')}`;
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    input: {
      minHeight: 58,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
      color: theme.colors.text,
      paddingHorizontal: 16,
      fontSize: 18,
      fontWeight: '700',
    },
    feedbackCard: {
      borderRadius: 22,
      borderWidth: 1,
      backgroundColor: theme.colors.surfaceElevated,
      padding: 16,
      gap: 6,
    },
    feedbackTitle: {
      fontSize: 18,
      fontWeight: '900',
    },
    feedbackDetail: {
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '700',
    },
    errorText: {
      color: theme.colors.danger,
      fontWeight: '800',
    },
    primaryButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      paddingHorizontal: 18,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },
    secondaryButton: {
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      paddingHorizontal: 18,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryButtonText: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '900',
    },
    wrapUpText: {
      color: theme.colors.mutedText,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    summaryHero: {
      minHeight: 210,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: theme.colors.kanji,
    },
    summaryKicker: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    summaryRate: {
      marginTop: 10,
      color: '#ffffff',
      fontSize: 64,
      fontWeight: '900',
    },
    summaryMeta: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '800',
      opacity: 0.86,
    },
    summaryStatsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    summaryStat: {
      flex: 1,
      borderRadius: 22,
      padding: 16,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    summaryStatValue: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: '900',
    },
    summaryStatLabel: {
      marginTop: 2,
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    summaryPanel: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 12,
    },
    summaryActionButton: {
      backgroundColor: theme.colors.kanji,
    },
    summaryPanelTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '900',
    },
    summaryEmpty: {
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '700',
    },
    levelGroup: {
      gap: 8,
    },
    levelTitle: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    incorrectRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      borderRadius: 16,
      padding: 12,
      backgroundColor: theme.colors.surface,
    },
    incorrectName: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    incorrectCounts: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '800',
    },
    pressed: {
      opacity: 0.58,
    },
  });
}
