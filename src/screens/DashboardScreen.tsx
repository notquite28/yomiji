import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
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
import { describeSyncError, logSyncError } from '../domain/db/errorLog';

import { isSyncAuthError, runIncrementalSync, SyncProgress } from '../domain/sync/syncService';
import { useSyncStore } from '../domain/sync/syncStore';
import { RecentItemList, LeechItemList } from '../components/DashboardItemList';
import { LevelProgressChart } from '../components/LevelProgressChart';
import { ReviewForecastChart } from '../components/ReviewForecastChart';
import { SrsBar } from '../components/SrsBar';
import { TooltipPressable } from '../components/TooltipPressable';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/AppThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'> & {
  apiToken: string;
  onAuthError?: () => void;
};

export function DashboardScreen({ apiToken, navigation, onAuthError }: Props) {
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
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
  const [hasLoadedSummary, setHasLoadedSummary] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, reduceMotion]);

  const refreshSummary = useCallback(async () => {
    try {
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
    } finally {
      setHasLoadedSummary(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshSummary().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
    }, [refreshSummary]),
  );

  const storeSyncRevision = useSyncStore((s) => s.syncRevision);
  const prevSyncRevision = useRef(storeSyncRevision);
  useEffect(() => {
    if (storeSyncRevision !== prevSyncRevision.current) {
      prevSyncRevision.current = storeSyncRevision;
      refreshSummary().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
    }
  }, [refreshSummary, storeSyncRevision]);

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
    let db: Awaited<ReturnType<typeof openAppDatabase>> | null = null;
    try {
      db = await openAppDatabase();
      const client = new WaniKaniClient(apiToken);
      await runIncrementalSync({ db, client, onProgress: setSyncProgress, onCheckpoint: refreshSummary });
      await refreshSummary();
    } catch (caught) {
      if (db) {
        await logSyncError(db, caught, 'manual_sync').catch(() => {});
      }
      if (isSyncAuthError(caught)) {
        onAuthError?.();
        return;
      }
      setError(describeSyncError(caught).message);
    } finally {
      setSyncProgress(null);
      setIsRefreshing(false);
    }
  };

  const isVacation = Boolean(summary?.vacationStartedAt);
  const levelText = summary?.level ? `Level ${summary.level}` : 'Ready to sync';
  const lastSyncedText = summary?.lastSyncedAt ? formatDate(summary.lastSyncedAt) : 'Not yet';
  const storeSyncProgress = useSyncStore((s) => s.syncProgress);
  const storeSyncError = useSyncStore((s) => s.syncError);
  const activeSyncProgress = syncProgress ?? storeSyncProgress ?? null;
  const activeSyncError = error ?? storeSyncError ?? null;
  const hasLocalCache = Boolean(summary?.lastSyncedAt) || (summary?.cachedSubjects ?? 0) > 0;
  const shouldShowFirstSync = hasLoadedSummary && !hasLocalCache;
  const isSyncing = isRefreshing || Boolean(activeSyncProgress);
  const syncStatus = activeSyncProgress?.label ?? (summary?.lastSyncedAt ? 'Cache ready' : 'Pull to refresh or use the sync button below');
  const srsEntries = [
    { label: 'Apprentice', count: summary?.apprentice ?? 0, color: colors.apprentice, srsMin: 1, srsMax: 4 },
    { label: 'Guru', count: summary?.guru ?? 0, color: colors.guru, srsMin: 5, srsMax: 6 },
    { label: 'Master', count: summary?.master ?? 0, color: colors.master, srsMin: 7, srsMax: 7 },
    { label: 'Enlightened', count: summary?.enlightened ?? 0, color: colors.enlightened, srsMin: 8, srsMax: 8 },
    { label: 'Burned', count: summary?.burned ?? 0, color: colors.burned, srsMin: 9, srsMax: 9 },
  ];
  const totalSrs = srsEntries.reduce((total, row) => total + row.count, 0);
  const entranceStyle = reduceMotion
    ? undefined
    : {
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
  const actionGap = 14;

  const panelShadow = {
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.16 : 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 } as const,
    elevation: 4,
  };

  const primaryButtonShadow = {
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.2 : 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 } as const,
    elevation: 4,
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f7f4ef] dark:bg-[#0c0b0f]">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} tintColor={colors.kanji} onRefresh={sync} />}
      >
        <Animated.View className="flex-row items-start justify-between gap-4 px-[2px] pt-1.5 pb-1" style={entranceStyle}>
          <View className="flex-1">
            <Text className="text-[12px] font-heavy tracking-ultra3 uppercase text-text-muted dark:text-text-muted-dark">読路</Text>
            <Text className="mt-1.5 text-text dark:text-text-dark text-4xl font-black tracking-tighter">{summary?.username ?? 'Local cache'}</Text>
            <View className="flex-row flex-wrap gap-2 mt-2.5">
              {summary?.level ? (
                <TooltipPressable
                  tooltip="Browse subjects at your level"
                  accessibilityHint="Opens subject catalog grouped by type"
                  onPress={() => navigation.navigate('SubjectCatalog', { level: summary.level ?? 1 })}
                  className="rounded-full px-3 py-[7px] bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)] flex-row items-center gap-1.5"
                  style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
                >
                  <GridIcon color={colors.text} />
                  <Text className="text-text dark:text-text-dark text-[12px] font-black tracking-widest">{levelText}</Text>
                </TooltipPressable>
              ) : (
                <View className="rounded-full px-3 py-[7px] bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)] flex-row items-center gap-1.5">
                  <Text className="text-text dark:text-text-dark text-[12px] font-black tracking-widest">{levelText}</Text>
                </View>
              )}
              <View className="rounded-full px-3 py-[7px] bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)] flex-row items-center gap-1.5">
                <Text className="text-text dark:text-text-dark text-[12px] font-black tracking-widest">{summary?.cachedSubjects ?? 0} cached</Text>
              </View>
            </View>
          </View>
          <View className="flex-row gap-2">
            <TooltipPressable
              tooltip="Search subjects"
              accessibilityHint="Search by Japanese, meaning, or reading"
              onPress={() => navigation.navigate('SubjectSearch')}
              className="rounded-full w-[42px] h-[42px] items-center justify-center bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)]"
              style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
            >
              <SearchIcon color={colors.text} />
            </TooltipPressable>
            <TooltipPressable
              tooltip="Settings"
              accessibilityHint="Open app settings"
              onPress={() => navigation.navigate('Settings')}
              className="rounded-full w-[42px] h-[42px] items-center justify-center bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)]"
              style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
            >
              <SettingsIcon color={colors.text} />
            </TooltipPressable>
          </View>
        </Animated.View>

        {isVacation ? (
          <Text className="overflow-hidden rounded-lg px-4 py-[13px] bg-warning dark:bg-warning-dark text-white dark:text-[#1d1200] text-[14px] font-black tracking-wider">
            Vacation mode active
          </Text>
        ) : null}

        {shouldShowFirstSync ? (
          <View
            className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border-2 border-kanji gap-[14px]"
            style={panelShadow}
            accessibilityLiveRegion="polite"
          >
            <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">Sync your WaniKani data</Text>
            <Text className="text-text-muted dark:text-text-muted-dark text-base font-bold">
              Download your local cache before lessons, reviews, search, and subject details unlock. If your account has no available work yet, syncing still confirms your latest status.
            </Text>
            {activeSyncProgress ? <Text className="text-text-muted dark:text-text-muted-dark text-base font-bold">{activeSyncProgress.label}</Text> : null}
            {activeSyncError ? <Text className="text-danger dark:text-danger-dark text-[14px] font-bold" accessibilityRole="alert">{activeSyncError}</Text> : null}
            <Pressable
              disabled={isSyncing}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSyncing, busy: isSyncing }}
              accessibilityHint="Downloads subjects, assignments, reviews, and study data from WaniKani."
              onPress={sync}
              className="min-h-[54px] items-center justify-center rounded-xl bg-kanji"
              style={({ pressed }) => [
                primaryButtonShadow,
                (pressed || isSyncing) && { opacity: 0.7, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text className="text-white text-[16px] font-black tracking-wide">{isSyncing ? 'Syncing…' : 'Sync WaniKani data'}</Text>
            </Pressable>
          </View>
        ) : null}

        <Animated.View
          key={isDark ? 'dark-actions' : 'light-actions'}
          style={[entranceStyle, { alignSelf: 'stretch', width: '100%', flexDirection: isCompact ? 'column' : 'row', gap: 14 }]}
        >
          <StudyAction
            label="Lessons"
            hint="Unlocked pool"
            value={summary?.availableLessons ?? 0}
            color={colors.radical}
            isCompact={isCompact}
            disabled={isVacation}
            reduceMotion={reduceMotion}
            onPress={() => navigation.navigate('LessonSession', {})}
          />
          <StudyAction
            label="Reviews"
            hint="Due now"
            value={summary?.availableReviews ?? 0}
            color={colors.kanji}
            isCompact={isCompact}
            disabled={isVacation}
            reduceMotion={reduceMotion}
            onPress={() => navigation.navigate('ReviewSession')}
          />
        </Animated.View>

        {(summary?.availableLessons ?? 0) > 0 && !isVacation ? (
          <Animated.View style={entranceStyle}>
            <Pressable
              onPress={() => navigation.navigate('LessonPicker')}
              className="min-h-[48px] items-center justify-center rounded-lg bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)]"
              style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
            >
              <Text className="text-text-muted dark:text-text-muted-dark text-[14px] font-black tracking-wider">Lesson Picker</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {forecast.length > 0 ? (
          <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[14px]" style={panelShadow}>
            <View className="flex-row items-center justify-between gap-2.5">
              <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">Upcoming Reviews</Text>
            </View>
            <ReviewForecastChart
              hours={forecast}
              barColor={colors.kanji}
              textColor={colors.text}
              mutedColor={colors.mutedText}
              trackColor={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)'}
            />
          </View>
        ) : null}

        {levelProgress.length > 0 ? (
          <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[14px]" style={panelShadow}>
            <View className="flex-row items-center justify-between gap-2.5">
              <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">Current Level</Text>
              <Text className="text-text-muted dark:text-text-muted-dark text-[13px] font-heavy">Level {summary?.level}</Text>
            </View>
            <LevelProgressChart
              progress={levelProgress}
              colors={colors}
              textColor={colors.text}
              mutedColor={colors.mutedText}
              trackColor={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)'}
            />
          </View>
        ) : null}

        <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[14px]" style={panelShadow}>
          <View className="flex-row items-center justify-between gap-2.5">
            <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">SRS</Text>
            <Text className="text-text-muted dark:text-text-muted-dark text-[13px] font-heavy">{totalSrs} active</Text>
          </View>
          <SrsBar
            entries={srsEntries}
            textColor={colors.text}
            mutedColor={colors.mutedText}
            trackColor={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)'}
            onEntryPress={(entry) => {
              if (entry.srsMin != null && entry.srsMax != null) {
                navigation.navigate('SubjectBrowse', {
                  title: entry.label,
                  srsMin: entry.srsMin,
                  srsMax: entry.srsMax,
                });
              }
            }}
          />
        </View>

        {recentMistakes.length > 0 ? (
          <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[14px]" style={panelShadow}>
            <View className="flex-row items-center justify-between gap-2.5">
              <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">Recent Mistakes</Text>
              <Pressable
                onPress={() => navigation.navigate('ReviewSession', { practiceSource: 'recentMistakes' })}
                className="min-h-[34px] px-[14px] items-center justify-center rounded-full bg-kanji"
                style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
              >
                <Text className="text-white text-[13px] font-black tracking-wide">Practice</Text>
              </Pressable>
            </View>
            <RecentItemList items={recentMistakes} colors={colors} />
          </View>
        ) : null}

        {allLeeches.length > 0 ? (
          <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[14px]" style={panelShadow}>
            <View className="flex-row items-center justify-between gap-2.5">
              <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">Leeches</Text>
              <Pressable
                onPress={() => navigation.navigate('ReviewSession', { practiceSource: 'allLeeches' })}
                className="min-h-[34px] px-[14px] items-center justify-center rounded-full bg-kanji"
                style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
              >
                <Text className="text-white text-[13px] font-black tracking-wide">Practice</Text>
              </Pressable>
            </View>
            <LeechItemList items={allLeeches} colors={colors} />
          </View>
        ) : null}

        {apprenticeLeeches.length > 0 && allLeeches.length === 0 ? (
          <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[14px]" style={panelShadow}>
            <View className="flex-row items-center justify-between gap-2.5">
              <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">Apprentice Leeches</Text>
              <Pressable
                onPress={() => navigation.navigate('ReviewSession', { practiceSource: 'apprenticeLeeches' })}
                className="min-h-[34px] px-[14px] items-center justify-center rounded-full bg-kanji"
                style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
              >
                <Text className="text-white text-[13px] font-black tracking-wide">Practice</Text>
              </Pressable>
            </View>
            <LeechItemList items={apprenticeLeeches} colors={colors} />
          </View>
        ) : null}

        {burnedCount > 0 || excludedCount > 0 ? (
          <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[14px]" style={panelShadow}>
            <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">Shortcuts</Text>
            {burnedCount > 0 ? (
              <Pressable
                onPress={() => navigation.navigate('ReviewSession', { practiceSource: 'burnedItems' })}
                className="flex-row items-center gap-2.5 pt-2 border-t border-[rgba(128,128,128,0.08)]"
                style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
              >
                <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.burned }} />
                <Text className="flex-1 text-base font-heavy text-text dark:text-text-dark">Burned Item Practice</Text>
                <Text className="text-[12px] font-bold" style={{ color: colors.mutedText }}>{burnedCount}</Text>
              </Pressable>
            ) : null}
            {excludedCount > 0 ? (
              <Pressable
                onPress={() => navigation.navigate('SubjectBrowse', { title: 'Excluded Items', excluded: true })}
                className="flex-row items-center gap-2.5 pt-2 border-t border-[rgba(128,128,128,0.08)]"
                style={({ pressed }) => pressed ? { opacity: 0.7, transform: [{ scale: 0.99 }] } : undefined}
              >
                <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.mutedText }} />
                <Text className="flex-1 text-base font-heavy text-text dark:text-text-dark">Excluded Items</Text>
                <Text className="text-[12px] font-bold" style={{ color: colors.mutedText }}>{excludedCount}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[14px]" style={panelShadow}>
          <View className="flex-row items-center justify-between gap-2.5">
            <Text className="text-text dark:text-text-dark text-2xl font-black tracking-tight">Sync</Text>
            <Text className="text-text-muted dark:text-text-muted-dark text-[13px] font-heavy">{lastSyncedText}</Text>
          </View>
          <Text className="text-text-muted dark:text-text-muted-dark text-base font-bold">{syncStatus}</Text>
          {activeSyncError ? <Text className="text-danger dark:text-danger-dark text-[14px] font-bold">{activeSyncError}</Text> : null}
          <Pressable
            disabled={isRefreshing}
            onPress={sync}
            className="min-h-[54px] items-center justify-center rounded-xl bg-kanji"
            style={({ pressed }) => [
              primaryButtonShadow,
              (pressed || isRefreshing) && { opacity: 0.7, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text className="text-white text-[16px] font-black tracking-wide">{isRefreshing ? 'Syncing...' : 'Sync now'}</Text>
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
  isCompact,
  disabled,
  reduceMotion,
  onPress,
}: {
  label: string;
  hint: string;
  value: number;
  color: string;
  isCompact: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const isDisabled = disabled || value <= 0;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isDisabled || reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isDisabled, reduceMotion, pulse]);

  const cardBg = isDark ? '#15141a' : '#fffdf8';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(32,26,36,0.08)';

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      android_ripple={{ color: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(32,26,36,0.05)' }}
      accessibilityLabel={`${label}: ${value} available`}
      accessibilityHint={hint}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => ({
        flex: isCompact ? 0 : 1,
        width: isCompact ? '100%' : undefined,
        minHeight: isCompact ? 150 : 180,
        borderRadius: 26,
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: cardBorder,
        overflow: 'hidden',
        opacity: isDisabled ? 0.45 : pressed ? 0.95 : 1,
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.22 : 0.07,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 6,
        transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
      })}
    >
      {/* Colored top accent strip */}
      <View
        style={{
          height: 4,
          backgroundColor: isDisabled ? colors.mutedText : color,
          opacity: isDisabled ? 0.35 : 1,
        }}
      />

      {/* Card body */}
      <View style={{ flex: 1, padding: 18, justifyContent: 'space-between' }}>
        {/* Label row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            className="text-[11px] leading-[14px] font-black tracking-ultra2 uppercase"
            style={{ color: colors.mutedText }}
          >
            {label}
          </Text>
          {!isDisabled && (
            <Animated.View
              importantForAccessibility="no"
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: color,
                opacity: pulse,
                shadowColor: color,
                shadowOpacity: 0.5,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
          )}
        </View>

        {/* Hero number */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          style={{
            color: isDisabled ? colors.mutedText : color,
            fontSize: 72,
            fontWeight: '900',
            letterSpacing: -2,
            opacity: isDisabled ? 0.4 : 1,
          }}
        >
          {value}
        </Text>

        {/* Hint row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text className="text-[13px] font-bold tracking-normal" style={{ color: colors.mutedText }}>
            {hint}
          </Text>
          <StudyChevron color={isDisabled ? colors.mutedText : color} />
        </View>
      </View>
    </Pressable>
  );
}

function StudyChevron({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 12, justifyContent: 'center', alignItems: 'flex-end' }} importantForAccessibility="no">
      <View
        style={{
          width: 8,
          height: 8,
          borderRightWidth: 2,
          borderTopWidth: 2,
          borderColor: color,
          borderRadius: 1,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 18, gap: 4, alignItems: 'flex-end' }}>
      <View style={{ height: 2, borderRadius: 999, backgroundColor: color, width: 16 }} />
      <View style={{ height: 2, borderRadius: 999, backgroundColor: color, width: 11 }} />
      <View style={{ height: 2, borderRadius: 999, backgroundColor: color, width: 14 }} />
    </View>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 18, height: 18, position: 'relative' }}>
      <View style={{ width: 13, height: 13, borderRadius: 999, borderWidth: 2, borderColor: color, position: 'absolute', top: 0, left: 0 }} />
      <View style={{ width: 7, height: 2, borderRadius: 999, backgroundColor: color, position: 'absolute', bottom: 1, right: 0, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

function GridIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 12, height: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 4, height: 4, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 4, height: 4, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 4, height: 4, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
