import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiquidGlassButton } from '../components/LiquidGlassButton';
import { openAppDatabase } from '../domain/db/database';
import { SubjectListRow, getSubjectsByLevel } from '../domain/db/subjectRepository';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'SubjectCatalog'>;

type GroupedSubjects = {
  subjectType: string;
  items: SubjectListRow[];
};

export function SubjectCatalogScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const level = route.params.level;
  const [groups, setGroups] = useState<GroupedSubjects[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const db = await openAppDatabase();
      const rows = await getSubjectsByLevel(db, level);
      const typeOrder = ['radical', 'kanji', 'vocabulary'];
      const grouped: GroupedSubjects[] = [];
      for (const st of typeOrder) {
        const items = rows.filter((r) => r.subjectType === st);
        if (items.length > 0) {
          grouped.push({ subjectType: st, items });
        }
      }
      setGroups(grouped);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [level]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  return (
    <SafeAreaView className="flex-1 bg-[#f7f4ef] dark:bg-[#0c0b0f]">
      <LiquidGlassButton
        label="Back"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Go back"
        className="self-start mx-5 mt-3"
        style={{ paddingHorizontal: 13, paddingVertical: 9 }}
        contentClassName="font-black"
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 18 }}>
        <Text className="text-4xl font-black tracking-tighter text-text dark:text-text-dark">
          Level {level}
        </Text>
        {isLoading ? (
          <Text className="text-[16px] font-heavy text-text-muted dark:text-text-muted-dark">
            Loading...
          </Text>
        ) : error ? (
          <Text className="text-[16px] font-heavy text-danger dark:text-danger-dark">
            {error}
          </Text>
        ) : (
          groups.map((group) => (
            <View key={group.subjectType} className="gap-[10px]">
              <Text className="text-[13px] font-black uppercase tracking-ultra text-text-muted dark:text-text-muted-dark">
                {group.subjectType}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {group.items.map((item) => {
                  const color = colorForSubjectType(colors, item.subjectType);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => navigation.navigate('SubjectDetail', { subjectId: item.id })}
                      className="rounded-[12px] px-3 py-2 bg-[#fffdf8] dark:bg-[#15141a] border-[1.5px]"
                      style={({ pressed }) => ({
                        borderColor: color,
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.japanese || 'subject'}, ${item.subjectType}`}
                    >
                      <Text className="text-lg font-black" style={{ color: colors.text }}>
                        {item.japanese || '?'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
