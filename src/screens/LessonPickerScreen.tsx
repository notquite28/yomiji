import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { openAppDatabase } from '../domain/db/database';
import { useSettingsStore } from '../domain/settings/settingsStore';
import { getLessonQueue, StudyQueueItem } from '../domain/study/studyRepository';
import { ScreenLayout, SessionHeader } from '../components/ScreenLayout';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'LessonPicker'>;

type LessonGroup = {
  level: number;
  radicals: StudyQueueItem[];
  kanji: StudyQueueItem[];
  vocabulary: StudyQueueItem[];
};

export function LessonPickerScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
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
        <View className="flex-1 items-center justify-center">
          <Text className="text-[16px] font-heavy text-text-muted dark:text-text-muted-dark">
            Loading lessons...
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  if (error) {
    return (
      <ScreenLayout>
        <SessionHeader onBack={() => navigation.goBack()} progress="Lesson Picker" />
        <View className="flex-1 items-center justify-center p-6 gap-[10px]">
          <Text className="text-2xl font-black text-text dark:text-text-dark text-center">
            Could not load lessons
          </Text>
          <Text className="text-base leading-[21px] font-bold text-text-muted dark:text-text-muted-dark text-center">
            {error}
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  if (allItems.length === 0) {
    return (
      <ScreenLayout>
        <SessionHeader onBack={() => navigation.goBack()} progress="Lesson Picker" />
        <View className="flex-1 items-center justify-center p-6 gap-[10px]">
          <Text className="text-2xl font-black text-text dark:text-text-dark text-center">
            No lessons ready
          </Text>
          <Text className="text-base leading-[21px] font-bold text-text-muted dark:text-text-muted-dark text-center">
            If you just signed in, sync WaniKani data from the dashboard first. Otherwise, you are caught up for now.
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout scrollable keyboardShouldPersistTaps>
      <SessionHeader onBack={() => navigation.goBack()} progress="Lesson Picker" />

      <View className="flex-row items-baseline justify-between mt-1">
        <Text className="text-[24px] font-black tracking-[-0.5] text-text dark:text-text-dark">
          Available Lessons
        </Text>
        <Text className="text-[14px] font-heavy text-text-muted dark:text-text-muted-dark">
          {allItems.length} items
        </Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {groups.map((group) => (
          <View key={group.level} className="mt-[18px]">
            <Text className="text-lg font-black text-text dark:text-text-dark mb-[10px]">
              Level {group.level}
            </Text>
            {renderTypeSection('Radicals', group.radicals, colors, selectedIds, toggleItem)}
            {renderTypeSection('Kanji', group.kanji, colors, selectedIds, toggleItem)}
            {renderTypeSection('Vocabulary', group.vocabulary, colors, selectedIds, toggleItem)}
          </View>
        ))}
      </ScrollView>

      <View className="pt-[14px]">
        <Pressable
          disabled={selectedIds.size === 0}
          onPress={beginLessons}
          className="min-h-[54px] items-center justify-center rounded-lg bg-radical"
          style={({ pressed }) => ({
            opacity: selectedIds.size === 0 ? 0.4 : pressed ? 0.7 : 1,
            transform: [{ scale: pressed && selectedIds.size > 0 ? 0.99 : 1 }],
          })}
          accessibilityRole="button"
          accessibilityLabel={selectedIds.size > 0 ? `Begin ${selectedIds.size} selected lessons` : 'Select lesson items before beginning'}
          accessibilityState={{ disabled: selectedIds.size === 0 }}
        >
          <Text className="text-[16px] font-black tracking-wide text-white">
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
  colors: ReturnType<typeof useAppTheme>['colors'],
  selectedIds: Set<number>,
  toggleItem: (subjectId: number) => void,
) {
  if (items.length === 0) return null;
  return (
    <View className="mb-[10px]">
      <Text className="text-[13px] font-black tracking-wider uppercase text-text-muted dark:text-text-muted-dark mb-1.5">
        {label} ({items.length})
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {items.map((item) => {
          const isSelected = selectedIds.has(item.subjectId);
          const color = colorForSubjectType(colors, item.subjectType);
          return (
            <Pressable
              key={item.subjectId}
              onPress={() => toggleItem(item.subjectId)}
              className="flex-row items-center rounded-[12px] px-3 py-2 bg-surface dark:bg-surface-dark border-2 gap-1.5"
              style={{ borderColor: isSelected ? color : colors.border }}
              accessibilityRole="button"
              accessibilityLabel={`${item.subject.japanese || 'subject'}, ${item.subjectType}, level ${item.level ?? 'unknown'}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text className="text-lg font-black" style={{ color: isSelected ? color : colors.text }}>
                {item.subject.japanese || '?'}
              </Text>
              {isSelected && <View className="w-2 h-2 rounded-[4px]" style={{ backgroundColor: color }} />}
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
