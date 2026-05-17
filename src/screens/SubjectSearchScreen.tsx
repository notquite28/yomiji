import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openAppDatabase } from '../domain/db/database';
import { SearchResult, searchSubjects } from '../domain/db/subjectRepository';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'SubjectSearch'>;

export function SubjectSearchScreen({ navigation }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef('');
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    latestQueryRef.current = text;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!text.trim()) {
      setResults([]);
      setSearched(false);
      setIsSearching(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (!isMountedRef.current || latestQueryRef.current !== text) {
        return;
      }
      setIsSearching(true);
      setError(null);
      try {
        const db = await openAppDatabase();
        const rows = await searchSubjects(db, text);
        if (!isMountedRef.current || latestQueryRef.current !== text) {
          return;
        }
        setResults(rows);
        setSearched(true);
      } catch (caught) {
        if (!isMountedRef.current || latestQueryRef.current !== text) {
          return;
        }
        setError(caught instanceof Error ? caught.message : String(caught));
        setResults([]);
        setSearched(true);
      } finally {
        if (isMountedRef.current && latestQueryRef.current === text) {
          setIsSearching(false);
        }
      }
    }, 250);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.searchBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleSearch}
          placeholder="Search Japanese, meaning, or reading..."
          placeholderTextColor={theme.colors.mutedText}
          autoFocus
          returnKeyType="search"
          accessibilityLabel="Search subjects"
          accessibilityHint="Search by Japanese, meaning, or reading."
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <Text style={styles.emptyText} accessibilityRole="alert">Could not search subjects: {error}</Text>
        ) : isSearching ? (
          <Text style={styles.emptyText}>Searching...</Text>
        ) : !query.trim() ? (
          <Text style={styles.emptyText}>Search synced subjects by Japanese, meaning, or reading. If this is your first launch, sync from the dashboard first.</Text>
        ) : searched && results.length === 0 ? (
          <Text style={styles.emptyText}>No results found for "{query}". Try another spelling, or sync from the dashboard if local data is empty.</Text>
        ) : (
          results.map((item) => {
            const color = colorForSubjectType(theme.colors, item.subjectType);
            return (
              <Pressable
                key={item.id}
                onPress={() => navigation.navigate('SubjectDetail', { subjectId: item.id })}
                style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${item.japanese || 'subject'}, level ${item.level}, ${item.subjectType}${item.percentageCorrect != null ? `, ${item.percentageCorrect}% correct` : ''}`}
              >
                <View style={[styles.typeDot, { backgroundColor: color }]} />
                <View style={styles.resultBody}>
                  <Text style={styles.resultJapanese}>{item.japanese || '?'}</Text>
                  <Text style={styles.resultMeta}>L{item.level} · {item.subjectType}</Text>
                </View>
                {item.percentageCorrect != null ? (
                  <Text style={styles.resultScore}>{item.percentageCorrect}%</Text>
                ) : null}
              </Pressable>
            );
          })
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
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    backButton: {
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
    input: {
      flex: 1,
      minHeight: 48,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
      color: theme.colors.text,
      paddingHorizontal: 16,
      fontSize: 16,
      fontWeight: '700',
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 28,
      gap: 6,
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
