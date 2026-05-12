import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  SubjectListRow,
  getExcludedSubjects,
  getRemainingSubjects,
  getSubjectsBySrsBucket,
} from '../domain/db/subjectRepository';
import { openAppDatabase } from '../domain/db/database';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'SubjectBrowse'>;

export function SubjectBrowseScreen({ navigation, route }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const { title, srsMin, srsMax, excluded, remaining } = route.params;
  const [items, setItems] = useState<SubjectListRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const db = await openAppDatabase();
      let rows: SubjectListRow[];
      if (excluded) {
        rows = await getExcludedSubjects(db);
      } else if (remaining) {
        rows = await getRemainingSubjects(db);
      } else if (srsMin != null && srsMax != null) {
        rows = await getSubjectsBySrsBucket(db, srsMin, srsMax);
      } else {
        rows = [];
      }
      setItems(rows);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [excluded, remaining, srsMin, srsMax]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {isLoading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
            <Text style={styles.countMeta}>{items.length} items</Text>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>No items found.</Text>
            ) : (
              items.map((item) => {
                const color = colorForSubjectType(theme.colors, item.subjectType);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => navigation.navigate('SubjectDetail', { subjectId: item.id })}
                    style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                  >
                    <View style={[styles.typeDot, { backgroundColor: color }]} />
                    <View style={styles.resultBody}>
                      <Text style={styles.resultJapanese}>{item.japanese || '?'}</Text>
                      <Text style={styles.resultMeta}>
                        L{item.level} · {item.subjectType}
                      </Text>
                    </View>
                    {item.percentageCorrect != null ? (
                      <Text style={styles.resultScore}>{item.percentageCorrect}%</Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </>
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
      gap: 6,
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
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      paddingTop: 12,
    },
    countMeta: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '800',
      paddingBottom: 10,
    },
    emptyText: {
      color: theme.colors.mutedText,
      fontSize: 15,
      fontWeight: '700',
      paddingTop: 24,
      textAlign: 'center',
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: theme.isDark ? '#15141a' : '#fffdf8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(32, 26, 36, 0.06)',
    },
    typeDot: {
      width: 12,
      height: 12,
      borderRadius: 999,
    },
    resultBody: {
      flex: 1,
      gap: 2,
    },
    resultJapanese: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '900',
    },
    resultMeta: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    resultScore: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '800',
    },
    pressed: {
      opacity: 0.72,
      transform: [{ scale: 0.99 }],
    },
  });
}
