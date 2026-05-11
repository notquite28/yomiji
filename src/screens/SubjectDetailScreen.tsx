import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StudyMaterialPayload } from '../domain/api/types';
import { SubjectAnswerData } from '../domain/answers/answerChecker';
import { openAppDatabase } from '../domain/db/database';
import { findBySubjectId } from '../domain/db/studyMaterialRepository';
import { getSubjectById, getSubjectsByIds } from '../domain/db/subjectRepository';
import { queueStudyMaterialUpdate } from '../domain/study/studyRepository';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { RootStackParamList } from '../navigation/types';
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
  const [isSaving, setIsSaving] = useState(false);

  const loadSubject = useCallback(async () => {
    const db = await openAppDatabase();
    const s = await getSubjectById(db, subjectId);
    if (!s) return;
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
  }, [subjectId]);

  useEffect(() => {
    loadSubject();
  }, [loadSubject]);

  const handleSave = async (field: 'meaningNote' | 'readingNote' | 'synonym', value: string) => {
    setIsSaving(true);
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
    } finally {
      setIsSaving(false);
    }
  };

  if (!subject) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const color = colorForSubjectType(theme.colors, subject.type);
  const primaryMeanings = subject.meanings
    .filter((m) => m.type === 'primary' && m.acceptedAnswer !== false)
    .map((m) => m.meaning);
  const secondaryMeanings = subject.meanings
    .filter((m) => m.type !== 'primary' && m.type !== 'blacklist' && m.acceptedAnswer !== false)
    .map((m) => m.meaning);
  const primaryReadings = (subject.readings ?? []).filter((r) => r.primary).map((r) => r.reading);
  const alternateReadings = (subject.readings ?? []).filter((r) => !r.primary && r.acceptedAnswer !== false).map((r) => r.reading);

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

        <View style={styles.sections}>
          <DetailSection title="Meaning" theme={theme} styles={styles}>
            <Text style={styles.sectionValue}>{primaryMeanings.join(', ')}</Text>
            {secondaryMeanings.length > 0 ? (
              <Text style={styles.sectionSecondary}>{secondaryMeanings.join(', ')}</Text>
            ) : null}
            {studyMaterial.meaningSynonyms.length > 0 ? (
              <Text style={styles.sectionSecondary}>Synonyms: {studyMaterial.meaningSynonyms.join(', ')}</Text>
            ) : null}
            <InlineEditButton
              label="Edit Synonyms"
              onPress={() => { setEditingField('synonym'); setEditValue(studyMaterial.meaningSynonyms.join(', ')); }}
            />
          </DetailSection>

          {primaryReadings.length > 0 ? (
            <DetailSection title="Reading" theme={theme} styles={styles}>
              <Text style={styles.sectionValue}>{primaryReadings.join(', ')}</Text>
              {alternateReadings.length > 0 ? (
                <Text style={styles.sectionSecondary}>{alternateReadings.join(', ')}</Text>
              ) : null}
            </DetailSection>
          ) : null}

          {componentSubjects.size > 0 ? (
            <DetailSection title={subject.type === 'kanji' ? 'Radical Combination' : 'Components'} theme={theme} styles={styles}>
              <View style={styles.componentRow}>
                {[...componentSubjects.values()].map((comp, idx) => {
                  const compMeaning = comp.meanings.find((m) => m.type === 'primary' && m.acceptedAnswer !== false)?.meaning;
                  const compColor = colorForSubjectType(theme.colors, comp.type);
                  return (
                    <View key={comp.id ?? comp.japanese} style={styles.componentPair}>
                      {idx > 0 ? <Text style={styles.componentPlus}>+</Text> : null}
                      <Pressable onPress={() => comp.id && navigation.push('SubjectDetail', { subjectId: comp.id })}>
                        <View style={[styles.componentChip, { borderColor: compColor }]}>
                          <ComponentChipContent subject={comp} styles={styles} color={compColor} />
                        </View>
                      </Pressable>
                      {compMeaning ? <Text style={styles.componentChipMeaning}>{compMeaning}</Text> : null}
                    </View>
                  );
                })}
              </View>
            </DetailSection>
          ) : null}

          {subject.meaningMnemonic ? (
            <DetailSection title={subject.type === 'radical' ? 'Mnemonic' : 'Meaning Explanation'} theme={theme} styles={styles}>
              <MnemonicText text={subject.meaningMnemonic} subjectLookup={componentSubjects} styles={styles} theme={theme} />
              {subject.meaningHint ? (
                <Text style={styles.hintText}>Hint: {subject.meaningHint}</Text>
              ) : null}
              <InlineEditField
                label="Meaning Note"
                value={studyMaterial.meaningNote}
                editing={editingField === 'meaningNote'}
                editValue={editValue}
                isSaving={isSaving}
                onEdit={() => { setEditingField('meaningNote'); setEditValue(studyMaterial.meaningNote); }}
                onChangeText={setEditValue}
                onSave={() => handleSave('meaningNote', editValue)}
                onCancel={() => setEditingField(null)}
              />
            </DetailSection>
          ) : null}

          {subject.readingMnemonic ? (
            <DetailSection title="Reading Explanation" theme={theme} styles={styles}>
              <MnemonicText text={subject.readingMnemonic} subjectLookup={componentSubjects} styles={styles} theme={theme} />
              {subject.readingHint ? (
                <Text style={styles.hintText}>Hint: {subject.readingHint}</Text>
              ) : null}
              <InlineEditField
                label="Reading Note"
                value={studyMaterial.readingNote}
                editing={editingField === 'readingNote'}
                editValue={editValue}
                isSaving={isSaving}
                onEdit={() => { setEditingField('readingNote'); setEditValue(studyMaterial.readingNote); }}
                onChangeText={setEditValue}
                onSave={() => handleSave('readingNote', editValue)}
                onCancel={() => setEditingField(null)}
              />
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

          {amalgamationSubjects.size > 0 ? (
            <DetailSection title="Used In" theme={theme} styles={styles}>
              <View style={styles.componentRow}>
                {[...amalgamationSubjects.values()].map((amalgam) => {
                  const amColor = colorForSubjectType(theme.colors, amalgam.type);
                  return (
                    <Pressable key={amalgam.id ?? amalgam.japanese} onPress={() => amalgam.id && navigation.push('SubjectDetail', { subjectId: amalgam.id })}>
                      <View style={[styles.componentChip, { borderColor: amColor }]}>
                        <ComponentChipContent subject={amalgam} styles={styles} color={amColor} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </DetailSection>
          ) : null}

          {editingField === 'synonym' ? (
            <DetailSection title="Edit Synonyms" theme={theme} styles={styles}>
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
                <Pressable style={[styles.editButton, styles.editButtonPrimary]} onPress={() => handleSave('synonym', editValue)} disabled={isSaving}>
                  <Text style={styles.editButtonPrimaryText}>{isSaving ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </View>
            </DetailSection>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailSection({ title, children, theme, styles }: {
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

function ComponentChipContent({ subject, styles, color }: { subject: SubjectAnswerData; styles: ReturnType<typeof makeStyles>; color: string }) {
  if (!subject.japanese && subject.characterImageUrl && !subject.characterImageIsSvg) {
    return <Image source={{ uri: subject.characterImageUrl }} style={styles.componentChipImage} resizeMode="contain" />;
  }
  return <Text style={[styles.componentChipText, { color }]}>{subject.japanese || subject.type}</Text>;
}

function MnemonicText({ text, subjectLookup, styles, theme }: {
  text: string;
  subjectLookup: Map<number, SubjectAnswerData>;
  styles: ReturnType<typeof makeStyles>;
  theme: AppTheme;
}) {
  const colorMap: Record<string, string> = {
    radical: theme.colors.radical,
    kanji: theme.colors.kanji,
    reading: theme.colors.vocabulary,
    meaning: theme.colors.kanji,
  };
  const tokens = parseMnemonic(text);
  return (
    <Text style={styles.sectionValue}>
      {tokens.map((token, idx) => {
        if (token.type === 'tag') {
          const color = colorMap[token.tag ?? ''] ?? theme.colors.kanji;
          return <Text key={idx} style={[styles.mnemonicHighlight, { color }]}>{token.text}</Text>;
        }
        if (token.type === 'curly') {
          const content = token.text;
          const subj = [...subjectLookup.values()].find(
            (s) => s.meanings.some((m) => m.meaning.toLowerCase() === content.toLowerCase()) || s.japanese === content,
          );
          if (subj?.japanese) {
            return <Text key={idx} style={styles.mnemonicHighlight}>{subj.japanese}</Text>;
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

function InlineEditButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={onPress} style={{ marginTop: 6 }}>
      <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function InlineEditField({ label, value, editing, editValue, isSaving, onEdit, onChangeText, onSave, onCancel }: {
  label: string;
  value: string;
  editing: boolean;
  editValue: string;
  isSaving: boolean;
  onEdit: () => void;
  onChangeText: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const theme = useAppTheme();

  if (!editing) {
    return (
      <View style={{ marginTop: 8, gap: 4 }}>
        <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '800' }}>{label}</Text>
        {value ? <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>{value}</Text> : null}
        <Pressable onPress={onEdit}>
          <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '700' }}>{value ? 'Edit' : `Add ${label}`}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '800' }}>{label}</Text>
      <TextInput
        style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated, color: theme.colors.text, paddingHorizontal: 12, fontSize: 14, fontWeight: '700' }}
        value={editValue}
        onChangeText={onChangeText}
        autoFocus
        multiline
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={onCancel} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onSave} disabled={isSaving} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.colors.kanji }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{isSaving ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
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
    },
    loadingText: {
      color: theme.colors.mutedText,
      fontSize: 16,
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
