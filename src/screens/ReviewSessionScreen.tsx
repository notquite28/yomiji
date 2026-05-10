import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerCheckResult, checkAnswer, TaskType } from '../domain/answers/answerChecker';
import { convertRomajiToKanaInput } from '../domain/answers/kanaInput';
import { openAppDatabase } from '../domain/db/database';
import { getReviewQueue, queueReviewResult, StudyQueueItem } from '../domain/study/studyRepository';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewSession'>;
type Feedback = { correct: boolean; message: string; detail: string };
type WrongCounts = { meaning: number; reading: number };

export function ReviewSessionScreen({ navigation }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [queue, setQueue] = useState<StudyQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const wrongCounts = useRef(new Map<number, WrongCounts>());

  useEffect(() => {
    let isMounted = true;
    openAppDatabase()
      .then((db) => getReviewQueue(db))
      .then((items) => {
        if (isMounted) {
          setQueue(items);
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

  const subjectLookup = useMemo(() => new Map(queue.map((item) => [item.subjectId, item.subject])), [queue]);
  const current = queue[itemIndex];
  const tasks = current ? tasksFor(current) : [];
  const activeTask = tasks[taskIndex] ?? 'meaning';
  const subjectColor = current ? colorForSubjectType(theme.colors, current.subjectType) : theme.colors.vocabulary;
  const isComplete = !isLoading && itemIndex >= queue.length;

  const submit = () => {
    if (!current || !answer.trim() || feedback) {
      return;
    }

    const result = checkAnswer(answer, current.subject, {
      taskType: activeTask,
      studyMaterials: current.studyMaterials,
      lookupSubject: (subjectId) => subjectLookup.get(subjectId),
    });
    const correct = result.kind === 'precise' || result.kind === 'imprecise';

    if (!correct) {
      const counts = wrongCounts.current.get(current.assignmentId) ?? { meaning: 0, reading: 0 };
      counts[activeTask] += 1;
      wrongCounts.current.set(current.assignmentId, counts);
    }

    setFeedback({
      correct,
      message: feedbackTitle(result),
      detail: correct ? 'Continue to the next prompt.' : correctAnswerText(current, activeTask),
    });
  };

  const changeAnswer = (text: string) => {
    setAnswer(activeTask === 'reading' ? convertRomajiToKanaInput(text) : text);
  };

  const continueSession = async () => {
    if (!current || !feedback) {
      return;
    }

    setError(null);
    if (!feedback.correct) {
      setFeedback(null);
      setAnswer('');
      return;
    }

    const nextTaskIndex = taskIndex + 1;
    if (nextTaskIndex < tasks.length) {
      setTaskIndex(nextTaskIndex);
      setFeedback(null);
      setAnswer('');
      return;
    }

    setIsSaving(true);
    try {
      const db = await openAppDatabase();
      const counts = wrongCounts.current.get(current.assignmentId) ?? { meaning: 0, reading: 0 };
      await queueReviewResult(db, {
        assignmentId: current.assignmentId,
        incorrectMeaningAnswers: counts.meaning,
        incorrectReadingAnswers: counts.reading,
      });
      setItemIndex((value) => value + 1);
      setTaskIndex(0);
      setFeedback(null);
      setAnswer('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <CenteredScreen label="Loading reviews..." />;
  }

  if (error && !current) {
    return <CenteredScreen label={error} actionLabel="Back" onAction={() => navigation.goBack()} />;
  }

  if (isComplete) {
    return <CenteredScreen label="Reviews complete. Queued progress will sync on the next sync run." actionLabel="Back to Dashboard" onAction={() => navigation.goBack()} />;
  }

  if (!current) {
    return <CenteredScreen label="No reviews are available in the local cache." actionLabel="Back" onAction={() => navigation.goBack()} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.progressText}>{itemIndex + 1}/{queue.length}</Text>
        </View>

        <View style={[styles.promptCard, { backgroundColor: subjectColor }]}>
          <Text style={styles.promptKind}>{activeTask === 'meaning' ? 'Meaning' : 'Reading'}</Text>
          {current.subject.characterImageUrl ? (
            <View style={styles.imageFrame}>
              <Image source={{ uri: current.subject.characterImageUrl }} style={styles.promptImage} resizeMode="contain" />
            </View>
          ) : (
            <Text style={styles.promptText}>{current.subject.japanese || current.subjectType}</Text>
          )}
          <Text style={styles.promptMeta}>Level {current.level ?? '?'} · {current.subjectType}</Text>
        </View>

        <TextInput
          value={answer}
          onChangeText={changeAnswer}
          editable={!feedback && !isSaving}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          importantForAutofill="no"
          keyboardType={activeTask === 'meaning' ? 'visible-password' : 'default'}
          placeholder={activeTask === 'meaning' ? 'Type the meaning' : 'Type the reading in kana'}
          placeholderTextColor={theme.colors.mutedText}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        {feedback ? (
          <View style={[styles.feedbackCard, { borderColor: feedback.correct ? theme.colors.success : theme.colors.danger }]}>
            <Text style={[styles.feedbackTitle, { color: feedback.correct ? theme.colors.success : theme.colors.danger }]}>{feedback.message}</Text>
            <Text style={styles.feedbackDetail}>{feedback.detail}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          disabled={isSaving || (!feedback && !answer.trim())}
          onPress={feedback ? continueSession : submit}
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: subjectColor }, (pressed || isSaving || (!feedback && !answer.trim())) && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>{feedback ? (isSaving ? 'Queueing...' : 'Continue') : 'Submit Answer'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function tasksFor(item: StudyQueueItem): TaskType[] {
  const tasks: TaskType[] = ['meaning'];
  if (item.subject.readings?.some((reading) => reading.acceptedAnswer !== false)) {
    tasks.push('reading');
  }
  return tasks;
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

function correctAnswerText(item: StudyQueueItem, taskType: TaskType) {
  if (taskType === 'reading') {
    return `Accepted readings: ${item.subject.readings?.filter((reading) => reading.acceptedAnswer !== false).map((reading) => reading.reading).join(', ') || 'none'}`;
  }
  return `Accepted meanings: ${item.subject.meanings.filter((meaning) => meaning.acceptedAnswer !== false && meaning.type !== 'blacklist').map((meaning) => meaning.meaning).join(', ')}`;
}

function CenteredScreen({ label, actionLabel, onAction }: { label: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.kanji} style={actionLabel ? styles.hidden : undefined} />
        <Text style={styles.centeredText}>{label}</Text>
        {actionLabel ? (
          <Pressable onPress={onAction} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flexGrow: 1,
      padding: 20,
      gap: 18,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
    },
    hidden: {
      opacity: 0,
    },
    centeredText: {
      color: theme.colors.text,
      textAlign: 'center',
      fontSize: 18,
      lineHeight: 25,
      fontWeight: '800',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    backText: {
      color: theme.colors.text,
      fontWeight: '900',
    },
    progressText: {
      color: theme.colors.mutedText,
      fontWeight: '900',
    },
    promptCard: {
      minHeight: 240,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    promptKind: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    promptText: {
      marginTop: 12,
      color: '#ffffff',
      fontSize: 72,
      fontWeight: '900',
      textAlign: 'center',
    },
    imageFrame: {
      marginTop: 16,
      width: 150,
      height: 150,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 28,
      backgroundColor: '#ffffff',
    },
    promptImage: {
      width: 112,
      height: 112,
    },
    promptMeta: {
      marginTop: 10,
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
      opacity: 0.86,
      textTransform: 'capitalize',
    },
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
