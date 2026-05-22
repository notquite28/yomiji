import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StudyMaterialPayload } from '../domain/api/types';
import { SubjectAnswerData } from '../domain/answers/answerChecker';
import { openAppDatabase } from '../domain/db/database';
import { findBySubjectId } from '../domain/db/studyMaterialRepository';
import { getSubjectById, getSubjectsByIds } from '../domain/db/subjectRepository';
import { queueStudyMaterialUpdate } from '../domain/study/studyRepository';
import { LiquidGlassButton } from '../components/LiquidGlassButton';
import { SubjectDetailsContent } from '../components/SubjectDetailsContent';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../domain/settings/settingsStore';
import { useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'SubjectDetail'>;

export function SubjectDetailScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
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
      <SafeAreaView className="flex-1 bg-[#f7f4ef] dark:bg-[#0c0b0f]">
        <View className="flex-1 items-center justify-center px-6 gap-3" accessibilityLiveRegion="polite">
          <Text className="text-[16px] font-heavy text-text-muted dark:text-text-muted-dark text-center">
            {message}
          </Text>
          {detail ? (
            <Text className="text-[14px] leading-5 font-bold text-text-muted dark:text-text-muted-dark text-center">
              {detail}
            </Text>
          ) : null}
          {!isLoading ? (
            <LiquidGlassButton
              label="Back"
              onPress={() => navigation.goBack()}
              accessibilityLabel="Go back"
              style={{ paddingHorizontal: 13, paddingVertical: 9 }}
              contentClassName="font-black"
            />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const color = colorForSubjectType(colors, subject.type);
  const srsLabel = stats?.srsStage != null ? srsStageLabel(stats.srsStage) : 'Unlocked';

  return (
    <SafeAreaView className="flex-1 bg-[#f7f4ef] dark:bg-[#0c0b0f]">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 14 }}>
        <LiquidGlassButton
          label="Back"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          className="self-start"
          style={{ paddingHorizontal: 13, paddingVertical: 9 }}
          contentClassName="font-black"
        />

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
          <View className="flex-row gap-2 flex-wrap">
            <View className="rounded-full px-3 py-1.5 bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)]">
              <Text className="text-xs font-heavy text-text dark:text-text-dark">{srsLabel}</Text>
            </View>
            {stats.percentageCorrect != null ? (
              <View className="rounded-full px-3 py-1.5 bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)]">
                <Text className="text-xs font-heavy text-text dark:text-text-dark">{stats.percentageCorrect}% correct</Text>
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

        {saveMessage ? (
          <Text
            className={`text-[14px] font-heavy ${saveMessage.startsWith('Could not') ? 'text-danger dark:text-danger-dark' : 'text-success dark:text-success-dark'}`}
            accessibilityLiveRegion="polite"
          >
            {saveMessage}
          </Text>
        ) : null}

        {editingField === 'synonym' ? (
          <View className="gap-1.5">
            <Text className="text-[13px] font-black uppercase tracking-ultra text-text-muted dark:text-text-muted-dark">
              Edit Synonyms
            </Text>
            <View className="rounded-md p-[14px] bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark gap-1">
              <TextInput
                className="min-h-[44px] rounded-[12px] border border-border dark:border-border-dark bg-surface-elevated dark:bg-surface-elevated-dark text-text dark:text-text-dark px-3 text-[14px] font-bold"
                value={editValue}
                onChangeText={setEditValue}
                placeholder="comma, separated, synonyms"
                placeholderTextColor={colors.mutedText}
                autoFocus
              />
              <View className="flex-row gap-2 mt-1.5">
                <Pressable
                  className="px-[14px] py-2 rounded-[10px] border border-border dark:border-border-dark"
                  onPress={() => setEditingField(null)}
                >
                  <Text className="text-[13px] font-bold text-text dark:text-text-dark">Cancel</Text>
                </Pressable>
                <Pressable
                  className="px-[14px] py-2 rounded-[10px] bg-kanji"
                  onPress={() => handleSave('synonym', editValue)}
                  disabled={isSaving}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSaving, busy: isSaving }}
                >
                  <Text className="text-[13px] font-bold text-white">
                    {isSaving ? 'Saving...' : 'Save'}
                  </Text>
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
