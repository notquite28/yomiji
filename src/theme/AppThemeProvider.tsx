import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AppColors, darkColors, lightColors } from './palette';

export type AppearanceMode = 'system' | 'light' | 'dark';

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
  const [mode, setMode] = useState<AppearanceMode>('system');
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const value = useMemo<AppTheme>(
    () => ({
      mode,
      isDark,
      colors: isDark ? darkColors : lightColors,
      spacing: (unit: number) => unit * 8,
      setMode,
    }),
    [isDark, mode],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const theme = useContext(AppThemeContext);
  if (!theme) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return theme;
}
