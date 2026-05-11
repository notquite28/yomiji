import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openAppDatabase } from '../domain/db/database';
import { SubjectListRow, getSubjectsByLevel } from '../domain/db/subjectRepository';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'SubjectCatalog'>;

type GroupedSubjects = {
  subjectType: string;
  items: SubjectListRow[];
};

export function SubjectCatalogScreen({ navigation, route }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const level = route.params.level;
  const [groups, setGroups] = useState<GroupedSubjects[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSubjects = useCallback(async () => {
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
    setIsLoading(false);
  }, [level]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Level {level}</Text>
        {isLoading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : (
          groups.map((group) => (
            <View key={group.subjectType} style={styles.group}>
              <Text style={styles.groupTitle}>{group.subjectType}</Text>
              <View style={styles.itemGrid}>
                {group.items.map((item) => {
                  const color = colorForSubjectType(theme.colors, item.subjectType);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => navigation.navigate('SubjectDetail', { subjectId: item.id })}
                      style={({ pressed }) => [styles.itemChip, { borderColor: color }, pressed && styles.pressed]}
                    >
                      <Text style={[styles.itemJapanese, { color: theme.colors.text }]}>
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

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.isDark ? '#0c0b0f' : '#f7f4ef',
    },
    backButton: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 9,
      marginHorizontal: 20,
      marginTop: 12,
      backgroundColor: theme.isDark ? '#201e26' : '#f2eee8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.06)',
    },
    backText: {
      color: theme.colors.text,
      fontWeight: '900',
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 28,
      gap: 18,
    },
    title: {
      color: theme.colors.text,
      fontSize: 34,
      fontWeight: '900',
      letterSpacing: -1.2,
    },
    loadingText: {
      color: theme.colors.mutedText,
      fontSize: 16,
      fontWeight: '800',
    },
    group: {
      gap: 10,
    },
    groupTitle: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    itemGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    itemChip: {
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.isDark ? '#15141a' : '#fffdf8',
      borderWidth: 1.5,
    },
    itemJapanese: {
      fontSize: 18,
      fontWeight: '900',
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
