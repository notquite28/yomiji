import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, View } from 'react-native';

import { WaniKaniClient } from '../domain/api/WaniKaniClient';
import { getLastSyncTime, openAppDatabase } from '../domain/db/database';
import { getApiToken } from '../domain/storage/secureToken';
import { hasPendingWrites, runIncrementalSync, runPendingSync, SyncProgress } from '../domain/sync/syncService';
import { DashboardScreen } from '../screens/DashboardScreen';
import { LessonSessionScreen } from '../screens/LessonSessionScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ReviewSessionScreen } from '../screens/ReviewSessionScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useAppTheme } from '../theme/AppThemeProvider';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const FOREGROUND_FULL_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const FOREGROUND_CHECK_INTERVAL_MS = 60 * 1000;
const BACKGROUND_PENDING_FLUSH_INTERVAL_MS = 60 * 1000;

export function AppNavigator() {
  const theme = useAppTheme();
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [lifecycleSyncProgress, setLifecycleSyncProgress] = useState<SyncProgress | null>(null);
  const [lifecycleSyncError, setLifecycleSyncError] = useState<string | null>(null);
  const [syncRevision, setSyncRevision] = useState(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastForegroundCheckAt = useRef(0);
  const lastPendingFlushAt = useRef(0);

  useEffect(() => {
    let isMounted = true;

    getApiToken()
      .then((token) => {
        if (isMounted) {
          setApiToken(token);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsBooting(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const syncOnForeground = useCallback(async () => {
    if (!apiToken) {
      return;
    }

    const now = Date.now();
    if (now - lastForegroundCheckAt.current < FOREGROUND_CHECK_INTERVAL_MS) {
      return;
    }
    lastForegroundCheckAt.current = now;

    setLifecycleSyncError(null);
    try {
      const db = await openAppDatabase();
      const hasLocalWrites = await hasPendingWrites(db);
      const lastSyncTime = await getLastSyncTime(db);
      const cacheIsStale = lastSyncTime === 0 || now - lastSyncTime >= FOREGROUND_FULL_SYNC_INTERVAL_MS;

      if (hasLocalWrites) {
        await runPendingSync({
          db,
          client: new WaniKaniClient(apiToken),
          onProgress: setLifecycleSyncProgress,
        });
        setSyncRevision((value) => value + 1);
      }

      if (cacheIsStale) {
        await runIncrementalSync({
          db,
          client: new WaniKaniClient(apiToken),
          onProgress: setLifecycleSyncProgress,
          onCheckpoint: () => setSyncRevision((value) => value + 1),
        });
        setSyncRevision((value) => value + 1);
      }
    } catch (caught) {
      setLifecycleSyncError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [apiToken]);

  const syncOnBackground = useCallback(async () => {
    if (!apiToken) {
      return;
    }

    const now = Date.now();
    if (now - lastPendingFlushAt.current < BACKGROUND_PENDING_FLUSH_INTERVAL_MS) {
      return;
    }
    lastPendingFlushAt.current = now;

    try {
      const db = await openAppDatabase();
      if (!(await hasPendingWrites(db))) {
        return;
      }

      await runPendingSync({
        db,
        client: new WaniKaniClient(apiToken),
        onProgress: setLifecycleSyncProgress,
      });
      setSyncRevision((value) => value + 1);
    } catch (caught) {
      setLifecycleSyncError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [apiToken]);

  useEffect(() => {
    if (apiToken) {
      void syncOnForeground();
    }
  }, [apiToken, syncOnForeground]);

  useEffect(() => {
    if (!apiToken) {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;

      if (previousState.match(/inactive|background/) && nextState === 'active') {
        void syncOnForeground();
      } else if (previousState === 'active' && nextState.match(/inactive|background/)) {
        void syncOnBackground();
      }
    });

    return () => subscription.remove();
  }, [apiToken, syncOnBackground, syncOnForeground]);

  if (isBooting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.kanji} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {apiToken ? (
        <>
          <Stack.Screen name="Dashboard">
            {(props) => (
              <DashboardScreen
                {...props}
                apiToken={apiToken}
                lifecycleSyncProgress={lifecycleSyncProgress}
                lifecycleSyncError={lifecycleSyncError}
                syncRevision={syncRevision}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Settings">
            {(props) => <SettingsScreen {...props} onLoggedOut={() => setApiToken(null)} />}
          </Stack.Screen>
          <Stack.Screen name="ReviewSession" component={ReviewSessionScreen} />
          <Stack.Screen name="LessonSession" component={LessonSessionScreen} />
        </>
      ) : (
        <Stack.Screen name="Login">
          {(props) => <LoginScreen {...props} onAuthenticated={setApiToken} />}
        </Stack.Screen>
      )}
    </Stack.Navigator>
  );
}
