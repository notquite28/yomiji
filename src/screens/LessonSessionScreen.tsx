import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openAppDatabase } from '../domain/db/database';
import { getLessonItemsByIds, getLessonQueue, queueLessonStart, StudyQueueItem } from '../domain/study/studyRepository';
import { CenteredMessage, ScreenLayout, SessionHeader } from '../components/ScreenLayout';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';
import { defaultSettings, loadSettings, AppSettings } from '../domain/settings/settings';

type Props = NativeStackScreenProps<RootStackParamList, 'LessonSession'>;

export function LessonSessionScreen({ navigation, route }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [queue, setQueue] = useState<StudyQueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    let isMounted = true;
    const selectedIds = route.params?.selectedIds;
    const selectedSet = selectedIds ? new Set(selectedIds) : null;

    Promise.all([openAppDatabase(), loadSettings()])
      .then(([db, loadedSettings]) => {
        setSettings(loadedSettings);
        if (selectedSet && selectedSet.size > 0) {
          return getLessonItemsByIds(db, loadedSettings, selectedSet);
        }
        return getLessonQueue(db, loadedSettings, loadedSettings.lessonBatchSize);
      })
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

  const current = queue[index];
  const subjectColor = current ? colorForSubjectType(theme.colors, current.subjectType) : theme.colors.radical;
  const isComplete = !isLoading && index >= queue.length;

  const startLesson = async () => {
    if (!current) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const db = await openAppDatabase();
      await queueLessonStart(db, current.assignmentId);
      setIndex((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <CenteredMessage label="Loading advanced lessons..." />;
  }

  if (error && !current) {
    return <CenteredMessage label={error} actionLabel="Back" onAction={() => navigation.goBack()} />;
  }

  if (isComplete) {
    return <CenteredMessage label="Advanced lessons queued. Starts will sync on the next sync run." actionLabel="Back to Dashboard" onAction={() => navigation.goBack()} />;
  }

  if (!current) {
    return <CenteredMessage label="No advanced lessons are available in the local cache." actionLabel="Back" onAction={() => navigation.goBack()} />;
  }

  return (
    <ScreenLayout scrollable>
      <SessionHeader onBack={() => navigation.goBack()} progress={`${index + 1}/${queue.length}`} />

      <SubjectHeroCard
        kicker="Advanced Lesson"
        japanese={current.subject.japanese}
        characterImageUrl={current.subject.characterImageUrl}
        characterImageIsSvg={current.subject.characterImageIsSvg}
        subjectType={current.subjectType}
        level={current.level}
        color={subjectColor}
        minHeight={260}
      />

      <InfoPanel title="Meanings" value={acceptedMeanings(current)} />
      {acceptedReadings(current) ? <InfoPanel title="Readings" value={acceptedReadings(current) ?? ''} /> : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable disabled={isSaving} onPress={startLesson} style={({ pressed }) => [styles.primaryButton, { backgroundColor: subjectColor }, (pressed || isSaving) && styles.pressed]}>
        <Text style={styles.primaryButtonText}>{isSaving ? 'Queueing...' : 'Mark Lesson Started'}</Text>
      </Pressable>
      <Pressable disabled={isSaving} onPress={() => setIndex((value) => value + 1)} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Skip for Now</Text>
      </Pressable>
    </ScreenLayout>
  );
}

function InfoPanel({ title, value }: { title: string; value: string }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelValue}>{value}</Text>
    </View>
  );
}

function acceptedMeanings(item: StudyQueueItem) {
  return item.subject.meanings
    .filter((meaning) => meaning.acceptedAnswer !== false && meaning.type !== 'blacklist')
    .map((meaning) => meaning.meaning)
    .join(', ');
}

function acceptedReadings(item: StudyQueueItem) {
  return item.subject.readings
    ?.filter((reading) => reading.acceptedAnswer !== false)
    .map((reading) => reading.reading)
    .join(', ');
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    panel: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 6,
    },
    panelTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '900',
    },
    panelValue: {
      color: theme.colors.mutedText,
      fontSize: 18,
      lineHeight: 25,
      fontWeight: '800',
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
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryButtonText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    pressed: {
      opacity: 0.58,
    },
  });
}
