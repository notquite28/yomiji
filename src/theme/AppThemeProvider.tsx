import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { useSettingsStore } from '../domain/settings/settingsStore';

import { AppColors, darkColors, lightColors } from './palette';

export type AppTheme = {
  isDark: boolean;
  colors: AppColors;
  spacing: (unit: number) => number;
};

const AppThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const storeHydrated = useSettingsStore((s) => s._hydrated);
  const [hydrated, setHydrated] = useState(false);

  // Trigger hydration once on mount (idempotent — guarded by _hydrated flag)
  useEffect(() => {
    useSettingsStore.getState().hydrate();
  }, []);

  // Watch for hydration completion
  useEffect(() => {
    if (storeHydrated) setHydrated(true);
  }, [storeHydrated]);

  const isDark = systemScheme === 'dark';

  const value = useMemo<AppTheme>(
    () => ({
      isDark,
      colors: isDark ? darkColors : lightColors,
      spacing: (unit: number) => unit * 8,
    }),
    [isDark],
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
