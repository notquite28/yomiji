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
        <View style={styles.headerBlock}>
          <Text style={styles.kicker}>Yomichi</Text>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Account, appearance, and local data.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Appearance</Text>
          <Text style={styles.bodyText}>Theme and notification controls are scaffolded.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Study</Text>
          <Text style={styles.bodyText}>Review order, batching, typo handling, and audio settings.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Diagnostics</Text>
          <Text style={styles.bodyText}>Preview image-only radicals from the local cache without starting lessons or reviews.</Text>
          <Pressable onPress={() => navigation.navigate('RadicalImagePreview')} style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}>
            <Text style={styles.previewButtonText}>Preview Radical Images</Text>
          </Pressable>
        </View>

        <View style={styles.dangerPanel}>
          <Text style={styles.panelTitle}>Log Out</Text>
          <Text style={styles.bodyText}>Clears token, cache, and pending queues.</Text>
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
    panel: {
      borderRadius: 26,
      padding: 18,
      backgroundColor: theme.isDark ? '#15141a' : '#fffdf8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)',
      gap: 10,
      shadowColor: '#000000',
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    dangerPanel: {
      borderRadius: 26,
      padding: 18,
      backgroundColor: theme.isDark ? '#15141a' : '#fffdf8',
      borderWidth: 1,
      borderColor: theme.colors.danger,
      gap: 12,
      shadowColor: '#000000',
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    panelTitle: {
      color: theme.colors.text,
      fontSize: 21,
      fontWeight: '900',
      letterSpacing: -0.3,
    },
    bodyText: {
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
    },
    errorText: {
      color: theme.colors.danger,
      fontWeight: '800',
    },
    logoutButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      backgroundColor: theme.colors.danger,
      shadowColor: '#000000',
      shadowOpacity: theme.isDark ? 0.2 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    logoutText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },
    previewButton: {
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.radical,
    },
    previewButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '900',
    },
    pressed: {
      opacity: 0.72,
      transform: [{ scale: 0.99 }],
    },
  });
}
