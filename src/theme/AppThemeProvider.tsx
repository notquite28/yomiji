import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AppearanceMode } from '../domain/settings/settings';
import { useSettingsStore } from '../domain/settings/settingsStore';

import { AppColors, darkColors, lightColors } from './palette';

export type { AppearanceMode };

export type AppTheme = {
  mode: AppearanceMode;
  isDark: boolean;
  colors: AppColors;
  spacing: (unit: number) => number;
  setMode: (mode: AppearanceMode) => void;
};

const AppThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const appearance = useSettingsStore((s) => s.appearance);
  const storeHydrated = useSettingsStore((s) => s._hydrated);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [hydrated, setHydrated] = useState(false);

  // Trigger hydration once on mount (idempotent — guarded by _hydrated flag)
  useEffect(() => {
    useSettingsStore.getState().hydrate();
  }, []);

  // Watch for hydration completion
  useEffect(() => {
    if (storeHydrated) setHydrated(true);
  }, [storeHydrated]);

  const setMode = useCallback((nextMode: AppearanceMode) => {
    updateSetting('appearance', nextMode);
  }, [updateSetting]);

  const mode = appearance;
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const value = useMemo<AppTheme>(
    () => ({
      mode,
      isDark,
      colors: isDark ? darkColors : lightColors,
      spacing: (unit: number) => unit * 8,
      setMode,
    }),
    [isDark, mode, setMode],
  );

  if (!hydrated) {
    const fallbackColors = systemScheme === 'dark' ? darkColors : lightColors;
    return (
      <View style={[styles.fallback, { backgroundColor: fallbackColors.background }]}>
        <ActivityIndicator color={fallbackColors.kanji} accessibilityLabel="Loading theme" accessibilityLiveRegion="polite" />
        <Text style={[styles.fallbackText, { color: fallbackColors.mutedText }]}>Loading 読路…</Text>
      </View>
    );
  }

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const theme = useContext(AppThemeContext);
  if (!theme) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return theme;
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  fallbackText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
