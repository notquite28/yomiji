import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WaniKaniClient } from '../domain/api/WaniKaniClient';
import {
  getBurnedItemCount,
  getCurrentLevelProgress,
  getExcludedItemCount,
  getLeechedItems,
  getRecentMistakes,
  getReviewForecast,
  DashboardSummary,
  getDashboardSummary,
  LevelProgress,
  LeechedItem,
  RecentItem,
  ReviewForecastHour,
} from '../domain/dashboard/dashboardRepository';
import { openAppDatabase } from '../domain/db/database';
import { describeSyncError } from '../domain/db/errorLog';
import { AppSettings, defaultSettings, loadSettings } from '../domain/settings/settings';
import { isSyncAuthError, runIncrementalSync, SyncProgress } from '../domain/sync/syncService';
import { RecentItemList, LeechItemList } from '../components/DashboardItemList';
import { LevelProgressChart } from '../components/LevelProgressChart';
import { ReviewForecastChart } from '../components/ReviewForecastChart';
import { SrsBar } from '../components/SrsBar';
import { TooltipPressable } from '../components/TooltipPressable';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'> & {
  apiToken: string;
  lifecycleSyncProgress?: SyncProgress | null;
  lifecycleSyncError?: string | null;
  syncRevision?: number;
  onAuthError?: () => void;
};

type StudyActionTheme = {
  surfaceColor: string;
  borderColor: string;
  pillColor: string;
  mutedColor: string;
  rippleColor: string;
};

export function DashboardScreen({ apiToken, navigation, lifecycleSyncProgress, lifecycleSyncError, syncRevision, onAuthError }: Props) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const styles = makeStyles(theme, isCompact);
  const entrance = useRef(new Animated.Value(0)).current;
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [forecast, setForecast] = useState<ReviewForecastHour[]>([]);
  const [levelProgress, setLevelProgress] = useState<LevelProgress[]>([]);
  const [recentMistakes, setRecentMistakes] = useState<RecentItem[]>([]);
  const [apprenticeLeeches, setApprenticeLeeches] = useState<LeechedItem[]>([]);
  const [allLeeches, setAllLeeches] = useState<LeechedItem[]>([]);
  const [burnedCount, setBurnedCount] = useState(0);
  const [excludedCount, setExcludedCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const refreshSummary = useCallback(async () => {
    const db = await openAppDatabase();
    const [s, f, lp, rm, al, allL, bc, ec] = await Promise.all([
      getDashboardSummary(db),
      getReviewForecast(db, 24),
      getCurrentLevelProgress(db),
      getRecentMistakes(db, 5),
      getLeechedItems(db, { apprenticeOnly: true, limit: 5 }),
      getLeechedItems(db, { limit: 5 }),
      getBurnedItemCount(db),
      getExcludedItemCount(db),
    ]);
    setSummary(s);
    setForecast(f);
    setLevelProgress(lp);
    setRecentMistakes(rm);
    setApprenticeLeeches(al);
    setAllLeeches(allL);
    setBurnedCount(bc);
    setExcludedCount(ec);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshSummary().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
    }, [refreshSummary]),
  );

  const prevSyncRevision = useRef(syncRevision);
  useEffect(() => {
    if (syncRevision !== prevSyncRevision.current) {
      prevSyncRevision.current = syncRevision;
      refreshSummary().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
    }
  }, [refreshSummary, syncRevision]);

  useEffect(() => {
    if (!summary?.level) return;

    let lastHour = new Date().getHours();
    const interval = setInterval(() => {
      const currentHour = new Date().getHours();
      if (currentHour !== lastHour) {
        lastHour = currentHour;
        refreshSummary().catch(() => {});
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [summary?.level, refreshSummary]);

  const sync = async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      const db = await openAppDatabase();
      const client = new WaniKaniClient(apiToken);
      await runIncrementalSync({ db, client, onProgress: setSyncProgress, onCheckpoint: refreshSummary });
      await refreshSummary();
    } catch (caught) {
      if (isSyncAuthError(caught)) {
        onAuthError?.();
        return;
      }
      setError(describeSyncError(caught).message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const isVacation = Boolean(summary?.vacationStartedAt);
  const levelText = summary?.level ? `Level ${summary.level}` : 'Ready to sync';
  const lastSyncedText = summary?.lastSyncedAt ? formatDate(summary.lastSyncedAt) : 'Not yet';
  const syncStatus = syncProgress?.label ?? lifecycleSyncProgress?.label ?? (summary?.lastSyncedAt ? 'Cache ready' : 'Pull to refresh');
  const srsEntries = [
    { label: 'Apprentice', count: summary?.apprentice ?? 0, color: theme.colors.apprentice },
    { label: 'Guru', count: summary?.guru ?? 0, color: theme.colors.guru },
    { label: 'Master', count: summary?.master ?? 0, color: theme.colors.master },
    { label: 'Enlightened', count: summary?.enlightened ?? 0, color: theme.colors.enlightened },
    { label: 'Burned', count: summary?.burned ?? 0, color: theme.colors.burned },
  ];
  const totalSrs = srsEntries.reduce((total, row) => total + row.count, 0);
  const actionCardTheme: StudyActionTheme = {
    surfaceColor: theme.isDark ? '#15141a' : '#fffdf8',
    borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)',
    pillColor: theme.isDark ? '#201e26' : '#f2eee8',
    mutedColor: theme.colors.mutedText,
    rippleColor: theme.isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(32, 26, 36, 0.05)',
  };
  const entranceStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} tintColor={theme.colors.kanji} onRefresh={sync} />}
      >
        <Animated.View style={[styles.header, entranceStyle]}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>読路</Text>
            <Text style={styles.title}>{summary?.username ?? 'Local cache'}</Text>
            <View style={styles.metaRow}>
              {summary?.level ? (
                <TooltipPressable
                  tooltip="Browse subjects at your level"
                  accessibilityHint="Opens subject catalog grouped by type"
                  onPress={() => navigation.navigate('SubjectCatalog', { level: summary.level ?? 1 })}
                  style={({ pressed }) => [styles.metaPill, pressed && styles.pressed]}
                >
                  <GridIcon color={theme.colors.text} />
                  <Text style={styles.metaPillText}>{levelText}</Text>
                </TooltipPressable>
              ) : (
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>{levelText}</Text>
                </View>
              )}
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>{summary?.cachedSubjects ?? 0} cached</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TooltipPressable
              tooltip="Search subjects"
              accessibilityHint="Search by Japanese, meaning, or reading"
              onPress={() => navigation.navigate('SubjectSearch')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <SearchIcon color={theme.colors.text} />
            </TooltipPressable>
            <TooltipPressable
              tooltip="Settings"
              accessibilityHint="Open app settings"
              onPress={() => navigation.navigate('Settings')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <SettingsIcon color={theme.colors.text} />
            </TooltipPressable>
          </View>
        </Animated.View>

        {isVacation ? <Text style={styles.vacationBanner}>Vacation mode active</Text> : null}

        <Animated.View key={theme.isDark ? 'dark-actions' : 'light-actions'} style={[styles.actionStack, entranceStyle]}>
          <StudyAction
            label="Lessons"
            hint="Unlocked pool"
            value={summary?.availableLessons ?? 0}
            color={theme.colors.radical}
            cardTheme={actionCardTheme}
            isCompact={isCompact}
            disabled={isVacation}
            featured
            onPress={() => navigation.navigate('LessonSession', {})}
          />
          <StudyAction
            label="Reviews"
            hint="Due now"
            value={summary?.availableReviews ?? 0}
            color={theme.colors.kanji}
            cardTheme={actionCardTheme}
            isCompact={isCompact}
            disabled={isVacation}
            onPress={() => navigation.navigate('ReviewSession')}
          />
        </Animated.View>

        {(summary?.availableLessons ?? 0) > 0 && !isVacation ? (
          <Animated.View style={entranceStyle}>
            <Pressable onPress={() => navigation.navigate('LessonPicker')} style={({ pressed }) => [styles.pickerButton, pressed && styles.pressed]}>
              <Text style={styles.pickerButtonText}>Lesson Picker</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {forecast.length > 0 ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Upcoming Reviews</Text>
            </View>
            <ReviewForecastChart
              hours={forecast}
              barColor={theme.colors.kanji}
              textColor={theme.colors.text}
              mutedColor={theme.colors.mutedText}
              trackColor={theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)'}
            />
          </View>
        ) : null}

        {levelProgress.length > 0 ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Current Level</Text>
              <Text style={styles.panelMeta}>Level {summary?.level}</Text>
            </View>
            <LevelProgressChart
              progress={levelProgress}
              colors={theme.colors}
              textColor={theme.colors.text}
              mutedColor={theme.colors.mutedText}
              trackColor={theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)'}
            />
          </View>
        ) : null}

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>SRS</Text>
            <Text style={styles.panelMeta}>{totalSrs} active</Text>
          </View>
          <SrsBar
            entries={srsEntries}
            textColor={theme.colors.text}
            mutedColor={theme.colors.mutedText}
            trackColor={theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)'}
          />
        </View>

        {recentMistakes.length > 0 ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Recent Mistakes</Text>
              <Pressable
                onPress={() => navigation.navigate('ReviewSession', { practiceSource: 'recentMistakes' })}
                style={({ pressed }) => [styles.inlineButton, pressed && styles.pressed]}
              >
                <Text style={styles.inlineButtonText}>Practice</Text>
              </Pressable>
            </View>
            <RecentItemList items={recentMistakes} colors={theme.colors} />
          </View>
        ) : null}

        {allLeeches.length > 0 ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Leeches</Text>
            <LeechItemList items={allLeeches} colors={theme.colors} />
          </View>
        ) : null}

        {apprenticeLeeches.length > 0 && allLeeches.length === 0 ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Apprentice Leeches</Text>
            <LeechItemList items={apprenticeLeeches} colors={theme.colors} />
          </View>
        ) : null}

        {burnedCount > 0 || excludedCount > 0 ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Shortcuts</Text>
            {burnedCount > 0 ? (
              <View style={[styles.shortcutRow, { opacity: 0.6 }]}>
                <View style={[styles.typeDot, { backgroundColor: theme.colors.burned }]} />
                <Text style={[styles.shortcutLabel, { color: theme.colors.mutedText }]}>Burned Item Practice</Text>
                <Text style={[styles.shortcutMeta, { color: theme.colors.mutedText }]}>{burnedCount}</Text>
              </View>
            ) : null}
            {excludedCount > 0 ? (
              <View style={[styles.shortcutRow, { opacity: 0.6 }]}>
                <View style={[styles.typeDot, { backgroundColor: theme.colors.mutedText }]} />
                <Text style={[styles.shortcutLabel, { color: theme.colors.mutedText }]}>Excluded Items</Text>
                <Text style={[styles.shortcutMeta, { color: theme.colors.mutedText }]}>{excludedCount}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Sync</Text>
            <Text style={styles.panelMeta}>{lastSyncedText}</Text>
          </View>
          <Text style={styles.bodyText}>{syncStatus}</Text>
          {error || lifecycleSyncError ? <Text style={styles.errorText}>{error ?? lifecycleSyncError}</Text> : null}
          <Pressable disabled={isRefreshing} onPress={sync} style={({ pressed }) => [styles.primaryButton, (pressed || isRefreshing) && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{isRefreshing ? 'Syncing...' : 'Sync now'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StudyAction({
  label,
  hint,
  value,
  color,
  cardTheme,
  isCompact,
  disabled,
  featured = false,
  onPress,
}: {
  label: string;
  hint: string;
  value: number;
  color: string;
  cardTheme: StudyActionTheme;
  isCompact: boolean;
  disabled: boolean;
  featured?: boolean;
  onPress: () => void;
}) {
  const isDisabled = disabled || value <= 0;
  const iconColor = isDisabled ? cardTheme.mutedColor : color;
  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      android_ripple={{ color: cardTheme.rippleColor }}
      accessibilityLabel={`${label}: ${value} available`}
      accessibilityHint={hint}
      accessibilityRole="button"
      style={({ pressed }) => [
        actionStyles.card,
        featured ? actionStyles.featuredCard : actionStyles.secondaryCard,
        isCompact && actionStyles.compactCard,
        {
          backgroundColor: cardTheme.surfaceColor,
          borderColor: cardTheme.borderColor,
          opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <View pointerEvents="none" importantForAccessibility="no" style={[actionStyles.accentMark, { backgroundColor: color }]} />
      <Text style={[actionStyles.label, { color: cardTheme.mutedColor }]}>{label}</Text>
      <View style={[actionStyles.statusPill, { backgroundColor: cardTheme.pillColor }]} importantForAccessibility="no">
        <ArrowIcon color={iconColor} />
      </View>
      <View style={actionStyles.actionBody}>
        <Text
          numberOfLines={1}
          style={[actionStyles.value, featured && actionStyles.featuredValue, { color }]}
        >
          {value}
        </Text>
        <Text style={[actionStyles.hint, { color: cardTheme.mutedColor }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}

function ArrowIcon({ color }: { color: string }) {
  return (
    <View style={actionStyles.arrowIcon}>
      <View style={[actionStyles.arrowStem, { backgroundColor: color }]} />
      <View style={[actionStyles.arrowHeadTop, { backgroundColor: color }]} />
      <View style={[actionStyles.arrowHeadBottom, { backgroundColor: color }]} />
    </View>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <View style={actionStyles.settingsIcon}>
      <View style={[actionStyles.settingsLine, { backgroundColor: color, width: 16 }]} />
      <View style={[actionStyles.settingsLine, { backgroundColor: color, width: 11 }]} />
      <View style={[actionStyles.settingsLine, { backgroundColor: color, width: 14 }]} />
    </View>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <View style={actionStyles.searchIcon}>
      <View style={[actionStyles.searchCircle, { borderColor: color }]} />
      <View style={[actionStyles.searchHandle, { backgroundColor: color }]} />
    </View>
  );
}

function GridIcon({ color }: { color: string }) {
  return (
    <View style={actionStyles.gridIcon}>
      <View style={[actionStyles.gridDot, { backgroundColor: color }]} />
      <View style={[actionStyles.gridDot, { backgroundColor: color }]} />
      <View style={[actionStyles.gridDot, { backgroundColor: color }]} />
      <View style={[actionStyles.gridDot, { backgroundColor: color }]} />
    </View>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const actionStyles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  featuredCard: {
    flex: 1.65,
    minHeight: 172,
    borderRadius: 28,
  },
  secondaryCard: {
    flex: 1,
    minHeight: 172,
  },
  compactCard: {
    flex: 0,
    minHeight: 150,
  },
  accentMark: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    width: 28,
    height: 3,
    borderRadius: 999,
  },
  label: {
    position: 'absolute',
    top: 22,
    left: 18,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  statusPill: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  arrowIcon: {
    width: 15,
    height: 12,
    justifyContent: 'center',
  },
  arrowStem: {
    width: 15,
    height: 2,
    borderRadius: 999,
  },
  arrowHeadTop: {
    position: 'absolute',
    right: -1,
    top: 2,
    width: 8,
    height: 2,
    borderRadius: 999,
    transform: [{ rotate: '45deg' }],
  },
  arrowHeadBottom: {
    position: 'absolute',
    right: -1,
    bottom: 2,
    width: 8,
    height: 2,
    borderRadius: 999,
    transform: [{ rotate: '-45deg' }],
  },
  actionBody: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: 50,
    paddingBottom: 12,
  },
  value: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.6,
    lineHeight: 48,
  },
  featuredValue: {
    fontSize: 68,
    lineHeight: 74,
  },
  hint: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  settingsIcon: {
    width: 18,
    gap: 4,
    alignItems: 'flex-end',
  },
  settingsLine: {
    height: 2,
    borderRadius: 999,
  },
  searchIcon: {
    width: 18,
    height: 18,
    position: 'relative',
  },
  searchCircle: {
    width: 13,
    height: 13,
    borderRadius: 999,
    borderWidth: 2,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  searchHandle: {
    width: 7,
    height: 2,
    borderRadius: 999,
    position: 'absolute',
    bottom: 1,
    right: 0,
    transform: [{ rotate: '45deg' }],
  },
  gridIcon: {
    width: 12,
    height: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridDot: {
    width: 4,
    height: 4,
    borderRadius: 1,
  },
});

function makeStyles(theme: AppTheme, isCompact: boolean) {
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
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      paddingHorizontal: 2,
      paddingTop: 6,
      paddingBottom: 4,
    },
    headerCopy: {
      flex: 1,
    },
    kicker: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: 6,
      color: theme.colors.text,
      fontSize: 34,
      lineHeight: 39,
      fontWeight: '900',
      letterSpacing: -1.2,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    metaPill: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: theme.isDark ? '#201e26' : '#f2eee8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.06)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metaPillText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    iconButton: {
      borderRadius: 999,
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? '#201e26' : '#f2eee8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.06)',
    },
    pressed: {
      opacity: 0.7,
      transform: [{ scale: 0.99 }],
    },
    vacationBanner: {
      overflow: 'hidden',
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 13,
      backgroundColor: theme.colors.warning,
      color: theme.isDark ? '#1d1200' : '#ffffff',
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    actionStack: {
      flexDirection: isCompact ? 'column' : 'row',
      gap: 14,
    },
    panel: {
      borderRadius: 26,
      padding: 18,
      backgroundColor: theme.isDark ? '#15141a' : '#fffdf8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)',
      gap: 14,
      shadowColor: '#000000',
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    panelTitle: {
      color: theme.colors.text,
      fontSize: 21,
      fontWeight: '900',
      letterSpacing: -0.3,
    },
    panelMeta: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '800',
    },
    bodyText: {
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    primaryButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      backgroundColor: theme.colors.kanji,
      shadowColor: '#000000',
      shadowOpacity: theme.isDark ? 0.2 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    pickerButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.isDark ? '#201e26' : '#f2eee8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.06)',
    },
    pickerButtonText: {
      color: theme.colors.mutedText,
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    inlineButton: {
      minHeight: 34,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: theme.colors.kanji,
    },
    inlineButtonText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    shortcutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: 'rgba(128, 128, 128, 0.08)',
    },
    typeDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
    },
    shortcutLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '800',
    },
    shortcutMeta: {
      fontSize: 12,
      fontWeight: '700',
    },
  });
}
