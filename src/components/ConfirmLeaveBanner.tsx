import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

type Props = {
  /** Shown when the banner is visible and the user needs to confirm. */
  visible: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Inline confirmation banner displayed at the bottom of the screen when the
 * user initiates a back action that requires confirmation (e.g., ending an
 * active review/lesson session).
 *
 * This replaces Alert.alert dialogs which interfere with Android predictive
 * back gesture animations.
 */
export function ConfirmLeaveBanner({
  visible,
  title,
  message,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.banner}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.button,
              styles.cancelButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.button,
              styles.confirmButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      paddingBottom: 36,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    banner: {
      backgroundColor: theme.colors.surfaceElevated,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 20,
      gap: 12,
    },
    title: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '900',
    },
    message: {
      color: theme.colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 4,
    },
    button: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    confirmButton: {
      backgroundColor: theme.colors.danger,
    },
    cancelText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    confirmText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '900',
    },
    pressed: {
      opacity: 0.58,
    },
  });
}
