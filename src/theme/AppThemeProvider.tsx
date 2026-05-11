import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AppearanceMode, loadSettings, saveSettings } from '../domain/settings/settings';

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
  const [mode, setModeInternal] = useState<AppearanceMode>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;
    loadSettings().then((settings) => {
      if (isMounted) {
        setModeInternal(settings.appearance);
        setHydrated(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const setMode = useCallback((nextMode: AppearanceMode) => {
    setModeInternal(nextMode);
    saveSettings({ appearance: nextMode }).catch(() => {});
  }, []);

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
    return null;
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
