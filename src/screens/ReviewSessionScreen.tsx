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
      <CenteredMessage
        label={`Reviews complete!\n${rate} accuracy across ${completed} reviews.`}
        actionLabel="Back to Dashboard"
        onAction={() => navigation.goBack()}
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
    </ScreenLayout>
  );
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
    pressed: {
      opacity: 0.58,
    },
  });
}
