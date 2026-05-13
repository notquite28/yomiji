import React from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SubjectAnswerData } from '../domain/answers/answerChecker';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

export type SubjectDetailsContentProps = {
  subject: SubjectAnswerData;
  componentSubjects: Map<number, SubjectAnswerData>;
  amalgamationSubjects: Map<number, SubjectAnswerData>;
  studyMaterial: { meaningSynonyms: string[]; meaningNote: string; readingNote: string };
  meaningAttempted: boolean;
  readingAttempted: boolean;
  showFullAnswer: boolean;
  isReview: boolean;
  useKatakanaForOnyomi?: boolean;
  showAllReadings?: boolean;
  onNavigateToSubject?: (subjectId: number) => void;
  onEditMeaningNote?: (value: string) => void;
  onEditReadingNote?: (value: string) => void;
};

export function SubjectDetailsContent({
  subject,
  componentSubjects,
  amalgamationSubjects,
  studyMaterial,
  meaningAttempted,
  readingAttempted,
  showFullAnswer,
  isReview,
  useKatakanaForOnyomi = false,
  showAllReadings = false,
  onNavigateToSubject,
  onEditMeaningNote,
  onEditReadingNote,
}: SubjectDetailsContentProps) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  const primaryMeanings = subject.meanings
    .filter((m) => m.type === 'primary' && m.acceptedAnswer !== false)
    .map((m) => m.meaning);
  const secondaryMeanings = subject.meanings
    .filter((m) => m.type !== 'primary' && m.type !== 'blacklist' && m.acceptedAnswer !== false)
    .map((m) => m.meaning);
  const primaryReadings = (subject.readings ?? []).filter((r) => r.primary).map((r) => {
    if (useKatakanaForOnyomi && r.type === 'onyomi') return hiraganaToKatakana(r.reading);
    return r.reading;
  });
  const alternateReadings = showAllReadings
    ? (subject.readings ?? []).filter((r) => !r.primary && r.acceptedAnswer !== false).map((r) => {
        if (useKatakanaForOnyomi && r.type === 'onyomi') return hiraganaToKatakana(r.reading);
        return r.reading;
      })
    : [];

  const meaningShown = !isReview || showFullAnswer || meaningAttempted;
  const readingShown = !isReview || showFullAnswer || readingAttempted;

  const hiddenSections: React.ReactNode[] = [];

  const meaningSection = (
    <DetailSection key="meaning" title="Meaning" theme={theme} styles={styles}>
      <Text style={styles.sectionValue}>{primaryMeanings.join(', ')}</Text>
      {secondaryMeanings.length > 0 ? (
        <Text style={styles.sectionSecondary}>{secondaryMeanings.join(', ')}</Text>
      ) : null}
      {studyMaterial.meaningSynonyms.length > 0 ? (
        <Text style={styles.sectionSecondary}>Synonyms: {studyMaterial.meaningSynonyms.join(', ')}</Text>
      ) : null}
    </DetailSection>
  );

  const readingSection = primaryReadings.length > 0 ? (
    <DetailSection key="reading" title="Reading" theme={theme} styles={styles}>
      <Text style={styles.sectionValue}>{primaryReadings.join(', ')}</Text>
      {alternateReadings.length > 0 ? (
        <Text style={styles.sectionSecondary}>{alternateReadings.join(', ')}</Text>
      ) : null}
    </DetailSection>
  ) : null;

  const componentSection = componentSubjects.size > 0 ? (
    <DetailSection
      key="components"
      title={subject.type === 'kanji' ? 'Radical Combination' : 'Components'}
      theme={theme}
      styles={styles}
    >
      <View style={styles.componentRow}>
        {[...componentSubjects.values()].map((comp, idx) => {
          const compMeaning = comp.meanings.find((m) => m.type === 'primary' && m.acceptedAnswer !== false)?.meaning;
          const compColor = colorForSubjectType(theme.colors, comp.type);
          return (
            <View key={comp.id ?? comp.japanese} style={styles.componentPair}>
              {idx > 0 ? <Text style={styles.componentPlus}>+</Text> : null}
              <Pressable
                onPress={() => comp.id && onNavigateToSubject?.(comp.id)}
                disabled={!onNavigateToSubject}
              >
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
  ) : null;

  const meaningMnemonicSection = subject.meaningMnemonic ? (
    <DetailSection
      key="meaningMnemonic"
      title={subject.type === 'radical' ? 'Mnemonic' : 'Meaning Explanation'}
      theme={theme}
      styles={styles}
    >
      <MnemonicText text={subject.meaningMnemonic} subjectLookup={componentSubjects} styles={styles} theme={theme} />
      {subject.meaningHint ? (
        <Text style={styles.hintText}>Hint: {subject.meaningHint}</Text>
      ) : null}
      <DetailNoteField
        label="Meaning Note"
        value={studyMaterial.meaningNote}
        onSave={onEditMeaningNote}
      />
    </DetailSection>
  ) : null;

  const readingMnemonicSection = subject.readingMnemonic ? (
    <DetailSection key="readingMnemonic" title="Reading Explanation" theme={theme} styles={styles}>
      <MnemonicText text={subject.readingMnemonic} subjectLookup={componentSubjects} styles={styles} theme={theme} />
      {subject.readingHint ? (
        <Text style={styles.hintText}>Hint: {subject.readingHint}</Text>
      ) : null}
      <DetailNoteField
        label="Reading Note"
        value={studyMaterial.readingNote}
        onSave={onEditReadingNote}
      />
    </DetailSection>
  ) : null;

  const contextSentencesSection = subject.contextSentences && subject.contextSentences.length > 0 ? (
    <DetailSection key="context" title="Context Sentences" theme={theme} styles={styles}>
      {subject.contextSentences.map((sentence, idx) => (
        <View key={idx} style={styles.sentenceRow}>
          <Text style={styles.sentenceJa}>{sentence.ja}</Text>
          <Text style={styles.sentenceEn}>{sentence.en}</Text>
        </View>
      ))}
    </DetailSection>
  ) : null;

  const partsOfSpeechSection = subject.partsOfSpeech && subject.partsOfSpeech.length > 0 ? (
    <DetailSection key="pos" title="Part of Speech" theme={theme} styles={styles}>
      <Text style={styles.sectionValue}>{subject.partsOfSpeech.join(', ')}</Text>
    </DetailSection>
  ) : null;

  const amalgamationSection = amalgamationSubjects.size > 0 ? (
    <DetailSection key="amalgamations" title="Used In" theme={theme} styles={styles}>
      <View style={styles.componentRow}>
        {[...amalgamationSubjects.values()].map((amalgam) => {
          const amColor = colorForSubjectType(theme.colors, amalgam.type);
          return (
            <Pressable
              key={amalgam.id ?? amalgam.japanese}
              onPress={() => amalgam.id && onNavigateToSubject?.(amalgam.id)}
              disabled={!onNavigateToSubject}
            >
              <View style={[styles.componentChip, { borderColor: amColor }]}>
                <ComponentChipContent subject={amalgam} styles={styles} color={amColor} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </DetailSection>
  ) : null;

  type SectionEntry = { node: React.ReactNode; visible: boolean; key: string };
  const orderedSections: SectionEntry[] = [];

  if (meaningSection) orderedSections.push({ node: meaningSection, visible: meaningShown, key: 'meaning' });
  if (readingSection) orderedSections.push({ node: readingSection, visible: readingShown, key: 'reading' });
  if (componentSection) orderedSections.push({ node: componentSection, visible: true, key: 'components' });

  if (subject.type === 'radical') {
    if (meaningMnemonicSection) orderedSections.push({ node: meaningMnemonicSection, visible: meaningShown, key: 'meaningMnemonic' });
  } else {
    if (meaningMnemonicSection) orderedSections.push({ node: meaningMnemonicSection, visible: meaningShown, key: 'meaningMnemonic' });
    if (readingMnemonicSection) orderedSections.push({ node: readingMnemonicSection, visible: readingShown, key: 'readingMnemonic' });
  }

  const visibleSections: React.ReactNode[] = [];
  const hiddenQueue: React.ReactNode[] = [];
  let hasHidden = false;

  for (const entry of orderedSections) {
    if (entry.visible) {
      visibleSections.push(entry.node);
    } else {
      hiddenQueue.push(entry.node);
      hasHidden = true;
    }
  }

  const alwaysVisibleSections = [contextSentencesSection, partsOfSpeechSection, amalgamationSection].filter(
    Boolean,
  ) as React.ReactNode[];

  if (isReview && hasHidden && !showFullAnswer) {
    return (
      <View style={styles.sections}>
        {visibleSections}
        {alwaysVisibleSections}
      </View>
    );
  }

  return (
    <View style={styles.sections}>
      {orderedSections.map((entry) => entry.node)}
      {alwaysVisibleSections}
    </View>
  );
}

function DetailNoteField({ label, value, onSave }: {
  label: string;
  value: string;
  onSave?: (value: string) => void;
}) {
  const theme = useAppTheme();
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value);

  if (!onSave) {
    if (!value) return null;
    return (
      <View style={{ marginTop: 8, gap: 2 }}>
        <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '800' }}>{label}</Text>
        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>{value}</Text>
      </View>
    );
  }

  if (!editing) {
    return (
      <View style={{ marginTop: 8, gap: 4 }}>
        <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '800' }}>{label}</Text>
        {value ? <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>{value}</Text> : null}
        <Pressable onPress={() => { setEditing(true); setEditValue(value); }}>
          <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '700' }}>
            {value ? 'Edit' : `Add ${label}`}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '800' }}>{label}</Text>
      <TextInput
        style={{
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          color: theme.colors.text,
          paddingHorizontal: 12,
          fontSize: 14,
          fontWeight: '700',
        }}
        value={editValue}
        onChangeText={setEditValue}
        autoFocus
        multiline
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setEditing(false)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={() => { onSave(editValue); setEditing(false); }} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.colors.kanji }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function DetailSection({ title, children, theme, styles }: {
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

export function ComponentChipContent({ subject, styles, color }: { subject: SubjectAnswerData; styles: ReturnType<typeof makeStyles>; color: string }) {
  if (!subject.japanese && subject.characterImageUrl && !subject.characterImageIsSvg) {
    return <Image source={{ uri: subject.characterImageUrl }} style={styles.componentChipImage} resizeMode="contain" />;
  }
  return <Text style={[styles.componentChipText, { color }]}>{subject.japanese || subject.type}</Text>;
}

export type MnemonicToken =
  | { type: 'text'; text: string }
  | { type: 'tag'; tag: string; text: string }
  | { type: 'curly'; text: string };

const kTagPattern = /(<(vocabulary|reading|ja|jp|kanji|radical|kan|meaning|b|em|i|strong)>)(.*?)(<\/\2>)|(\{([^}]+)\})/gi;

export function parseMnemonic(text: string): MnemonicToken[] {
  const tokens: MnemonicToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = kTagPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    if (match[1] && match[3] !== undefined) {
      tokens.push({ type: 'tag', tag: match[2]!.toLowerCase(), text: match[3] });
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

const formattingTags = new Set(['b', 'em', 'i', 'strong']);

export function MnemonicText({ text, subjectLookup, styles, theme }: {
  text: string;
  subjectLookup: Map<number, SubjectAnswerData>;
  styles: ReturnType<typeof makeStyles>;
  theme: AppTheme;
}) {
  const colorMap: Record<string, string> = {
    radical: theme.colors.radical,
    kanji: theme.colors.kanji,
    kan: theme.colors.kanji,
    vocabulary: theme.colors.vocabulary,
    reading: theme.colors.vocabulary,
    ja: theme.colors.vocabulary,
    jp: theme.colors.vocabulary,
    meaning: theme.colors.kanji,
  };
  const tokens = parseMnemonic(text);
  return (
    <Text style={styles.sectionValue}>
      {tokens.map((token, idx) => {
        if (token.type === 'tag') {
          const tag = token.tag ?? '';
          const color = colorMap[tag] ?? theme.colors.text;
          const isFormatting = formattingTags.has(tag);
          return (
            <Text
              key={idx}
              style={[
                isFormatting ? styles.mnemonicBold : styles.mnemonicHighlight,
                { color },
              ]}
            >
              {token.text}
            </Text>
          );
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

function hiraganaToKatakana(text: string): string {
  const HIRAGANA_OFFSET = 0x3041;
  const KATAKANA_OFFSET = 0x30a1;
  const HIRAGANA_END = 0x3096;
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= HIRAGANA_OFFSET && code <= HIRAGANA_END) {
      result += String.fromCharCode(code - HIRAGANA_OFFSET + KATAKANA_OFFSET);
    } else {
      result += text[i];
    }
  }
  return result;
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
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
    mnemonicBold: {
      fontWeight: '900',
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
  });
}
