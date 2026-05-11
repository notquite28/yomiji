import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TooltipPressable } from './TooltipPressable';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

export function ScreenLayout({
  children,
  scrollable = false,
  keyboardShouldPersistTaps = false,
}: {
  children: ReactNode;
  scrollable?: boolean;
  keyboardShouldPersistTaps?: boolean;
}) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  if (scrollable) {
    const ScrollView = require('react-native').ScrollView;
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps ? 'handled' : undefined}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

export function CenteredMessage({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  return (
    <ScreenLayout>
      <View style={styles.centered}>
        <ActivityIndicator
          color={theme.colors.kanji}
          style={actionLabel ? styles.hidden : undefined}
        />
        <Text style={styles.centeredText}>{label}</Text>
        {actionLabel ? (
          <Pressable onPress={onAction} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenLayout>
  );
}

export function SessionHeader({
  onBack,
  progress,
  onSettings,
}: {
  onBack: () => void;
  progress: string;
  onSettings?: () => void;
}) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  return (
    <View style={styles.headerRow}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.progressText}>{progress}</Text>
      {onSettings ? (
        <TooltipPressable
          tooltip="Quick settings"
          accessibilityHint="Wrap up, end session, or change answer mode"
          onPress={onSettings}
          style={styles.settingsButton}
        >
          <Text style={styles.settingsButtonText}>⚙</Text>
        </TooltipPressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      padding: 20,
      gap: 18,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
    },
    hidden: {
      opacity: 0,
    },
    centeredText: {
      color: theme.colors.text,
      textAlign: 'center',
      fontSize: 18,
      lineHeight: 25,
      fontWeight: '800',
    },
    actionButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      paddingHorizontal: 18,
      backgroundColor: theme.colors.kanji,
    },
    actionButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
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
    progressText: {
      color: theme.colors.mutedText,
      fontWeight: '900',
    },
    settingsButton: {
      borderRadius: 999,
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    settingsButtonText: {
      color: theme.colors.text,
      fontSize: 18,
    },
    headerSpacer: {
      width: 38,
    },
  });
}
