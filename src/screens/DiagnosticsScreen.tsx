import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import appConfig from '../../app.json';
import { WaniKaniClient } from '../domain/api/WaniKaniClient';
import { openAppDatabase } from '../domain/db/database';
import { clearErrorLog, ErrorLogEntry, getErrorLogEntries, getErrorLogCount } from '../domain/db/errorLog';
import { deleteApiToken, getApiToken } from '../domain/storage/secureToken';
import { isSyncAuthError, runFullRefresh } from '../domain/sync/syncService';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/AppThemeProvider';

const APP_VERSION = appConfig.expo.version;

type DiagnosticsData = {
  subjects: number;
  assignments: number;
  studyMaterials: number;
  reviewStats: number;
  levelProgressions: number;
  pendingProgress: number;
  pendingStudyMaterials: number;
  errorLogCount: number;
  lastSyncTime: string;
  syncCursors: Record<string, string>;
  recentErrors: ErrorLogEntry[];
};

type Props = NativeStackScreenProps<RootStackParamList, 'Diagnostics'> & {
  onForceLogout?: () => void;
};

export function DiagnosticsScreen({ navigation, onForceLogout }: Props) {
  const { isDark } = useAppTheme();
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    try {
      const db = await openAppDatabase();
      const subjects = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM subjects');
      const assignments = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM assignments');
      const studyMaterials = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM study_materials');
      const reviewStats = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM review_stats');
      const levelProgressions = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM level_progressions');
      const pendingProgress = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pending_progress');
      const pendingStudyMaterials = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pending_study_materials');
      const errorLogCount = await getErrorLogCount(db);
      const recentErrors = await getErrorLogEntries(db, 25);

      const cursorRows = await db.getAllAsync<{ collection: string; updated_after: string; synced_at: string }>('SELECT collection, updated_after, synced_at FROM sync_cursors');
      const syncCursors: Record<string, string> = {};
      let lastSyncTime = '';
      for (const row of cursorRows) {
        syncCursors[row.collection] = row.updated_after;
        if (row.synced_at && row.synced_at > lastSyncTime) {
          lastSyncTime = row.synced_at;
        }
      }

      setData({
        subjects: subjects?.count ?? 0,
        assignments: assignments?.count ?? 0,
        studyMaterials: studyMaterials?.count ?? 0,
        reviewStats: reviewStats?.count ?? 0,
        levelProgressions: levelProgressions?.count ?? 0,
        pendingProgress: pendingProgress?.count ?? 0,
        pendingStudyMaterials: pendingStudyMaterials?.count ?? 0,
        errorLogCount,
        lastSyncTime,
        syncCursors,
        recentErrors,
      });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  const handleExport = async () => {
    if (!data) return;

    const exportData = {
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      cache: {
        subjects: data.subjects,
        assignments: data.assignments,
        studyMaterials: data.studyMaterials,
        reviewStats: data.reviewStats,
        levelProgressions: data.levelProgressions,
      },
      pending: {
        progress: data.pendingProgress,
        studyMaterials: data.pendingStudyMaterials,
      },
      sync: {
        lastSyncTime: data.lastSyncTime || 'never',
        cursors: data.syncCursors,
      },
      errorLog: {
        count: data.errorLogCount,
        recent: data.recentErrors.map((e) => ({
          level: e.level,
          message: e.message,
          context: e.context,
          createdAt: e.created_at,
        })),
      },
    };

    try {
      await Share.share({
        message: JSON.stringify(exportData, null, 2),
        title: '読路 Diagnostics Export',
      });
    } catch {
      // Share API may not be available on all platforms
    }
  };

  const handleClearErrors = async () => {
    setIsClearing(true);
    try {
      const db = await openAppDatabase();
      await clearErrorLog(db);
      await loadDiagnostics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsClearing(false);
    }
  };

  const confirmClearErrors = () => {
    Alert.alert('Clear error log?', 'This removes all locally stored diagnostic errors.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: handleClearErrors },
    ]);
  };

  const handleFullRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const db = await openAppDatabase();
      const token = await getApiToken();
      await runFullRefresh({ db, client: new WaniKaniClient(token ?? '') });
      await loadDiagnostics();
    } catch (caught) {
      if (isSyncAuthError(caught)) {
        onForceLogout?.();
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsRefreshing(false);
    }
  };

  const confirmFullRefresh = () => {
    Alert.alert('Clear cache and resync?', 'This deletes cached WaniKani data on this device and downloads a fresh copy. Pending writes are preserved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear and Resync', style: 'destructive', onPress: handleFullRefresh },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f7f4ef] dark:bg-[#0c0b0f]">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 14 }}>
        <Pressable
          onPress={() => navigation.goBack()}
          className="self-start rounded-full px-[13px] py-[9px] bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)]"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-text dark:text-text-dark font-black">Back</Text>
        </Pressable>

        <View className="px-0.5 pt-[14px] pb-1.5">
          <Text className="text-xs font-heavy tracking-ultra3 uppercase text-text-muted dark:text-text-muted-dark">読路</Text>
          <Text className="mt-1.5 text-5xl font-black tracking-tightest text-text dark:text-text-dark">Diagnostics</Text>
          <Text className="mt-[10px] text-[16px] leading-[22px] font-bold text-text-muted dark:text-text-muted-dark">
            Cache state, sync status, and error log.
          </Text>
        </View>

        {error ? (
          <Text className="rounded-md px-4 py-3 bg-danger text-white text-[14px] font-heavy">{error}</Text>
        ) : null}

        <View
          className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-1.5"
          style={{
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.16 : 0.05,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <Text className="text-2xl font-black tracking-tight text-text dark:text-text-dark">App Info</Text>
          <InfoRow label="Version" value={`v${APP_VERSION}`} />
          <InfoRow label="Platform" value="React Native (Expo)" />
        </View>

        <View
          className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-1.5"
          style={{
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.16 : 0.05,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <Text className="text-2xl font-black tracking-tight text-text dark:text-text-dark">Cache</Text>
          <InfoRow label="Subjects" value={formatCount(data?.subjects)} />
          <InfoRow label="Assignments" value={formatCount(data?.assignments)} />
          <InfoRow label="Study Materials" value={formatCount(data?.studyMaterials)} />
          <InfoRow label="Review Statistics" value={formatCount(data?.reviewStats)} />
          <InfoRow label="Level Progressions" value={formatCount(data?.levelProgressions)} />
        </View>

        <View
          className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-1.5"
          style={{
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.16 : 0.05,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <Text className="text-2xl font-black tracking-tight text-text dark:text-text-dark">Sync</Text>
          <InfoRow label="Last Sync" value={data?.lastSyncTime ? formatDate(data.lastSyncTime) : 'Never'} />
          {Object.entries(data?.syncCursors ?? {}).map(([collection, cursor]) => (
            <InfoRow key={collection} label={collection} value={cursor || '(full)'} />
          ))}
        </View>

        <View
          className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-1.5"
          style={{
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.16 : 0.05,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <Text className="text-2xl font-black tracking-tight text-text dark:text-text-dark">Pending Writes</Text>
          <InfoRow label="Review/Lesson Progress" value={formatCount(data?.pendingProgress)} />
          <InfoRow label="Study Material Edits" value={formatCount(data?.pendingStudyMaterials)} />
          {(data?.pendingProgress ?? 0) > 0 || (data?.pendingStudyMaterials ?? 0) > 0 ? (
            <Text className="text-xs font-bold italic text-text-muted dark:text-text-muted-dark pt-1">
              Pending writes will flush on next background or manual sync.
            </Text>
          ) : null}
        </View>

        <View
          className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-1.5"
          style={{
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.16 : 0.05,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <View className="flex-row items-center justify-between gap-[10px]">
            <Text className="text-2xl font-black tracking-tight text-text dark:text-text-dark">Error Log</Text>
            <Text className="text-[13px] font-heavy text-text-muted dark:text-text-muted-dark">
              {formatCount(data?.errorLogCount)} entries
            </Text>
          </View>
          {data?.recentErrors.length ? (
            <View className="gap-2">
              {data.recentErrors.map((entry) => (
                <View key={entry.id} className="pt-2 border-t border-[rgba(128,128,128,0.1)] gap-0.5">
                  <Text className="text-[11px] font-heavy text-text-muted dark:text-text-muted-dark">
                    {formatDate(entry.created_at)}
                  </Text>
                  <Text className={`text-[11px] font-black uppercase tracking-[0.5] ${entry.level === 'error' ? 'text-danger dark:text-danger-dark' : 'text-warning dark:text-warning-dark'}`}>
                    {entry.level}
                  </Text>
                  <Text className="text-[13px] font-bold leading-[18px] text-text dark:text-text-dark" numberOfLines={2}>
                    {entry.message}
                  </Text>
                  {entry.context ? (
                    <Text className="text-xs font-bold leading-[16px] text-text-muted dark:text-text-muted-dark" numberOfLines={1}>
                      {entry.context}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-[14px] font-bold text-text-muted dark:text-text-muted-dark pt-1">
              No errors logged.
            </Text>
          )}
          {data?.errorLogCount ? (
            <Pressable
              disabled={isClearing}
              onPress={confirmClearErrors}
              className="min-h-[44px] items-center justify-center rounded-md bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)] mt-2"
              style={({ pressed }) =>
                pressed || isClearing ? { opacity: 0.72, transform: [{ scale: 0.99 }] } : undefined
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: isClearing, busy: isClearing }}
              accessibilityHint="Asks for confirmation before clearing stored diagnostics errors."
            >
              <Text className="text-[14px] font-black text-text dark:text-text-dark">
                {isClearing ? 'Clearing...' : 'Clear Error Log'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={handleExport}
          className="min-h-[54px] items-center justify-center rounded-[20px] bg-kanji"
          style={({ pressed }) => ({
            opacity: pressed ? 0.72 : 1,
            transform: [{ scale: pressed ? 0.99 : 1 }],
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.2 : 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          })}
          accessibilityRole="button"
          accessibilityLabel="Export diagnostics"
        >
          <Text className="text-[16px] font-black tracking-wide text-white">Export Diagnostics</Text>
        </Pressable>

        <View className="rounded-[26px] p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-danger dark:border-danger-dark gap-1.5">
          <Text className="text-2xl font-black tracking-tight text-text dark:text-text-dark">Full Refresh</Text>
          <Text className="text-[14px] font-bold leading-5 text-text-muted dark:text-text-muted-dark">
            Clear all cached data and re-download from WaniKani. Pending writes are preserved.
          </Text>
          {isRefreshing ? (
            <Text className="text-[14px] font-bold leading-5 text-text-muted dark:text-text-muted-dark" accessibilityLiveRegion="polite">
              Clearing cache and downloading a fresh copy…
            </Text>
          ) : null}
          <Pressable
            disabled={isRefreshing}
            onPress={confirmFullRefresh}
            className="min-h-[44px] items-center justify-center rounded-md bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)] mt-2"
            style={({ pressed }) =>
              pressed || isRefreshing ? { opacity: 0.72, transform: [{ scale: 0.99 }] } : undefined
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: isRefreshing, busy: isRefreshing }}
            accessibilityHint="Asks for confirmation before clearing cached data and syncing again."
          >
            <Text className="text-[14px] font-black text-text dark:text-text-dark">
              {isRefreshing ? 'Refreshing...' : 'Clear Cache and Resync'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center pt-2 border-t border-[rgba(128,128,128,0.1)] gap-3">
      <Text className="text-[14px] font-bold text-text-muted dark:text-text-muted-dark">{label}</Text>
      <Text className="text-[14px] font-heavy text-text dark:text-text-dark flex-shrink" numberOfLines={1}>{value}</Text>
    </View>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCount(value: number | undefined): string {
  return value !== undefined ? String(value) : '...';
}
