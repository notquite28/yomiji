import { Pressable, Text, View } from 'react-native';

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
  if (!visible) {
    return null;
  }

  return (
    <Pressable
      className="absolute inset-0 justify-end p-5 pb-9 bg-[rgba(0,0,0,0.45)]"
      onPress={onCancel}
      accessibilityElementsHidden
    >
      <View className="bg-surface-elevated dark:bg-surface-elevated-dark rounded-lg border border-border dark:border-border-dark p-5 gap-3">
        <Text className="text-[17px] font-black text-text dark:text-text-dark">
          {title}
        </Text>
        <Text className="text-[14px] leading-5 text-text-muted dark:text-text-muted-dark">
          {message}
        </Text>
        <View className="flex-row gap-3 mt-1">
          <Pressable
            onPress={onCancel}
            className="flex-1 rounded py-3.5 items-center justify-center bg-surface dark:bg-surface-dark border border-border dark:border-border-dark"
            style={({ pressed }) =>
              pressed ? { opacity: 0.58 } : undefined
            }
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          >
            <Text className="text-base font-black text-text dark:text-text-dark">
              {cancelLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            className="flex-1 rounded py-3.5 items-center justify-center bg-danger dark:bg-danger-dark"
            style={({ pressed }) =>
              pressed ? { opacity: 0.58 } : undefined
            }
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
          >
            <Text className="text-base font-black text-white">
              {confirmLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
