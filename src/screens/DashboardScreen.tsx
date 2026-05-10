import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WaniKaniClient } from '../domain/api/WaniKaniClient';
import { DashboardSummary, getDashboardSummary } from '../domain/dashboard/dashboardRepository';
import { openAppDatabase } from '../domain/db/database';
import { runIncrementalSync, SyncProgress } from '../domain/sync/syncService';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'> & {
  apiToken: string;
  lifecycleSyncProgress?: SyncProgress | null;
  lifecycleSyncError?: string | null;
  syncRevision?: number;
};

export function DashboardScreen({ apiToken, navigation, lifecycleSyncProgress, lifecycleSyncError, syncRevision }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    const db = await openAppDatabase();
    setSummary(await getDashboardSummary(db));
  }, []);

  useEffect(() => {
    refreshSummary().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [refreshSummary, syncRevision]);

  const sync = async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      const db = await openAppDatabase();
      const client = new WaniKaniClient(apiToken);
      await runIncrementalSync({ db, client, onProgress: setSyncProgress, onCheckpoint: refreshSummary });
      await refreshSummary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsRefreshing(false);
    }
  };

  const isVacation = Boolean(summary?.vacationStartedAt);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} tintColor={theme.colors.kanji} onRefresh={sync} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>Yomichi</Text>
            <Text style={styles.title}>{summary?.username ?? 'Local cache'}</Text>
            <Text style={styles.subtitle}>{summary?.level ? `Level ${summary.level}` : 'Sync WaniKani to populate the dashboard.'}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Settings')} style={styles.settingsButton}>
            <Text style={styles.settingsText}>Settings</Text>
          </Pressable>
        </View>

        {isVacation ? <Text style={styles.vacationBanner}>Vacation mode is active. Reviews, lessons, notifications, and badges stay quiet.</Text> : null}

        <View style={styles.actionStack}>
          <StudyAction
            label="Advanced Lessons"
            value={summary?.availableLessons ?? 0}
            color={theme.colors.radical}
            disabled={isVacation}
            featured
            onPress={() => navigation.navigate('LessonSession')}
          />
          <StudyAction
            label="Reviews"
            value={summary?.availableReviews ?? 0}
            color={theme.colors.kanji}
            disabled={isVacation}
            onPress={() => navigation.navigate('ReviewSession')}
          />
        </View>

        <Text style={styles.lessonFootnote}>
          WaniKani's recommended daily lesson queue is separate from the unlocked Advanced lesson pool. The API-backed count shown here is unlocked lessons.
        </Text>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>SRS Stack</Text>
            <Text style={styles.panelMeta}>{summary?.cachedSubjects ?? 0} subjects cached</Text>
          </View>
          <SrsRow label="Apprentice" count={summary?.apprentice ?? 0} color={theme.colors.apprentice} textColor={theme.colors.text} mutedColor={theme.colors.mutedText} />
          <SrsRow label="Guru" count={summary?.guru ?? 0} color={theme.colors.guru} textColor={theme.colors.text} mutedColor={theme.colors.mutedText} />
          <SrsRow label="Master" count={summary?.master ?? 0} color={theme.colors.master} textColor={theme.colors.text} mutedColor={theme.colors.mutedText} />
          <SrsRow label="Enlightened" count={summary?.enlightened ?? 0} color={theme.colors.enlightened} textColor={theme.colors.text} mutedColor={theme.colors.mutedText} />
          <SrsRow label="Burned" count={summary?.burned ?? 0} color={theme.colors.burned} textColor={theme.colors.text} mutedColor={theme.colors.mutedText} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Sync Foundation</Text>
          <Text style={styles.bodyText}>{syncProgress?.label ?? lifecycleSyncProgress?.label ?? 'Pull to refresh or run sync to update the local SQLite cache.'}</Text>
          <Text style={styles.bodyText}>Last sync: {summary?.lastSyncedAt ? formatDate(summary.lastSyncedAt) : 'not yet synced'}</Text>
          {error || lifecycleSyncError ? <Text style={styles.errorText}>{error ?? lifecycleSyncError}</Text> : null}
          <Pressable disabled={isRefreshing} onPress={sync} style={({ pressed }) => [styles.primaryButton, (pressed || isRefreshing) && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{isRefreshing ? 'Syncing...' : 'Run Sync'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StudyAction({
  label,
  value,
  color,
  disabled,
  featured = false,
  onPress,
}: {
  label: string;
  value: number;
  color: string;
  disabled: boolean;
  featured?: boolean;
  onPress: () => void;
}) {
  const isDisabled = disabled || value <= 0;
  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        actionStyles.card,
        featured ? actionStyles.featuredCard : actionStyles.secondaryCard,
        { backgroundColor: color, opacity: isDisabled ? 0.45 : pressed ? 0.72 : 1 },
      ]}
    >
      <Text style={[actionStyles.value, featured && actionStyles.featuredValue]}>{value}</Text>
      <View>
        <Text style={[actionStyles.label, featured && actionStyles.featuredLabel]}>{label}</Text>
        {featured ? <Text style={actionStyles.featuredHint}>Unlocked lesson pool</Text> : null}
        {!featured ? <Text style={actionStyles.secondaryHint}>Start session</Text> : null}
      </View>
    </Pressable>
  );
}

function SrsRow({ label, count, color, textColor, mutedColor }: { label: string; count: number; color: string; textColor: string; mutedColor: string }) {
  return (
    <View style={actionStyles.srsRow}>
      <View style={[actionStyles.dot, { backgroundColor: color }]} />
      <Text style={[actionStyles.srsLabel, { color: mutedColor }]}>{label}</Text>
      <Text style={[actionStyles.srsCount, { color: textColor }]}>{count}</Text>
    </View>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const actionStyles = StyleSheet.create({
  card: {
    borderRadius: 28,
    justifyContent: 'center',
    padding: 20,
  },
  featuredCard: {
    flex: 1.65,
    minHeight: 164,
    borderRadius: 32,
  },
  secondaryCard: {
    flex: 1,
    minHeight: 164,
  },
  value: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
  },
  featuredValue: {
    fontSize: 66,
  },
  label: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  featuredLabel: {
    fontSize: 18,
  },
  featuredHint: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    opacity: 0.84,
  },
  secondaryHint: {
    marginTop: 4,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    opacity: 0.82,
  },
  srsRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  srsLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  srsCount: {
    fontSize: 18,
    fontWeight: '900',
  },
});

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 20,
      gap: 18,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    kicker: {
      color: theme.colors.vocabulary,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: 4,
      color: theme.colors.text,
      fontSize: 34,
      fontWeight: '900',
    },
    subtitle: {
      marginTop: 4,
      color: theme.colors.mutedText,
      fontSize: 15,
      fontWeight: '700',
    },
    settingsButton: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    settingsText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '900',
    },
    vacationBanner: {
      overflow: 'hidden',
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.colors.warning,
      color: theme.isDark ? '#1d1200' : '#ffffff',
      fontSize: 14,
      fontWeight: '900',
    },
    actionStack: {
      flexDirection: 'row',
      gap: 12,
    },
    lessonFootnote: {
      marginTop: -8,
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    panel: {
      borderRadius: 28,
      padding: 20,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 10,
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    panelTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '900',
    },
    panelMeta: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '700',
    },
    bodyText: {
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 22,
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    primaryButton: {
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.kanji,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
