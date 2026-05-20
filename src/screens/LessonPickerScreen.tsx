import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { openAppDatabase } from '../domain/db/database';
import { AppSettings } from '../domain/settings/settings';
import { useSettingsStore } from '../domain/settings/settingsStore';
import { getLessonQueue, StudyQueueItem } from '../domain/study/studyRepository';
import { ScreenLayout, SessionHeader } from '../components/ScreenLayout';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'LessonPicker'>;

type LessonGroup = {
  level: number;
  radicals: StudyQueueItem[];
  kanji: StudyQueueItem[];
  vocabulary: StudyQueueItem[];
};

export function LessonPickerScreen({ navigation }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [allItems, setAllItems] = useState<StudyQueueItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const settings = useSettingsStore();

  useEffect(() => {
    let isMounted = true;
    openAppDatabase()
      .then((db) =>
        getLessonQueue(db, useSettingsStore.getState(), 100).then((items) => ({ items })),
      )
      .then(({ items }) => {
        if (isMounted) {
          setAllItems(items);
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

  const groups = buildGroups(allItems);

  const toggleItem = useCallback((subjectId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  }, []);

  const beginLessons = () => {
    if (selectedIds.size === 0) return;
    navigation.navigate('LessonSession', { selectedIds: Array.from(selectedIds) });
  };

  if (isLoading) {
    return (
      <ScreenLayout>
        <SessionHeader onBack={() => navigation.goBack()} progress="Lesson Picker" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading lessons...</Text>
        </View>
      </ScreenLayout>
    );
  }

  if (error) {
    return (
      <ScreenLayout>
        <SessionHeader onBack={() => navigation.goBack()} progress="Lesson Picker" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Could not load lessons</Text>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      </ScreenLayout>
    );
  }

  if (allItems.length === 0) {
    return (
      <ScreenLayout>
        <SessionHeader onBack={() => navigation.goBack()} progress="Lesson Picker" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No lessons ready</Text>
          <Text style={styles.emptyText}>If you just signed in, sync WaniKani data from the dashboard first. Otherwise, you are caught up for now.</Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout scrollable keyboardShouldPersistTaps>
      <SessionHeader onBack={() => navigation.goBack()} progress="Lesson Picker" />

      <View style={styles.headerRow}>
        <Text style={styles.title}>Available Lessons</Text>
        <Text style={styles.subtitle}>{allItems.length} items</Text>
      </View>

      <ScrollView style={styles.groupList} showsVerticalScrollIndicator={false}>
        {groups.map((group) => (
          <View key={group.level} style={styles.levelSection}>
            <Text style={styles.levelHeader}>Level {group.level}</Text>
            {renderTypeSection('Radicals', group.radicals, styles, theme, selectedIds, toggleItem)}
            {renderTypeSection('Kanji', group.kanji, styles, theme, selectedIds, toggleItem)}
            {renderTypeSection('Vocabulary', group.vocabulary, styles, theme, selectedIds, toggleItem)}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          disabled={selectedIds.size === 0}
          onPress={beginLessons}
          accessibilityRole="button"
          accessibilityLabel={selectedIds.size > 0 ? `Begin ${selectedIds.size} selected lessons` : 'Select lesson items before beginning'}
          accessibilityState={{ disabled: selectedIds.size === 0 }}
          style={({ pressed }) => [
            styles.beginButton,
            selectedIds.size === 0 && styles.beginButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.beginButtonText}>
            {selectedIds.size > 0 ? `Begin (${selectedIds.size})` : 'Select items'}
          </Text>
        </Pressable>
      </View>
    </ScreenLayout>
  );
}

function renderTypeSection(
  label: string,
  items: StudyQueueItem[],
  styles: ReturnType<typeof makeStyles>,
  theme: AppTheme,
  selectedIds: Set<number>,
  toggleItem: (subjectId: number) => void,
) {
  if (items.length === 0) return null;
  return (
    <View style={styles.typeSection}>
      <Text style={styles.typeLabel}>{label} ({items.length})</Text>
      <View style={styles.itemGrid}>
        {items.map((item) => {
          const isSelected = selectedIds.has(item.subjectId);
          const color = colorForSubjectType(theme.colors, item.subjectType);
          return (
            <Pressable
              key={item.subjectId}
              onPress={() => toggleItem(item.subjectId)}
              style={[styles.itemChip, { borderColor: isSelected ? color : theme.colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${item.subject.japanese || 'subject'}, ${item.subjectType}, level ${item.level ?? 'unknown'}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.itemText, { color: isSelected ? color : theme.colors.text }]}>
                {item.subject.japanese || '?'}
              </Text>
              {isSelected && <View style={[styles.checkDot, { backgroundColor: color }]} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function buildGroups(items: StudyQueueItem[]): LessonGroup[] {
  const groupMap = new Map<number, LessonGroup>();
  for (const item of items) {
    const level = item.level ?? 0;
    if (!groupMap.has(level)) {
      groupMap.set(level, { level, radicals: [], kanji: [], vocabulary: [] });
    }
    const group = groupMap.get(level)!;
    switch (item.subjectType) {
      case 'radical':
        group.radicals.push(item);
        break;
      case 'kanji':
        group.kanji.push(item);
        break;
      default:
        group.vocabulary.push(item);
        break;
    }
  }
  return Array.from(groupMap.values()).sort((a, b) => a.level - b.level);
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
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
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 10,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '900',
      textAlign: 'center',
    },
    emptyText: {
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
      textAlign: 'center',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    title: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    subtitle: {
      color: theme.colors.mutedText,
      fontSize: 14,
      fontWeight: '800',
    },
    groupList: {
      flex: 1,
    },
    levelSection: {
      marginTop: 18,
    },
    levelHeader: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 10,
    },
    typeSection: {
      marginBottom: 10,
    },
    typeLabel: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    itemGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    itemChip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 2,
      gap: 6,
    },
    itemText: {
      fontSize: 18,
      fontWeight: '900',
    },
    checkDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    footer: {
      paddingTop: 14,
    },
    beginButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.radical,
    },
    beginButtonDisabled: {
      opacity: 0.4,
    },
    beginButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    pressed: {
      opacity: 0.7,
      transform: [{ scale: 0.99 }],
    },
  });
}
