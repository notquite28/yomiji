import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import appConfig from '../../app.json';
import { WaniKaniClient } from '../domain/api/WaniKaniClient';
import { openAppDatabase } from '../domain/db/database';
import { clearErrorLog, ErrorLogEntry, getErrorLogEntries, getErrorLogCount } from '../domain/db/errorLog';
import { deleteApiToken, getApiToken } from '../domain/storage/secureToken';
import { isSyncAuthError, runFullRefresh } from '../domain/sync/syncService';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

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
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

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
        title: 'Yomichi Diagnostics Export',
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.headerBlock}>
          <Text style={styles.kicker}>Yomichi</Text>
          <Text style={styles.title}>Diagnostics</Text>
          <Text style={styles.subtitle}>Cache state, sync status, and error log.</Text>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>App Info</Text>
          <InfoRow label="Version" value={`v${APP_VERSION}`} theme={theme} />
          <InfoRow label="Platform" value="React Native (Expo)" theme={theme} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Cache</Text>
          <InfoRow label="Subjects" value={formatCount(data?.subjects)} theme={theme} />
          <InfoRow label="Assignments" value={formatCount(data?.assignments)} theme={theme} />
          <InfoRow label="Study Materials" value={formatCount(data?.studyMaterials)} theme={theme} />
          <InfoRow label="Review Statistics" value={formatCount(data?.reviewStats)} theme={theme} />
          <InfoRow label="Level Progressions" value={formatCount(data?.levelProgressions)} theme={theme} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Sync</Text>
          <InfoRow label="Last Sync" value={data?.lastSyncTime ? formatDate(data.lastSyncTime) : 'Never'} theme={theme} />
          {Object.entries(data?.syncCursors ?? {}).map(([collection, cursor]) => (
            <InfoRow key={collection} label={collection} value={cursor || '(full)'} theme={theme} />
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Pending Writes</Text>
          <InfoRow label="Review/Lesson Progress" value={formatCount(data?.pendingProgress)} theme={theme} />
          <InfoRow label="Study Material Edits" value={formatCount(data?.pendingStudyMaterials)} theme={theme} />
          {(data?.pendingProgress ?? 0) > 0 || (data?.pendingStudyMaterials ?? 0) > 0 ? (
            <Text style={styles.hintText}>Pending writes will flush on next background or manual sync.</Text>
          ) : null}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Error Log</Text>
            <Text style={styles.panelMeta}>{formatCount(data?.errorLogCount)} entries</Text>
          </View>
          {data?.recentErrors.length ? (
            <View style={styles.errorList}>
              {data.recentErrors.map((entry) => (
                <View key={entry.id} style={styles.errorRow}>
                  <Text style={styles.errorTimestamp}>{formatDate(entry.created_at)}</Text>
                  <Text style={[styles.errorLevelBadge, entry.level === 'error' && styles.errorLevelBadgeError]}>
                    {entry.level}
                  </Text>
                  <Text style={styles.errorMessage} numberOfLines={2}>{entry.message}</Text>
                  {entry.context ? <Text style={styles.errorContext} numberOfLines={1}>{entry.context}</Text> : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No errors logged.</Text>
          )}
          {data?.errorLogCount ? (
            <Pressable
              disabled={isClearing}
              onPress={handleClearErrors}
              style={({ pressed }) => [styles.secondaryButton, (pressed || isClearing) && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>{isClearing ? 'Clearing...' : 'Clear Error Log'}</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable onPress={handleExport} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>Export Diagnostics</Text>
        </Pressable>

        <View style={styles.dangerPanel}>
          <Text style={styles.panelTitle}>Full Refresh</Text>
          <Text style={styles.bodyText}>Clear all cached data and re-download from WaniKani. Pending writes are preserved.</Text>
          <Pressable
            onPress={async () => {
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
              }
            }}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>Clear Cache and Resync</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, theme }: { label: string; value: string; theme: AppTheme }) {
  return (
    <View style={infoStyles.row}>
      <Text style={[infoStyles.label, { color: theme.colors.mutedText }]}>{label}</Text>
      <Text style={[infoStyles.value, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
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

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.1)',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  value: {
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
});

function makeStyles(theme: AppTheme) {
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
    backButton: {
      alignSelf: 'flex-start',
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
    headerBlock: {
      paddingHorizontal: 2,
      paddingTop: 14,
      paddingBottom: 6,
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
      fontSize: 40,
      lineHeight: 46,
      fontWeight: '900',
      letterSpacing: -1.4,
    },
    subtitle: {
      marginTop: 10,
      color: theme.colors.mutedText,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '700',
    },
    errorBanner: {
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.colors.danger,
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '800',
    },
    panel: {
      borderRadius: 26,
      padding: 18,
      backgroundColor: theme.isDark ? '#15141a' : '#fffdf8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)',
      gap: 6,
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
    hintText: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: '700',
      fontStyle: 'italic',
      paddingTop: 4,
    },
    emptyText: {
      color: theme.colors.mutedText,
      fontSize: 14,
      fontWeight: '700',
      paddingTop: 4,
    },
    errorList: {
      gap: 8,
    },
    errorRow: {
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: 'rgba(128, 128, 128, 0.1)',
      gap: 2,
    },
    errorTimestamp: {
      color: theme.colors.mutedText,
      fontSize: 11,
      fontWeight: '800',
    },
    errorLevelBadge: {
      color: theme.colors.warning,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    errorLevelBadgeError: {
      color: theme.colors.danger,
    },
    errorMessage: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 18,
    },
    errorContext: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    secondaryButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: theme.isDark ? '#201e26' : '#f2eee8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.06)',
      marginTop: 8,
    },
    secondaryButtonText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '900',
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
    pressed: {
      opacity: 0.72,
      transform: [{ scale: 0.99 }],
    },
    dangerPanel: {
      borderRadius: 26,
      padding: 18,
      backgroundColor: theme.isDark ? '#1a1215' : '#fff5f5',
      borderWidth: 1,
      borderColor: theme.colors.danger,
      gap: 6,
    },
    bodyText: {
      color: theme.colors.mutedText,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 20,
    },
  });
}
