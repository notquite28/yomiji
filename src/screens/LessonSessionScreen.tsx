import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openAppDatabase } from '../domain/db/database';
import { getLessonQueue, queueLessonStart, StudyQueueItem } from '../domain/study/studyRepository';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'LessonSession'>;

export function LessonSessionScreen({ navigation }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [queue, setQueue] = useState<StudyQueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    openAppDatabase()
      .then((db) => getLessonQueue(db))
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
    return <CenteredScreen label="Loading advanced lessons..." />;
  }

  if (error && !current) {
    return <CenteredScreen label={error} actionLabel="Back" onAction={() => navigation.goBack()} />;
  }

  if (isComplete) {
    return <CenteredScreen label="Advanced lessons queued. Starts will sync on the next sync run." actionLabel="Back to Dashboard" onAction={() => navigation.goBack()} />;
  }

  if (!current) {
    return <CenteredScreen label="No advanced lessons are available in the local cache." actionLabel="Back" onAction={() => navigation.goBack()} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.progressText}>{index + 1}/{queue.length}</Text>
        </View>

        <View style={[styles.heroCard, { backgroundColor: subjectColor }]}>
          <Text style={styles.kicker}>Advanced Lesson</Text>
          {current.subject.characterImageUrl ? (
            <View style={styles.imageFrame}>
              <Image source={{ uri: current.subject.characterImageUrl }} style={styles.characterImage} resizeMode="contain" />
            </View>
          ) : (
            <Text style={styles.characters}>{current.subject.japanese || current.subjectType}</Text>
          )}
          <Text style={styles.meta}>Level {current.level ?? '?'} · {current.subjectType}</Text>
        </View>

        <InfoPanel title="Meanings" value={acceptedMeanings(current)} />
        {acceptedReadings(current) ? <InfoPanel title="Readings" value={acceptedReadings(current) ?? ''} /> : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable disabled={isSaving} onPress={startLesson} style={({ pressed }) => [styles.primaryButton, { backgroundColor: subjectColor }, (pressed || isSaving) && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{isSaving ? 'Queueing...' : 'Mark Lesson Started'}</Text>
        </Pressable>
        <Pressable disabled={isSaving} onPress={() => setIndex((value) => value + 1)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Skip for Now</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
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

function CenteredScreen({ label, actionLabel, onAction }: { label: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.radical} style={actionLabel ? styles.hidden : undefined} />
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
      gap: 16,
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
    heroCard: {
      minHeight: 260,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    kicker: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    characters: {
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
    characterImage: {
      width: 112,
      height: 112,
    },
    meta: {
      marginTop: 10,
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
      opacity: 0.86,
      textTransform: 'capitalize',
    },
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
