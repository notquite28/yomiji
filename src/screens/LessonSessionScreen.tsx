import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnswerCheckResult, checkAnswer, TaskType, SubjectAnswerData } from '../domain/answers/answerChecker';
import { convertRomajiToKanaInput } from '../domain/answers/kanaInput';
import { correctAnswerText, feedbackTitle } from '../domain/answers/feedbackMessages';
import { openAppDatabase } from '../domain/db/database';
import { AppSettings } from '../domain/settings/settings';
import { useSettingsStore } from '../domain/settings/settingsStore';
import {
  chunkLessonItems,
  getLessonItemsByIds,
  getLessonQueue,
  queueLessonStart,
  StudyQueueItem,
} from '../domain/study/studyRepository';
import { getSubjectsByIds } from '../domain/db/subjectRepository';
import {
  MarkResult,
  ReviewItem,
  ReviewSession,
  ReviewSessionSettings,
} from '../domain/study/reviewSession';
import { CenteredMessage, ScreenLayout, SessionHeader } from '../components/ScreenLayout';
import { ConfirmLeaveBanner } from '../components/ConfirmLeaveBanner';
import { useConfirmLeave } from '../hooks/useConfirmLeave';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'LessonSession'>;
type LessonPhase = 'intro' | 'quiz';
type Feedback = {
  correct: boolean;
  message: string;
  detail: string;
  item: ReviewItem;
  taskType: TaskType;
  subjectFinished: boolean;
};

export function LessonSessionScreen({ navigation, route }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [queueItems, setQueueItems] = useState<StudyQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const settings = useSettingsStore();

  const [phase, setPhase] = useState<LessonPhase>('intro');
  const [introIndex, setIntroIndex] = useState(0);
  const [componentSubjects, setComponentSubjects] = useState<Map<number, SubjectAnswerData>>(new Map());
  const [batchIndex, setBatchIndex] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [completedTasksCorrectly, setCompletedTasksCorrectly] = useState(0);

  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);

  const sessionRef = useRef<ReviewSession | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const reviewSettings = useMemo<ReviewSessionSettings>(
    () => ({
      reviewOrder: settings.reviewOrder,
      reviewBatchSize: settings.reviewBatchSize,
      reviewItemsLimit: settings.reviewItemsLimit,
      reviewItemsLimitEnabled: settings.reviewItemsLimitEnabled,
      groupMeaningReading: settings.groupMeaningReading,
      meaningFirst: settings.meaningFirst,
      minimizeReviewPenalty: settings.minimizeReviewPenalty,
      enableCheats: false,
      ankiMode: false,
    }),
    [settings],
  );

  const subjectLookup = useMemo(
    () => {
      const map = new Map<number, SubjectAnswerData>();
      for (const item of queueItems) {
        map.set(item.subjectId, item.subject);
      }
      for (const [id, subject] of componentSubjects) {
        if (!map.has(id)) {
          map.set(id, subject);
        }
      }
      return map;
    },
    [queueItems, componentSubjects],
  );

  const lessonBatches = useMemo(
    () => chunkLessonItems(queueItems, settings.lessonBatchSize),
    [queueItems, settings.lessonBatchSize],
  );
  const activeBatch = lessonBatches[batchIndex] ?? [];

  useEffect(() => {
    let isMounted = true;
    const selectedIds = route.params?.selectedIds;
    const selectedSet = selectedIds ? new Set(selectedIds) : null;

    openAppDatabase()
      .then(async (db) => {
        const currentSettings = useSettingsStore.getState();
        const items = selectedSet && selectedSet.size > 0
          ? await getLessonItemsByIds(db, currentSettings, selectedSet)
          : await getLessonQueue(db, currentSettings, currentSettings.lessonSessionSize);
        if (isMounted) {
          setQueueItems(items);
        }
        const relatedSubjectIds = [
          ...new Set(
            items.flatMap((item) => [
              ...(item.subject.componentSubjectIds ?? []),
              ...(item.subject.amalgamationSubjectIds ?? []),
            ]),
          ),
        ].filter((id) => !items.some((i) => i.subjectId === id));
        if (relatedSubjectIds.length > 0) {
          const components = await getSubjectsByIds(db, relatedSubjectIds);
          if (isMounted) {
            setComponentSubjects(components);
          }
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

  const startQuiz = () => {
    const session = new ReviewSession(activeBatch, reviewSettings, true);
    sessionRef.current = session;
    session.nextTask();
    setPhase('quiz');
  };

  const session = sessionRef.current;
  const currentItem = session?.currentItem ?? null;
  const taskType = session?.currentTaskType ?? null;
  const displayItem = feedback?.item ?? currentItem;
  const displayTaskType = feedback?.taskType ?? taskType;
  const isQuizComplete = phase === 'quiz' && !feedback && (session?.isComplete ?? false);
  const hasNextBatch = batchIndex < lessonBatches.length - 1;
  const quizProgress = session
    ? `${Math.min(session.reviewsCompleted + (feedback?.subjectFinished ? 0 : 1), session.totalReviews)}/${session.totalReviews}`
    : '0/0';
  const currentCompletedTasks = completedTasks + (session?.tasksAnswered ?? 0);
  const currentCompletedTasksCorrectly = completedTasksCorrectly + (session?.tasksAnsweredCorrectly ?? 0);
  const overallSuccessRate = currentCompletedTasks > 0
    ? `${Math.round((currentCompletedTasksCorrectly / currentCompletedTasks) * 100)}%`
    : '100%';
  const shouldConfirmLeave = phase === 'intro' || (phase === 'quiz' && !isQuizComplete);
  const { confirmLeave, handleBack, handleCancelLeave, handleConfirmLeave } =
    useConfirmLeave(navigation, shouldConfirmLeave);

  const submitQuizAnswer = () => {
    if (!session || !currentItem || feedback) {
      return;
    }
    if (!answer.trim()) {
      return;
    }

    const result = checkAnswer(answer, currentItem.subject, {
      taskType: taskType ?? 'meaning',
      studyMaterials: currentItem.studyMaterials,
      lookupSubject: (subjectId) => subjectLookup.get(subjectId),
      exactMatch: false,
    });
    const correct = result.kind === 'precise' || result.kind === 'imprecise';

    const markResult = session.markAnswer(correct);
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
  };

  const continueQuiz = async () => {
    if (!session || !feedback || isContinuing) {
      return;
    }

    setIsContinuing(true);
    setError(null);

    try {
      if (feedback.subjectFinished) {
        const item = session.completedItems[session.completedItems.length - 1];
        if (item) {
          const db = await openAppDatabase();
          await queueLessonStart(db, item.assignmentId);
        }
      }

      setFeedback(null);
      setAnswer('');
      session.nextTask();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsContinuing(false);
    }
  };

  const changeAnswer = (text: string) => {
    setAnswer(taskType === 'reading' ? convertRomajiToKanaInput(text) : text);
  };

  const continueToNextBatch = () => {
    if (!session || !isQuizComplete || !hasNextBatch) {
      return;
    }

    setCompletedTasks((value) => value + session.tasksAnswered);
    setCompletedTasksCorrectly((value) => value + session.tasksAnsweredCorrectly);
    sessionRef.current = null;
    setAnswer('');
    setFeedback(null);
    setIntroIndex(0);
    setBatchIndex((value) => value + 1);
    setPhase('intro');
  };

  if (isLoading) {
    return <CenteredMessage label="Loading lessons..." />;
  }

  if (error && queueItems.length === 0 && phase === 'intro') {
    return (
      <CenteredMessage label={error} actionLabel="Back" onAction={() => navigation.goBack()} />
    );
  }

  if (queueItems.length === 0) {
    return (
      <CenteredMessage
        label="No lessons are available in the local cache."
        actionLabel="Back"
        onAction={() => navigation.goBack()}
      />
    );
  }

  if (phase === 'intro') {
    return (
      <IntroPhase
        items={activeBatch}
        index={introIndex}
        batchIndex={batchIndex}
        batchCount={lessonBatches.length}
        onIndexChange={setIntroIndex}
        onStartQuiz={startQuiz}
        onBack={handleBack}
        subjectLookup={subjectLookup}
        styles={styles}
        theme={theme}
        dimmed={confirmLeave}
        confirmLeaveBanner={
          <ConfirmLeaveBanner
            visible={confirmLeave}
            title="End lesson session?"
            message="Progress from this active lesson session may be lost if you leave now."
            cancelLabel="Keep learning"
            confirmLabel="End session"
            onCancel={handleCancelLeave}
            onConfirm={handleConfirmLeave}
          />
        }
      />
    );
  }

  if (isQuizComplete) {
    const completedInBatch = session?.reviewsCompleted ?? 0;
    const completedBeforeBatch = lessonBatches
      .slice(0, batchIndex)
      .reduce((total, batch) => total + batch.length, 0);
    return (
      <LessonQuizSummary
        completed={hasNextBatch ? completedInBatch : completedBeforeBatch + completedInBatch}
        successRate={overallSuccessRate}
        totalItems={hasNextBatch ? activeBatch.length : queueItems.length}
        batchIndex={batchIndex}
        batchCount={lessonBatches.length}
        hasNextBatch={hasNextBatch}
        onContinue={continueToNextBatch}
        onBack={() => navigation.goBack()}
      />
    );
  }

  if (!displayItem) {
    return (
      <CenteredMessage
        label="No quiz items available."
        actionLabel="Back"
        onAction={() => navigation.goBack()}
      />
    );
  }

  const subjectColor = colorForSubjectType(theme.colors, displayItem.subjectType);

  return (
    <ScreenLayout
      scrollable
      keyboardShouldPersistTaps
      keyboardAvoiding
      scrollViewRef={scrollViewRef}
      overlay={
        <ConfirmLeaveBanner
          visible={confirmLeave}
          title="End lesson session?"
          message="Progress from this active lesson session may be lost if you leave now."
          cancelLabel="Keep learning"
          confirmLabel="End session"
          onCancel={handleCancelLeave}
          onConfirm={handleConfirmLeave}
        />
      }
    >
      <SessionHeader
        onBack={handleBack}
        progress={`Quiz ${quizProgress}`}
        dimmed={confirmLeave}
      />

      <SubjectHeroCard
        kicker={displayTaskType === 'meaning' ? 'Meaning' : 'Reading'}
        japanese={displayItem.subject.japanese}
        characterImageUrl={displayItem.subject.characterImageUrl}
        characterImageIsSvg={displayItem.subject.characterImageIsSvg}
        subjectType={displayItem.subjectType}
        level={displayItem.level}
        color={subjectColor}
        compact
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
        keyboardType="default"
        placeholder={displayTaskType === 'meaning' ? 'Type the meaning' : '答え'}
        placeholderTextColor={theme.colors.mutedText}
        style={styles.input}
        onFocus={() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }}
        returnKeyType="done"
        accessibilityLabel={displayTaskType === 'meaning' ? 'Lesson meaning answer' : 'Lesson reading answer'}
        accessibilityHint="Enter your answer for the current lesson quiz prompt."
        onSubmitEditing={submitQuizAnswer}
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
        onPress={feedback ? continueQuiz : submitQuizAnswer}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: subjectColor },
          (pressed || isContinuing || (!feedback && !answer.trim())) && styles.pressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {feedback
            ? isContinuing
              ? 'Saving...'
              : 'Continue'
            : 'Submit Answer'}
        </Text>
      </Pressable>
    </ScreenLayout>
  );
}

function IntroPhase({
  items,
  index,
  batchIndex,
  batchCount,
  onIndexChange,
  onStartQuiz,
  onBack,
  subjectLookup,
  styles,
  theme,
  confirmLeaveBanner,
  dimmed,
}: {
  items: StudyQueueItem[];
  index: number;
  batchIndex: number;
  batchCount: number;
  onIndexChange: (index: number) => void;
  onStartQuiz: () => void;
  onBack: () => void;
  subjectLookup: Map<number, SubjectAnswerData>;
  styles: ReturnType<typeof makeStyles>;
  theme: AppTheme;
  confirmLeaveBanner?: React.ReactNode;
  dimmed?: boolean;
}) {
  const item = items[index];
  if (!item) {
    return null;
  }

  const subjectColor = colorForSubjectType(theme.colors, item.subjectType);
  const isLast = index === items.length - 1;
  const progress = batchCount > 1
    ? `Batch ${batchIndex + 1}/${batchCount} · ${index + 1}/${items.length}`
    : `${index + 1}/${items.length}`;

  return (
    <ScreenLayout scrollable overlay={confirmLeaveBanner}>
      <SessionHeader onBack={onBack} progress={progress} dimmed={dimmed} />

      <View style={styles.chipRow}>
        {items.map((chipItem, chipIndex) => {
          const chipColor = colorForSubjectType(theme.colors, chipItem.subjectType);
          const isActive = chipIndex === index;
          return (
            <Pressable
              key={chipItem.subjectId}
              onPress={() => onIndexChange(chipIndex)}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? chipColor : theme.colors.surface,
                  borderColor: isActive ? chipColor : theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isActive ? '#ffffff' : theme.colors.mutedText },
                ]}
              >
                {chipItem.subject.japanese || '?'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SubjectHeroCard
        kicker={subjectTypeLabel(item.subjectType)}
        japanese={item.subject.japanese}
        characterImageUrl={item.subject.characterImageUrl}
        characterImageIsSvg={item.subject.characterImageIsSvg}
        subjectType={item.subjectType}
        level={item.level}
        color={subjectColor}
        minHeight={200}
      />

      <DetailSections item={item} subjectLookup={subjectLookup} styles={styles} theme={theme} />

      <View style={styles.introNavRow}>
        <Pressable
          disabled={index === 0}
          onPress={() => onIndexChange(index - 1)}
          style={({ pressed }) => [
            styles.navButton,
            index === 0 && styles.navButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.navButtonText, index === 0 && styles.navButtonTextDisabled]}>
            Back
          </Text>
        </Pressable>

        {isLast ? (
          <Pressable
            onPress={onStartQuiz}
            style={({ pressed }) => [
              styles.navButton,
              styles.navButtonPrimary,
              { backgroundColor: subjectColor },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.navButtonPrimaryText}>Start Quiz</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onIndexChange(index + 1)}
            style={({ pressed }) => [styles.navButton, styles.navButtonPrimary, { backgroundColor: subjectColor }, pressed && styles.pressed]}
          >
            <Text style={styles.navButtonPrimaryText}>Next</Text>
          </Pressable>
        )}
      </View>
    </ScreenLayout>
  );
}

function DetailSections({
  item,
  subjectLookup,
  styles,
  theme,
}: {
  item: StudyQueueItem;
  subjectLookup: Map<number, SubjectAnswerData>;
  styles: ReturnType<typeof makeStyles>;
  theme: AppTheme;
}) {
  const { subject } = item;
  const subjectType = item.subjectType;

  const primaryMeanings = subject.meanings
    .filter((m) => m.acceptedAnswer !== false && m.type !== 'blacklist' && m.type === 'primary')
    .map((m) => m.meaning);
  const secondaryMeanings = subject.meanings
    .filter((m) => m.acceptedAnswer !== false && m.type !== 'blacklist' && m.type !== 'primary')
    .map((m) => m.meaning);

  const primaryReadings = subject.readings
    ?.filter((r) => r.primary)
    .map((r) => r.reading) ?? [];
  const alternateReadings = subject.readings
    ?.filter((r) => !r.primary && r.acceptedAnswer !== false)
    .map((r) => r.reading) ?? [];

  const componentNames = (subject.componentSubjectIds ?? [])
    .map((id) => subjectLookup.get(id))
    .filter((s): s is SubjectAnswerData => s != null);

  const amalgamationNames = (subject.amalgamationSubjectIds ?? [])
    .slice(0, 10)
    .map((id) => subjectLookup.get(id))
    .filter((s): s is SubjectAnswerData => s != null);

  return (
    <View style={styles.sections}>
      <DetailSection title="Meaning" theme={theme} styles={styles}>
        <Text style={styles.sectionValue}>{primaryMeanings.join(', ')}</Text>
        {secondaryMeanings.length > 0 ? (
          <Text style={styles.sectionSecondary}>{secondaryMeanings.join(', ')}</Text>
        ) : null}
      </DetailSection>

      {primaryReadings.length > 0 ? (
        <DetailSection title="Reading" theme={theme} styles={styles}>
          <Text style={styles.sectionValue}>{primaryReadings.join(', ')}</Text>
          {alternateReadings.length > 0 ? (
            <Text style={styles.sectionSecondary}>{alternateReadings.join(', ')}</Text>
          ) : null}
        </DetailSection>
      ) : null}

      {componentNames.length > 0 ? (
        <DetailSection title={subjectType === 'kanji' ? 'Radical Combination' : 'Kanji'} theme={theme} styles={styles}>
          <View style={styles.componentRow}>
            {componentNames.map((comp, idx) => {
              const compMeaning = comp.meanings
                .find((m) => m.type === 'primary' && m.acceptedAnswer !== false)?.meaning;
              return (
                <View key={comp.id ?? comp.japanese} style={styles.componentPair}>
                  {idx > 0 ? <Text style={styles.componentPlus}>+</Text> : null}
                  <View
                    style={[styles.componentChip, { borderColor: colorForSubjectType(theme.colors, comp.type) }]}
                  >
                    <ComponentChipContent subject={comp} styles={styles} theme={theme} />
                  </View>
                  {compMeaning ? (
                    <Text style={styles.componentChipMeaning}>{compMeaning}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </DetailSection>
      ) : null}

      {subject.meaningMnemonic ? (
        <DetailSection
          title={subjectType === 'radical' ? 'Mnemonic' : 'Meaning Explanation'}
          theme={theme}
          styles={styles}
        >
          <MnemonicText text={subject.meaningMnemonic} subjectLookup={subjectLookup} styles={styles} />
          {subject.meaningHint ? (
            <Text style={styles.hintText}>Hint: {subject.meaningHint}</Text>
          ) : null}
        </DetailSection>
      ) : null}

      {subject.readingMnemonic ? (
        <DetailSection title="Reading Explanation" theme={theme} styles={styles}>
          <MnemonicText text={subject.readingMnemonic} subjectLookup={subjectLookup} styles={styles} />
          {subject.readingHint ? (
            <Text style={styles.hintText}>Hint: {subject.readingHint}</Text>
          ) : null}
        </DetailSection>
      ) : null}

      {subject.contextSentences && subject.contextSentences.length > 0 ? (
        <DetailSection title="Context Sentences" theme={theme} styles={styles}>
          {subject.contextSentences.map((sentence, idx) => (
            <View key={idx} style={styles.sentenceRow}>
              <Text style={styles.sentenceJa}>{sentence.ja}</Text>
              <Text style={styles.sentenceEn}>{sentence.en}</Text>
            </View>
          ))}
        </DetailSection>
      ) : null}

      {subject.partsOfSpeech && subject.partsOfSpeech.length > 0 ? (
        <DetailSection title="Part of Speech" theme={theme} styles={styles}>
          <Text style={styles.sectionValue}>{subject.partsOfSpeech.join(', ')}</Text>
        </DetailSection>
      ) : null}

      {amalgamationNames.length > 0 ? (
        <DetailSection title="Used In" theme={theme} styles={styles}>
          <View style={styles.componentRow}>
            {amalgamationNames.map((amalgam) => (
              <View
                key={amalgam.id ?? amalgam.japanese}
                style={[styles.componentChip, { borderColor: colorForSubjectType(theme.colors, amalgam.type) }]}
              >
                <ComponentChipContent subject={amalgam} styles={styles} theme={theme} />
              </View>
            ))}
          </View>
        </DetailSection>
      ) : null}
    </View>
  );
}

function ComponentChipContent({
  subject,
  styles,
  theme,
}: {
  subject: SubjectAnswerData;
  styles: ReturnType<typeof makeStyles>;
  theme: AppTheme;
}) {
  const color = colorForSubjectType(theme.colors, subject.type);
  if (!subject.japanese && subject.characterImageUrl && !subject.characterImageIsSvg) {
    return (
      <Image
        source={{ uri: subject.characterImageUrl }}
        style={styles.componentChipImage}
        resizeMode="contain"
      />
    );
  }

  return <Text style={[styles.componentChipText, { color }]}>{subject.japanese || subject.type}</Text>;
}

function DetailSection({
  title,
  children,
  theme,
  styles,
}: {
  title: string;
  children: React.ReactNode;
  theme: AppTheme;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionBody, { borderColor: theme.colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function MnemonicText({
  text,
  subjectLookup,
  styles,
}: {
  text: string;
  subjectLookup: Map<number, SubjectAnswerData>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const colorMap: Record<string, string> = {
    radical: styles.mnemonicRadical.color,
    kanji: styles.mnemonicKanji.color,
    reading: styles.mnemonicReading.color,
    meaning: styles.mnemonicMeaning.color,
  };

  const tokens = parseMnemonic(text);
  return (
    <Text style={styles.sectionValue}>
      {tokens.map((token, idx) => {
        if (token.type === 'tag') {
          const color = colorMap[token.tag ?? ''] ?? styles.mnemonicHighlight.color;
          return <Text key={idx} style={[styles.mnemonicHighlight, { color }]}>{token.text}</Text>;
        }
        if (token.type === 'curly') {
          const content = token.text;
          const subject = [...subjectLookup.values()].find(
            (s) =>
              s.meanings.some((m) => m.meaning.toLowerCase() === content.toLowerCase()) ||
              s.japanese === content,
          );
          if (subject?.japanese) {
            return <Text key={idx} style={styles.mnemonicHighlight}>{subject.japanese}</Text>;
          }
          return <Text key={idx} style={styles.mnemonicHighlight}>{content}</Text>;
        }
        return <Text key={idx}>{token.text}</Text>;
      })}
    </Text>
  );
}

type MnemonicToken = { type: 'text'; text: string } | { type: 'tag'; tag: string; text: string } | { type: 'curly'; text: string };

function parseMnemonic(text: string): MnemonicToken[] {
  const tokens: MnemonicToken[] = [];
  const pattern = /(<(radical|kanji|reading|meaning)>)(.*?)(<\/\2>)|(\{([^}]+)\})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[1] && match[3] !== undefined) {
      tokens.push({ type: 'tag', tag: match[2]!, text: match[3] });
    } else if (match[5] && match[6]) {
      tokens.push({ type: 'curly', text: match[6] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return tokens;
}

function LessonQuizSummary({
  completed,
  successRate,
  totalItems,
  batchIndex,
  batchCount,
  hasNextBatch,
  onContinue,
  onBack,
}: {
  completed: number;
  successRate: string;
  totalItems: number;
  batchIndex: number;
  batchCount: number;
  hasNextBatch: boolean;
  onContinue: () => void;
  onBack: () => void;
}) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  return (
    <ScreenLayout scrollable>
      <SessionHeader onBack={onBack} progress={hasNextBatch ? `Batch ${batchIndex + 1}/${batchCount}` : 'Complete'} />

      <View style={styles.summaryHero}>
        <Text style={styles.summaryKicker}>{hasNextBatch ? 'Batch Complete' : 'Lessons Complete'}</Text>
        <Text style={styles.summaryRate}>{successRate}</Text>
        <Text style={styles.summaryMeta}>{completed} of {totalItems} lessons completed</Text>
      </View>

      <Pressable
        onPress={hasNextBatch ? onContinue : onBack}
        style={({ pressed }) => [
          styles.primaryButton,
          styles.summaryActionButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>{hasNextBatch ? 'Continue Lessons' : 'Back to Dashboard'}</Text>
      </Pressable>
    </ScreenLayout>
  );
}

function subjectTypeLabel(type: string) {
  switch (type) {
    case 'radical':
      return 'Radical';
    case 'kanji':
      return 'Kanji';
    case 'vocabulary':
    case 'kana_vocabulary':
      return 'Vocabulary';
    default:
      return 'Lesson';
  }
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
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '900',
    },
    sections: {
      gap: 16,
    },
    section: {
      gap: 6,
    },
    sectionTitle: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionBody: {
      borderRadius: 16,
      padding: 14,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      gap: 4,
    },
    sectionValue: {
      color: theme.colors.text,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '800',
    },
    sectionSecondary: {
      color: theme.colors.mutedText,
      fontSize: 14,
      fontWeight: '700',
    },
    hintText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontStyle: 'italic',
      fontWeight: '700',
      marginTop: 4,
    },
    mnemonicHighlight: {
      fontWeight: '900',
      color: theme.colors.kanji,
    },
    mnemonicRadical: {
      color: theme.colors.radical,
    },
    mnemonicKanji: {
      color: theme.colors.kanji,
    },
    mnemonicReading: {
      color: theme.colors.vocabulary,
    },
    mnemonicMeaning: {
      color: theme.colors.kanji,
    },
    componentRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
    },
    componentPair: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    componentPlus: {
      color: theme.colors.mutedText,
      fontSize: 16,
      fontWeight: '800',
    },
    componentChip: {
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.colors.surface,
      borderWidth: 1.5,
    },
    componentChipText: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '900',
    },
    componentChipImage: {
      width: 24,
      height: 24,
    },
    componentChipMeaning: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    sentenceRow: {
      gap: 2,
    },
    sentenceJa: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '800',
    },
    sentenceEn: {
      color: theme.colors.mutedText,
      fontSize: 14,
      fontWeight: '700',
    },
    introNavRow: {
      flexDirection: 'row',
      gap: 12,
    },
    navButton: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    navButtonDisabled: {
      opacity: 0.4,
    },
    navButtonText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    navButtonTextDisabled: {
      color: theme.colors.mutedText,
    },
    navButtonPrimary: {
      borderWidth: 0,
    },
    navButtonPrimaryText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '900',
    },
    summaryHero: {
      minHeight: 210,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: theme.colors.lesson,
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
    summaryActionButton: {
      backgroundColor: theme.colors.lesson,
    },
  });
}
