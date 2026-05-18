import { useCallback } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppSettings, saveSettings } from '../domain/settings/settings';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

type BooleanSettingKey =
  | 'exactMatch'
  | 'enableCheats'
  | 'showFullAnswer'
  | 'playAudioAutomatically'
  | 'interruptBackgroundAudio';

type Props = {
  visible: boolean;
  settings: AppSettings;
  onSettingsChange: (next: AppSettings) => void;
  onClose: () => void;
  onEndSession: () => void;
  onWrapUp: () => void;
  canWrapUp: boolean;
  wrappingUp: boolean;
  hasFeedback: boolean;
  remainingInBatch: number;
};

export function ReviewQuickSettings({
  visible,
  settings,
  onSettingsChange,
  onClose,
  onEndSession,
  onWrapUp,
  canWrapUp,
  wrappingUp,
  hasFeedback,
  remainingInBatch,
}: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  const toggle = useCallback(
    (key: BooleanSettingKey) => {
      const next = { ...settings, [key]: !settings[key] };
      onSettingsChange(next);
      saveSettings({ [key]: next[key] }).catch(() => {});
    },
    [settings, onSettingsChange],
  );

  const canWrapUpNow = canWrapUp && !wrappingUp && !hasFeedback;
  const confirmEndSession = () => {
    Alert.alert(
      'End review session?',
      'Unsaved answers in this active session will be discarded and you will return to the dashboard.',
      [
        { text: 'Keep studying', style: 'cancel' },
        { text: 'End session', style: 'destructive', onPress: onEndSession },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text style={styles.title}>Quick Settings</Text>
          <View style={styles.headerSide}>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close quick settings">
              <Text style={styles.closeButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.sections} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Answers &amp; Marking</Text>
            <ToggleRow
              label="Exact match"
              value={settings.exactMatch}
              onToggle={() => toggle('exactMatch')}
              theme={theme}
              styles={styles}
            />
            <ToggleRow
              label="Allow cheats"
              value={settings.enableCheats}
              onToggle={() => toggle('enableCheats')}
              theme={theme}
              styles={styles}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Display</Text>
            <ToggleRow
              label="Show full answer"
              value={settings.showFullAnswer}
              onToggle={() => toggle('showFullAnswer')}
              theme={theme}
              styles={styles}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audio</Text>
            <ToggleRow
              label="Autoplay audio"
              value={settings.playAudioAutomatically}
              onToggle={() => toggle('playAudioAutomatically')}
              theme={theme}
              styles={styles}
            />
            <ToggleRow
              label="Interrupt background audio"
              value={settings.interruptBackgroundAudio}
              onToggle={() => toggle('interruptBackgroundAudio')}
              theme={theme}
              styles={styles}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Session</Text>
            {wrappingUp ? (
              <View style={[styles.actionRow, styles.actionRowDisabled]}>
                <Text style={styles.actionRowTextDisabled}>
                  Wrap-up active: {remainingInBatch} remaining
                </Text>
              </View>
            ) : canWrapUp ? (
              <Pressable
                onPress={canWrapUpNow ? onWrapUp : undefined}
                accessibilityRole="button"
                accessibilityLabel={`Wrap up session, ${remainingInBatch} remaining in this batch`}
                accessibilityState={{ disabled: !canWrapUpNow }}
                style={({ pressed }) => [
                  styles.actionRow,
                  !canWrapUpNow && styles.actionRowDisabled,
                  canWrapUpNow && pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.actionRowText, !canWrapUpNow && styles.actionRowTextDisabled]}>
                  Wrap Up ({remainingInBatch} to go)
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={confirmEndSession}
              accessibilityRole="button"
              accessibilityLabel="End review session"
              style={({ pressed }) => [
                styles.actionRow,
                styles.actionRowDanger,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.actionRowTextDanger}>End Session</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  theme,
  styles,
  inset = false,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
  theme: AppTheme;
  styles: ReturnType<typeof makeStyles>;
  inset?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, inset && styles.toggleRowInset]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        onValueChange={onToggle}
        trackColor={{ false: theme.colors.border, true: theme.colors.kanji }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    headerSide: {
      width: 88,
      alignItems: 'flex-end',
    },
    title: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '900',
      textAlign: 'center',
    },
    closeButton: {
      minHeight: 38,
      borderRadius: 999,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    closeButtonText: {
      color: theme.colors.text,
      fontWeight: '900',
    },
    sections: {
      flex: 1,
      paddingHorizontal: 20,
      gap: 20,
    },
    section: {
      gap: 2,
    },
    sectionTitle: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingBottom: 8,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
    },
    toggleRowInset: {
      marginLeft: 24,
    },
    toggleLabel: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '800',
      flex: 1,
    },
    actionRow: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
    },
    actionRowDanger: {
      borderColor: theme.colors.danger,
    },
    actionRowText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    actionRowTextDanger: {
      color: theme.colors.danger,
      fontSize: 15,
      fontWeight: '900',
    },
    actionRowDisabled: {
      opacity: 0.6,
    },
    actionRowTextDisabled: {
      color: theme.colors.mutedText,
      fontSize: 15,
      fontWeight: '800',
    },
    pressed: {
      opacity: 0.58,
    },
  });
}
