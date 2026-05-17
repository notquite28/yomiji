import { NativeStackScreenProps } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnswerCheckResult, checkAnswer, TaskType } from '../domain/answers/answerChecker';
import { convertRomajiToKanaInput } from '../domain/answers/kanaInput';
import { correctAnswerText, feedbackTitle } from '../domain/answers/feedbackMessages';
import { playVocabularyAudio, stopVocabularyAudio } from '../domain/audio/vocabularyAudio';
import { openAppDatabase } from '../domain/db/database';
import { AppSettings, defaultSettings, loadSettings } from '../domain/settings/settings';
import {
  MarkResult,
  ReviewItem,
  ReviewSession,
  ReviewSessionSettings,
} from '../domain/study/reviewSession';
import { findBySubjectId } from '../domain/db/studyMaterialRepository';
import { getSubjectsByIds } from '../domain/db/subjectRepository';
import { getBurnedItemPracticeQueue, getLeechPracticeQueue, getRecentMistakePracticeQueue, getReviewQueue, queueReviewResult, queueStudyMaterialUpdate, StudyQueueItem } from '../domain/study/studyRepository';
import { CenteredMessage, ScreenLayout, SessionHeader } from '../components/ScreenLayout';
import { SubjectDetailsContent } from '../components/SubjectDetailsContent';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { ReviewQuickSettings } from '../components/ReviewQuickSettings';
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

type PracticeSource = NonNullable<RootStackParamList['ReviewSession']>['practiceSource'];

function getQueueForSource(db: Awaited<ReturnType<typeof openAppDatabase>>, source: PracticeSource, settings: AppSettings) {
  if (source === 'recentMistakes') {
    return getRecentMistakePracticeQueue(db);
  }
  if (source === 'apprenticeLeeches') {
    return getLeechPracticeQueue(db, { apprenticeOnly: true, threshold: settings.leechThreshold });
  }
  if (source === 'allLeeches') {
    return getLeechPracticeQueue(db, { threshold: settings.leechThreshold });
  }
  if (source === 'burnedItems') {
    return getBurnedItemPracticeQueue(db);
  }
  return getReviewQueue(db);
}

function emptyStateLabel(source: PracticeSource) {
  if (source === 'recentMistakes') {
    return 'No recent mistakes are available for practice.';
  }
  if (source === 'apprenticeLeeches') {
    return 'No apprentice leeches are available for practice.';
  }
  if (source === 'allLeeches') {
    return 'No leeches are available for practice.';
  }
  if (source === 'burnedItems') {
    return 'No burned items are available for practice.';
  }
  return 'No reviews are available in the local cache.';
}

export function ReviewSessionScreen({ navigation, route }: Props) {
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
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings);
  const [userLevel, setUserLevel] = useState<number | undefined>(undefined);
  const [ankiRevealed, setAnkiRevealed] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [audioMessage, setAudioMessage] = useState<string | null>(null);
  const [subjectDetailData, setSubjectDetailData] = useState<{
    componentSubjects: Map<number, import('../domain/answers/answerChecker').SubjectAnswerData>;
    amalgamationSubjects: Map<number, import('../domain/answers/answerChecker').SubjectAnswerData>;
    studyMaterial: { meaningSynonyms: string[]; meaningNote: string; readingNote: string };
  } | null>(null);

  const sessionRef = useRef<ReviewSession | null>(null);
  const practiceSource = route.params?.practiceSource;

  const settings = useMemo<ReviewSessionSettings>(
    () => ({
      reviewOrder: appSettings.reviewOrder,
      reviewBatchSize: appSettings.reviewBatchSize,
      reviewItemsLimit: appSettings.reviewItemsLimit,
      reviewItemsLimitEnabled: appSettings.reviewItemsLimitEnabled,
      groupMeaningReading: appSettings.groupMeaningReading,
      meaningFirst: appSettings.meaningFirst,
      minimizeReviewPenalty: appSettings.minimizeReviewPenalty,
      enableCheats: appSettings.enableCheats,
      ankiMode: appSettings.ankiMode,
    }),
    [appSettings],
  );

  const ankiMode = appSettings.ankiMode;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const loaded = await loadSettings();
        if (!isMounted) return;
        setAppSettings(loaded);
        const db = await openAppDatabase();
        const [items, userRow] = await Promise.all([
          getQueueForSource(db, practiceSource, loaded),
          db.getFirstAsync<{ level: number }>('SELECT level FROM user WHERE id = 1'),
        ]);
        if (!isMounted) return;
        setQueueItems(items);
        setUserLevel(userRow?.level);
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [practiceSource]);

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

    const session = new ReviewSession(queueItems, settings, Boolean(practiceSource), availableAtMap, userLevel);
    sessionRef.current = session;
    session.nextTask();
    setRevision((r) => r + 1);
  }, [practiceSource, queueItems, settings, userLevel]);

  useEffect(() => () => {
    stopVocabularyAudio().catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    NetInfo.fetch().then((state) => {
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    }).catch(() => {});
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!feedback?.item) {
      setSubjectDetailData(null);
      setShowAllDetails(false);
      setAudioMessage(null);
      return;
    }

    let isMounted = true;
    const item = feedback.item;
    (async () => {
      try {
        const db = await openAppDatabase();
        const compIds = item.subject.componentSubjectIds ?? [];
        const amalIds = (item.subject.amalgamationSubjectIds ?? []).slice(0, 10);
        const [compMap, amalMap] = await Promise.all([
          compIds.length > 0 ? getSubjectsByIds(db, compIds) : Promise.resolve(new Map()),
          amalIds.length > 0 ? getSubjectsByIds(db, amalIds) : Promise.resolve(new Map()),
        ]);
        const sm = await findBySubjectId(db, item.subjectId);
        const studyMaterial = sm
          ? (() => {
              const parsed = JSON.parse(sm.payload) as { data: { meaning_synonyms?: string[]; meaning_note?: string; reading_note?: string } };
              return { meaningSynonyms: parsed.data.meaning_synonyms ?? [], meaningNote: parsed.data.meaning_note ?? '', readingNote: parsed.data.reading_note ?? '' };
            })()
          : { meaningSynonyms: [] as string[], meaningNote: '', readingNote: '' };

        if (isMounted) {
          setSubjectDetailData({ componentSubjects: compMap, amalgamationSubjects: amalMap, studyMaterial });
        }
      } catch {
        if (isMounted) {
          setSubjectDetailData(null);
        }
      }
    })();
    return () => { isMounted = false; };
  }, [feedback?.item?.subjectId]);

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
  const allowLeavingRef = useRef(false);

  const handleBack = () => {
    if (!session || isComplete) {
      navigation.goBack();
      return;
    }

    Alert.alert(
      'End review session?',
      'Progress from this active session may be lost if you leave now.',
      [
        { text: 'Keep reviewing', style: 'cancel' },
        {
          text: 'End session',
          style: 'destructive',
          onPress: () => {
            allowLeavingRef.current = true;
            navigation.goBack();
          },
        },
      ],
    );
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!session || isComplete || allowLeavingRef.current) {
        return;
      }

      event.preventDefault();
      Alert.alert(
        'End review session?',
        'Progress from this active session may be lost if you leave now.',
        [
          { text: 'Keep reviewing', style: 'cancel' },
          {
            text: 'End session',
            style: 'destructive',
            onPress: () => {
              allowLeavingRef.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ],
      );
    });

    return unsubscribe;
  }, [isComplete, navigation, session]);

  const subjectLookup = useMemo(
    () => new Map(queueItems.map((item) => [item.subjectId, item.subject])),
    [queueItems],
  );

  const shouldShowAnkiReveal = ankiMode && !feedback && !ankiRevealed;

  const playAudioForItem = (item: ReviewItem) => {
    if (item.subjectType !== 'vocabulary') {
      return;
    }
    if (isOffline) {
      setAudioMessage('Audio streaming is unavailable while offline.');
      return;
    }

    openAppDatabase()
      .then((db) => playVocabularyAudio(db, item.subjectId, {
        interruptBackgroundAudio: appSettings.interruptBackgroundAudio,
        preferredVoiceActorId: appSettings.preferredVoiceActorId,
      }))
      .then((played) => {
        setAudioMessage(played ? null : 'No audio is available for this vocabulary item.');
      })
      .catch(() => {
        setAudioMessage('Audio could not be played. Check your connection and try again.');
      });
  };

  const maybeAutoplayAudio = (item: ReviewItem, answeredTaskType: TaskType, correct: boolean) => {
    if (!correct || !appSettings.playAudioAutomatically || isOffline) {
      return;
    }
    if (answeredTaskType !== 'reading' && (item.subject.readings?.length ?? 0) > 0) {
      return;
    }

    playAudioForItem(item);
  };

  const submit = () => {
    if (!session || !currentItem || feedback) {
      return;
    }

    if (ankiMode && !ankiRevealed) {
      setAnkiRevealed(true);
      return;
    }

    if (!ankiMode && !answer.trim()) {
      return;
    }

    const result = checkAnswer(answer, currentItem.subject, {
      taskType: taskType ?? 'meaning',
      studyMaterials: currentItem.studyMaterials,
      lookupSubject: (subjectId) => subjectLookup.get(subjectId),
      exactMatch: appSettings.exactMatch,
    });
    const correct = result.kind === 'precise' || result.kind === 'imprecise';

    const answeredTaskType = taskType ?? 'meaning';
    const markResult = session.markAnswer(correct);
    setLastMarkResult(markResult);
    setFeedback({
      correct,
      message: feedbackTitle(result),
      detail: correct
        ? 'Continue to the next prompt.'
        : correctAnswerText(currentItem, answeredTaskType),
      item: currentItem,
      taskType: answeredTaskType,
      subjectFinished: markResult.subjectFinished,
    });
    maybeAutoplayAudio(currentItem, answeredTaskType, correct);
    setRevision((r) => r + 1);
  };

  const handleAnkiMark = (correct: boolean) => {
    if (!session || !currentItem || feedback) {
      return;
    }

    const answeredTaskType = taskType ?? 'meaning';
    const markResult = session.markAnswer(correct);
    setLastMarkResult(markResult);
    setFeedback({
      correct,
      message: correct ? 'Correct' : 'Incorrect',
      detail: correct
        ? 'Continue to the next prompt.'
        : combinedAnkiAnswerText(currentItem),
      item: currentItem,
      taskType: answeredTaskType,
      subjectFinished: markResult.subjectFinished,
    });
    maybeAutoplayAudio(currentItem, answeredTaskType, correct);
    setAnkiRevealed(false);
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
      setAnkiRevealed(false);
      session.nextTask();
      setRevision((r) => r + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsContinuing(false);
    }
  };

  const handleOverrideCorrect = () => {
    if (!session || !feedback || feedback.correct || isContinuing) {
      return;
    }

    const result = session.overrideCorrect();
    setLastMarkResult(result);
    setFeedback({
      ...feedback,
      correct: true,
      message: 'Correct',
      detail: 'Answer overridden as correct.',
      subjectFinished: result.subjectFinished,
    });
    setRevision((r) => r + 1);
  };

  const handleAskAgainLater = async () => {
    if (!session || !feedback || isContinuing) {
      return;
    }

    setIsContinuing(true);
    setError(null);

    try {
      session.moveActiveTaskToEnd();
      setFeedback(null);
      setAnswer('');
      setLastMarkResult(null);
      setAnkiRevealed(false);
      session.nextTask();
      setRevision((r) => r + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsContinuing(false);
    }
  };

  const handleAddSynonym = async () => {
    if (!session || !feedback || feedback.correct || isContinuing) {
      return;
    }
    if (feedback.taskType !== 'meaning' || !answer.trim()) {
      return;
    }

    setIsContinuing(true);
    setError(null);

    try {
      const result = session.addSynonym(answer.trim());
      setLastMarkResult(result);
      setFeedback({
        ...feedback,
        correct: true,
        message: 'Synonym added',
        detail: `"${answer.trim()}" added as a meaning synonym. Answer marked correct.`,
        subjectFinished: result.subjectFinished,
      });

      const item = session.currentItem ?? feedback.item;
      const db = await openAppDatabase();
      await queueStudyMaterialUpdate(db, {
        subjectId: item.subjectId,
        meaningSynonyms: item.studyMaterials?.meaningSynonyms ?? [answer.trim()],
      });

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

  const handleQuickSettingsChange = (next: AppSettings) => {
    setAppSettings(next);
    setRevision((r) => r + 1);
  };

  const handleQuickWrapUp = () => {
    setQuickSettingsOpen(false);
    if (!feedback) {
      wrapUp();
    }
  };

  const handleEndSession = () => {
    setQuickSettingsOpen(false);
    navigation.goBack();
  };

  const enableCheats = settings.enableCheats;
  const showCheats = enableCheats && feedback && !feedback.correct;
  const canAddSynonym = showCheats && feedback?.taskType === 'meaning' && answer.trim().length > 0;

  if (isLoading) {
    return <CenteredMessage label={practiceSource ? 'Loading practice...' : 'Loading reviews...'} />;
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
        label={emptyStateLabel(practiceSource)}
        actionLabel="Back"
        onAction={() => navigation.goBack()}
      />
    );
  }

  const acceptedMeanings = displayItem.subject.meanings
    .filter((m) => m.acceptedAnswer !== false && m.type !== 'blacklist')
    .map((m) => m.meaning)
    .join(', ');
  const acceptedReadings = displayItem.subject.readings
    ?.filter((r) => r.acceptedAnswer !== false)
    .map((r) => r.reading)
    .join(', ') ?? '';
  const showsReadingInAnki = Boolean(acceptedReadings);

  return (
    <ScreenLayout scrollable keyboardShouldPersistTaps>
      <SessionHeader
        onBack={handleBack}
        progress={progress}
        onSettings={() => setQuickSettingsOpen(true)}
      />

      <SubjectHeroCard
        kicker={ankiMode && showsReadingInAnki ? 'Meaning + Reading' : displayTaskType === 'meaning' ? 'Meaning' : 'Reading'}
        japanese={displayItem.subject.japanese}
        characterImageUrl={displayItem.subject.characterImageUrl}
        characterImageIsSvg={displayItem.subject.characterImageIsSvg}
        subjectType={displayItem.subjectType}
        level={displayItem.level}
        color={subjectColor}
      />

      {ankiMode ? (
        shouldShowAnkiReveal ? (
          <Pressable
            onPress={() => setAnkiRevealed(true)}
            style={({ pressed }) => [
              styles.ankiRevealButton,
              { borderColor: subjectColor },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.ankiRevealButtonText}>Show Answer</Text>
          </Pressable>
        ) : ankiRevealed && !feedback ? (
          <View style={[styles.ankiAnswerCard, { borderColor: subjectColor }]}>
            <Text style={styles.ankiAnswerLabel}>
              Meaning
            </Text>
            <Text style={styles.ankiAnswerText}>{acceptedMeanings}</Text>
            {showsReadingInAnki ? (
              <>
                <Text style={[styles.ankiAnswerLabel, styles.ankiAnswerSecondaryLabel]}>Reading</Text>
                <Text style={styles.ankiAnswerText}>{acceptedReadings}</Text>
              </>
            ) : null}
          </View>
        ) : null
      ) : (
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
          placeholder={displayTaskType === 'meaning' ? 'Type the meaning' : '答え'}
          placeholderTextColor={theme.colors.mutedText}
          style={styles.input}
          returnKeyType="done"
          accessibilityLabel={displayTaskType === 'meaning' ? 'Review meaning answer' : 'Review reading answer'}
          accessibilityHint="Enter your answer for the current review prompt."
          onSubmitEditing={submit}
        />
      )}

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
          {feedback.item.subjectType === 'vocabulary' ? (
            <>
              <Pressable
                disabled={isOffline}
                onPress={() => playAudioForItem(feedback.item)}
                style={({ pressed }) => [
                  styles.audioButton,
                  isOffline && styles.audioButtonDisabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={isOffline ? 'Vocabulary audio unavailable offline' : 'Play vocabulary audio'}
              >
                <Text style={[styles.audioButtonText, isOffline && styles.audioButtonTextDisabled]}>
                  {isOffline ? 'Audio unavailable offline' : 'Play Audio'}
                </Text>
              </Pressable>
              {audioMessage ? <Text style={styles.audioMessage}>{audioMessage}</Text> : null}
            </>
          ) : null}
        </View>
      ) : null}

      {ankiMode && ankiRevealed && !feedback ? (
        <View style={styles.ankiMarkGroup}>
          <Pressable
            onPress={() => handleAnkiMark(false)}
            style={({ pressed }) => [
              styles.ankiMarkButton,
              { backgroundColor: theme.colors.danger },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.ankiMarkButtonText}>Incorrect</Text>
          </Pressable>
          <Pressable
            onPress={() => handleAnkiMark(true)}
            style={({ pressed }) => [
              styles.ankiMarkButton,
              { backgroundColor: theme.colors.success },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.ankiMarkButtonText}>Correct</Text>
          </Pressable>
        </View>
      ) : null}

      {!ankiMode ? (
        showCheats ? (
          <View style={styles.cheatGroup}>
            <Pressable
              disabled={isContinuing}
              onPress={handleOverrideCorrect}
              style={({ pressed }) => [
                styles.cheatButton,
                { borderColor: theme.colors.border },
                (pressed || isContinuing) && styles.pressed,
              ]}
            >
              <Text style={styles.cheatButtonText}>My answer was correct</Text>
            </Pressable>
            <Pressable
              disabled={isContinuing}
              onPress={handleAskAgainLater}
              style={({ pressed }) => [
                styles.cheatButton,
                { borderColor: theme.colors.border },
                (pressed || isContinuing) && styles.pressed,
              ]}
            >
              <Text style={styles.cheatButtonText}>Try again later</Text>
            </Pressable>
            {canAddSynonym ? (
              <Pressable
                disabled={isContinuing}
                onPress={handleAddSynonym}
                style={({ pressed }) => [
                  styles.cheatButton,
                  { borderColor: theme.colors.border },
                  (pressed || isContinuing) && styles.pressed,
                ]}
              >
                <Text style={styles.cheatButtonText}>Add as synonym</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!ankiMode && (
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
            {feedback
              ? (isContinuing
                ? 'Saving...'
                : feedback.correct
                  ? 'Continue'
                  : 'Got it wrong')
              : 'Submit Answer'}
          </Text>
        </Pressable>
      )}

      {ankiMode && feedback && (
        <Pressable
          disabled={isContinuing}
          onPress={continueSession}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: subjectColor },
            (pressed || isContinuing) && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isContinuing ? 'Saving...' : 'Continue'}
          </Text>
        </Pressable>
      )}

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

      {feedback && subjectDetailData && displayItem ? (
        showAllDetails || appSettings.showFullAnswer ? (
          <SubjectDetailsContent
            subject={displayItem.subject}
            componentSubjects={subjectDetailData.componentSubjects}
            amalgamationSubjects={subjectDetailData.amalgamationSubjects}
            studyMaterial={subjectDetailData.studyMaterial}
            meaningAttempted={true}
            readingAttempted={true}
            showFullAnswer={true}
            isReview={true}
            useKatakanaForOnyomi={appSettings.useKatakanaForOnyomi}
            showAllReadings={appSettings.showAllReadings}
            onNavigateToSubject={(id) => navigation.navigate('SubjectDetail', { subjectId: id })}
          />
        ) : (
          <InlineReviewDetails
            item={displayItem}
            taskType={feedback.taskType}
            subjectDetailData={subjectDetailData}
            onShowAll={() => setShowAllDetails(true)}
            onNavigateToSubject={(id) => navigation.navigate('SubjectDetail', { subjectId: id })}
            appSettings={appSettings}
          />
        )
      ) : null}

      <ReviewQuickSettings
        visible={quickSettingsOpen}
        settings={appSettings}
        onSettingsChange={handleQuickSettingsChange}
        onClose={() => setQuickSettingsOpen(false)}
        onEndSession={handleEndSession}
        onWrapUp={handleQuickWrapUp}
        canWrapUp={session?.canWrapUp ?? false}
        wrappingUp={session?.wrappingUp ?? false}
        hasFeedback={feedback !== null}
        remainingInBatch={session?.activeQueueLength ?? 0}
      />
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

function combinedAnkiAnswerText(item: ReviewItem) {
  const meanings = item.subject.meanings
    .filter((meaning) => meaning.acceptedAnswer !== false && meaning.type !== 'blacklist')
    .map((meaning) => meaning.meaning)
    .join(', ');
  const readings = item.subject.readings
    ?.filter((reading) => reading.acceptedAnswer !== false)
    .map((reading) => reading.reading)
    .join(', ') ?? '';

  if (!readings) {
    return `Accepted meanings: ${meanings}`;
  }
  return `Accepted meanings: ${meanings}. Accepted readings: ${readings}`;
}

function InlineReviewDetails({
  item,
  taskType,
  subjectDetailData,
  onShowAll,
  onNavigateToSubject,
  appSettings,
}: {
  item: ReviewItem;
  taskType: TaskType;
  subjectDetailData: {
    componentSubjects: Map<number, import('../domain/answers/answerChecker').SubjectAnswerData>;
    amalgamationSubjects: Map<number, import('../domain/answers/answerChecker').SubjectAnswerData>;
    studyMaterial: { meaningSynonyms: string[]; meaningNote: string; readingNote: string };
  };
  onShowAll: () => void;
  onNavigateToSubject: (subjectId: number) => void;
  appSettings: AppSettings;
}) {
  const meaningAttempted = taskType === 'meaning' || item.answeredMeaning || item.meaningWrong;
  const readingAttempted = taskType === 'reading' || item.answeredReading || item.readingWrong;

  const hasHidden = !meaningAttempted || !readingAttempted;

  return (
    <View style={{ gap: 12 }}>
      <SubjectDetailsContent
        subject={item.subject}
        componentSubjects={subjectDetailData.componentSubjects}
        amalgamationSubjects={subjectDetailData.amalgamationSubjects}
        studyMaterial={subjectDetailData.studyMaterial}
        meaningAttempted={meaningAttempted}
        readingAttempted={readingAttempted}
        showFullAnswer={false}
        isReview={true}
        useKatakanaForOnyomi={appSettings.useKatakanaForOnyomi}
        showAllReadings={appSettings.showAllReadings}
        onNavigateToSubject={onNavigateToSubject}
      />
      {hasHidden ? (
        <Pressable
          onPress={onShowAll}
          style={({ pressed }) => [
            {
              alignItems: 'center',
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: 'rgba(128, 128, 128, 0.08)',
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text style={{ color: '#666', fontSize: 13, fontWeight: '800' }}>Show all information</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
    audioButton: {
      alignSelf: 'flex-start',
      marginTop: 4,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    audioButtonText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '900',
    },
    audioButtonDisabled: {
      opacity: 0.6,
    },
    audioButtonTextDisabled: {
      color: theme.colors.mutedText,
    },
    audioMessage: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
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
    cheatGroup: {
      gap: 10,
    },
    cheatButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
    },
    cheatButtonText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '800',
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
    ankiRevealButton: {
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      borderWidth: 2,
      borderStyle: 'dashed',
      backgroundColor: theme.colors.surfaceElevated,
    },
    ankiRevealButtonText: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '800',
    },
    ankiAnswerCard: {
      borderRadius: 18,
      borderWidth: 2,
      backgroundColor: theme.colors.surfaceElevated,
      padding: 16,
      gap: 4,
    },
    ankiAnswerLabel: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    ankiAnswerSecondaryLabel: {
      marginTop: 8,
    },
    ankiAnswerText: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '900',
    },
    ankiMarkGroup: {
      flexDirection: 'row',
      gap: 12,
    },
    ankiMarkButton: {
      flex: 1,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
    },
    ankiMarkButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },
  });
}
