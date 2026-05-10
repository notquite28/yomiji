import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openAppDatabase, resetLocalData } from '../domain/db/database';
import { deleteApiToken } from '../domain/storage/secureToken';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'> & {
  onLoggedOut: () => void;
};

export function SettingsScreen({ navigation, onLoggedOut }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    setError(null);
    setIsLoggingOut(true);
    try {
      const db = await openAppDatabase();
      await deleteApiToken();
      await resetLocalData(db);
      onLoggedOut();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>This first slice wires the sections that need secure storage, local data reset, and future setting persistence.</Text>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Appearance and Notifications</Text>
          <Text style={styles.bodyText}>Light, dark, system appearance, local notifications, and badges are scaffolded in the product model and will get full controls next.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Lessons and Reviews</Text>
          <Text style={styles.bodyText}>Default Tsurukame review order, batching, Anki mode, typo handling, and audio settings are represented in TypeScript settings.</Text>
        </View>

        <View style={styles.dangerPanel}>
          <Text style={styles.panelTitle}>Log Out</Text>
          <Text style={styles.bodyText}>Clears the secure token and local SQLite cache, including pending queues.</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable disabled={isLoggingOut} onPress={logout} style={({ pressed }) => [styles.logoutButton, (pressed || isLoggingOut) && styles.pressed]}>
            <Text style={styles.logoutText}>{isLoggingOut ? 'Logging out...' : 'Log Out and Clear Cache'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 20,
      gap: 16,
    },
    backButton: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    backText: {
      color: theme.colors.text,
      fontWeight: '900',
    },
    title: {
      color: theme.colors.text,
      fontSize: 36,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.colors.mutedText,
      fontSize: 16,
      lineHeight: 23,
    },
    panel: {
      borderRadius: 28,
      padding: 20,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
    },
    dangerPanel: {
      borderRadius: 28,
      padding: 20,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      gap: 12,
    },
    panelTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '900',
    },
    bodyText: {
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 22,
    },
    errorText: {
      color: theme.colors.danger,
      fontWeight: '800',
    },
    logoutButton: {
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.danger,
    },
    logoutText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
