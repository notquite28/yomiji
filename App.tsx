import { DarkTheme, DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './src/navigation/AppNavigator';
import { AppThemeProvider, useAppTheme } from './src/theme/AppThemeProvider';

function navigationTheme(theme: ReturnType<typeof useAppTheme>): Theme {
  const baseTheme = theme.isDark ? DarkTheme : DefaultTheme;

  return {
    ...baseTheme,
    dark: theme.isDark,
    colors: {
      ...baseTheme.colors,
      primary: theme.colors.kanji,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.radical,
    },
  };
}

function Root() {
  const theme = useAppTheme();

  return (
    <NavigationContainer theme={navigationTheme(theme)}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <Root />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
