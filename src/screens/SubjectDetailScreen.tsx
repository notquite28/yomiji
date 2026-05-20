import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StudyMaterialPayload } from '../domain/api/types';
import { SubjectAnswerData } from '../domain/answers/answerChecker';
import { openAppDatabase } from '../domain/db/database';
import { findBySubjectId } from '../domain/db/studyMaterialRepository';
import { getSubjectById, getSubjectsByIds } from '../domain/db/subjectRepository';
import { queueStudyMaterialUpdate } from '../domain/study/studyRepository';
import { SubjectDetailsContent } from '../components/SubjectDetailsContent';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../domain/settings/settingsStore';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'SubjectDetail'>;

export function SubjectDetailScreen({ navigation, route }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const { subjectId } = route.params;

  const [subject, setSubject] = useState<SubjectAnswerData | null>(null);
  const [componentSubjects, setComponentSubjects] = useState<Map<number, SubjectAnswerData>>(new Map());
  const [amalgamationSubjects, setAmalgamationSubjects] = useState<Map<number, SubjectAnswerData>>(new Map());
  const [stats, setStats] = useState<{ level: number | null; srsStage: number | null; percentageCorrect: number | null } | null>(null);
  const [studyMaterial, setStudyMaterial] = useState<{ meaningSynonyms: string[]; meaningNote: string; readingNote: string }>({
    meaningSynonyms: [],
    meaningNote: '',
    readingNote: '',
  });
  const [editingField, setEditingField] = useState<'meaningNote' | 'readingNote' | 'synonym' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const useKatakana = useSettingsStore((s) => s.useKatakanaForOnyomi);
  const showAllReadings = useSettingsStore((s) => s.showAllReadings);

  const loadSubject = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
    const db = await openAppDatabase();
    const s = await getSubjectById(db, subjectId);
    if (!s) {
      setSubject(null);
      return;
    }
    setSubject(s);

    if ((s.componentSubjectIds ?? []).length > 0) {
      const comps = await getSubjectsByIds(db, s.componentSubjectIds ?? []);
      setComponentSubjects(comps);
    }

    if ((s.amalgamationSubjectIds ?? []).length > 0) {
      const amals = await getSubjectsByIds(db, (s.amalgamationSubjectIds ?? []).slice(0, 10));
      setAmalgamationSubjects(amals);
    }

    const row = await db.getFirstAsync<{ level: number | null; srs_stage: number | null; percentage_correct: number | null }>(
      `SELECT s.level, a.srs_stage, rs.percentage_correct
       FROM subjects s
       LEFT JOIN assignments a ON a.subject_id = s.id
       LEFT JOIN review_stats rs ON rs.subject_id = s.id
       WHERE s.id = ?`,
      subjectId,
    );
    if (row) {
      setStats({ level: row.level, srsStage: row.srs_stage, percentageCorrect: row.percentage_correct });
    }

    const sm = await findBySubjectId(db, subjectId);
    if (sm) {
      const parsed = JSON.parse(sm.payload) as { data: { meaning_synonyms?: string[]; meaning_note?: string; reading_note?: string } };
      setStudyMaterial({
        meaningSynonyms: parsed.data.meaning_synonyms ?? [],
        meaningNote: parsed.data.meaning_note ?? '',
        readingNote: parsed.data.reading_note ?? '',
      });
    }
    } catch (caught) {
      setSubject(null);
      setLoadError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    loadSubject();
  }, [loadSubject]);

  const handleSave = async (field: 'meaningNote' | 'readingNote' | 'synonym', value: string) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const db = await openAppDatabase();
      const payload: Record<string, unknown> = { subjectId };

      if (field === 'synonym') {
        payload.meaningSynonyms = value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (field === 'meaningNote') {
        payload.meaningNote = value;
      } else {
        payload.readingNote = value;
      }

      await queueStudyMaterialUpdate(db, payload as StudyMaterialPayload);

      if (field === 'synonym') {
        setStudyMaterial((prev) => ({ ...prev, meaningSynonyms: payload.meaningSynonyms as string[] }));
      } else if (field === 'meaningNote') {
        setStudyMaterial((prev) => ({ ...prev, meaningNote: value }));
      } else {
        setStudyMaterial((prev) => ({ ...prev, readingNote: value }));
      }
      setEditingField(null);
      setSaveMessage('Study material saved. It will sync with WaniKani on the next write flush.');
    } catch (caught) {
      setSaveMessage(`Could not save study material: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !subject) {
    const message = isLoading ? 'Loading subject…' : loadError ? 'Could not load subject' : 'Subject not found';
    const detail = loadError ?? (!isLoading ? 'This subject may not be in your local cache yet. Try syncing from the dashboard.' : null);
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer} accessibilityLiveRegion="polite">
          <Text style={styles.loadingText}>{message}</Text>
          {detail ? <Text style={styles.emptyDetail}>{detail}</Text> : null}
          {!isLoading ? (
            <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backButton}>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const color = colorForSubjectType(theme.colors, subject.type);
  const srsLabel = stats?.srsStage != null ? srsStageLabel(stats.srsStage) : 'Unlocked';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <SubjectHeroCard
          kicker={subject.type.toUpperCase()}
          japanese={subject.japanese}
          characterImageUrl={subject.characterImageUrl}
          characterImageIsSvg={subject.characterImageIsSvg}
          subjectType={subject.type}
          level={stats?.level ?? undefined}
          color={color}
          minHeight={200}
        />

        {stats ? (
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statChipText}>{srsLabel}</Text>
            </View>
            {stats.percentageCorrect != null ? (
              <View style={styles.statChip}>
                <Text style={styles.statChipText}>{stats.percentageCorrect}% correct</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <SubjectDetailsContent
          subject={subject}
          componentSubjects={componentSubjects}
          amalgamationSubjects={amalgamationSubjects}
          studyMaterial={studyMaterial}
          meaningAttempted={true}
          readingAttempted={true}
          showFullAnswer={true}
          isReview={false}
          useKatakanaForOnyomi={useKatakana}
          showAllReadings={showAllReadings}
          onNavigateToSubject={(id) => navigation.push('SubjectDetail', { subjectId: id })}
          onEditMeaningNote={(value) => handleSave('meaningNote', value)}
          onEditReadingNote={(value) => handleSave('readingNote', value)}
        />

        {saveMessage ? <Text style={saveMessage.startsWith('Could not') ? styles.errorText : styles.successText} accessibilityLiveRegion="polite">{saveMessage}</Text> : null}

        {editingField === 'synonym' ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.mutedText, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 }}>Edit Synonyms</Text>
            <View style={{ borderRadius: 16, padding: 14, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
              <TextInput
                style={styles.input}
                value={editValue}
                onChangeText={setEditValue}
                placeholder="comma, separated, synonyms"
                placeholderTextColor={theme.colors.mutedText}
                autoFocus
              />
              <View style={styles.editActions}>
                <Pressable style={styles.editButton} onPress={() => setEditingField(null)}>
                  <Text style={styles.editButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.editButton, styles.editButtonPrimary]} onPress={() => handleSave('synonym', editValue)} disabled={isSaving} accessibilityRole="button" accessibilityState={{ disabled: isSaving, busy: isSaving }}>
                  <Text style={styles.editButtonPrimaryText}>{isSaving ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function srsStageLabel(stage: number): string {
  if (stage === 0) return 'Lesson';
  if (stage <= 4) return `Apprentice ${stage}`;
  if (stage <= 6) return stage === 5 ? 'Guru 1' : 'Guru 2';
  if (stage === 7) return 'Master';
  if (stage === 8) return 'Enlightened';
  return 'Burned';
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.isDark ? '#0c0b0f' : '#f7f4ef',
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 28,
      gap: 14,
    },
    backButton: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 9,
      backgroundColor: theme.isDark ? '#201e26' : '#f2eee8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.06)',
    },
    backText: {
      color: theme.colors.text,
      fontWeight: '900',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 12,
    },
    loadingText: {
      color: theme.colors.mutedText,
      fontSize: 16,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyDetail: {
      color: theme.colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      textAlign: 'center',
    },
    successText: {
      color: theme.colors.success,
      fontSize: 14,
      fontWeight: '800',
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      fontWeight: '800',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    statChip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.isDark ? '#201e26' : '#f2eee8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.06)',
    },
    statChipText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    input: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
      color: theme.colors.text,
      paddingHorizontal: 12,
      fontSize: 14,
      fontWeight: '700',
    },
    editActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
    },
    editButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    editButtonText: {
      color: theme.colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    editButtonPrimary: {
      backgroundColor: theme.colors.kanji,
      borderWidth: 0,
    },
    editButtonPrimaryText: {
      color: '#ffffff',
      fontWeight: '700',
      fontSize: 13,
    },
  });
}
