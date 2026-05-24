import { useCallback } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiquidGlassButton } from './LiquidGlassButton';
import { useSettingsStore } from '../domain/settings/settingsStore';
import { useAppTheme } from '../theme/AppThemeProvider';

type BooleanSettingKey =
  | 'exactMatch'
  | 'enableCheats'
  | 'showFullAnswer'
  | 'playAudioAutomatically'
  | 'interruptBackgroundAudio';

type Props = {
  visible: boolean;
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
  onClose,
  onEndSession,
  onWrapUp,
  canWrapUp,
  wrappingUp,
  hasFeedback,
  remainingInBatch,
}: Props) {
  const exactMatch = useSettingsStore((s) => s.exactMatch);
  const enableCheats = useSettingsStore((s) => s.enableCheats);
  const showFullAnswer = useSettingsStore((s) => s.showFullAnswer);
  const playAudioAutomatically = useSettingsStore((s) => s.playAudioAutomatically);
  const interruptBackgroundAudio = useSettingsStore((s) => s.interruptBackgroundAudio);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const toggle = useCallback(
    (key: BooleanSettingKey) => {
      updateSetting(key, !getFieldValue(key));
    },
    [updateSetting, exactMatch, enableCheats, showFullAnswer, playAudioAutomatically, interruptBackgroundAudio],
  );

  function getFieldValue(key: BooleanSettingKey): boolean {
    switch (key) {
      case 'exactMatch': return exactMatch;
      case 'enableCheats': return enableCheats;
      case 'showFullAnswer': return showFullAnswer;
      case 'playAudioAutomatically': return playAudioAutomatically;
      case 'interruptBackgroundAudio': return interruptBackgroundAudio;
    }
  }

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
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark" edges={['top', 'bottom']}>
        <View className="min-h-[56px] flex-row items-center px-5 pb-3">
          <View className="w-[88px] items-end" />
          <Text className="flex-1 text-xl font-black text-text dark:text-text-dark text-center">
            Quick Settings
          </Text>
          <View className="w-[88px] items-end">
            <LiquidGlassButton
              label="Done"
              onPress={onClose}
              accessibilityLabel="Close quick settings"
              style={{ minHeight: 38, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
              contentClassName="font-black"
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, gap: 20 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-0.5">
            <Text className="text-[13px] font-black uppercase tracking-ultra text-text-muted dark:text-text-muted-dark pb-2">
              Answers & Marking
            </Text>
            <ToggleRow
              label="Exact match"
              value={exactMatch}
              onToggle={() => toggle('exactMatch')}
            />
            <ToggleRow
              label="Allow cheats"
              value={enableCheats}
              onToggle={() => toggle('enableCheats')}
            />
          </View>

          <View className="gap-0.5">
            <Text className="text-[13px] font-black uppercase tracking-ultra text-text-muted dark:text-text-muted-dark pb-2">
              Display
            </Text>
            <ToggleRow
              label="Show full answer"
              value={showFullAnswer}
              onToggle={() => toggle('showFullAnswer')}
            />
          </View>

          <View className="gap-0.5">
            <Text className="text-[13px] font-black uppercase tracking-ultra text-text-muted dark:text-text-muted-dark pb-2">
              Audio
            </Text>
            <ToggleRow
              label="Autoplay audio"
              value={playAudioAutomatically}
              onToggle={() => toggle('playAudioAutomatically')}
            />
            <ToggleRow
              label="Interrupt background audio"
              value={interruptBackgroundAudio}
              onToggle={() => toggle('interruptBackgroundAudio')}
            />
          </View>

          <View className="gap-0.5">
            <Text className="text-[13px] font-black uppercase tracking-ultra text-text-muted dark:text-text-muted-dark pb-2">
              Session
            </Text>
            {wrappingUp ? (
              <View className="py-3.5 px-4 rounded bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark items-center opacity-60">
                <Text className="text-base font-heavy text-text-muted dark:text-text-muted-dark">
                  Wrap-up active: {remainingInBatch} remaining
                </Text>
              </View>
            ) : canWrapUp ? (
              <Pressable
                onPress={canWrapUpNow ? onWrapUp : undefined}
                className="py-3.5 px-4 rounded bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark items-center"
                style={({ pressed }) => {
                  if (!canWrapUpNow) return { opacity: 0.6 };
                  if (pressed) return { opacity: 0.58 };
                  return undefined;
                }}
                accessibilityRole="button"
                accessibilityLabel={`Wrap up session, ${remainingInBatch} remaining in this batch`}
                accessibilityState={{ disabled: !canWrapUpNow }}
              >
                <Text
                  className={`text-base ${
                    canWrapUpNow
                      ? 'text-text dark:text-text-dark font-black'
                      : 'text-text-muted dark:text-text-muted-dark font-heavy'
                  }`}
                >
                  Wrap Up ({remainingInBatch} to go)
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={confirmEndSession}
              className="py-3.5 px-4 rounded bg-surface-elevated dark:bg-surface-elevated-dark border border-danger dark:border-danger-dark items-center"
              style={({ pressed }) =>
                pressed ? { opacity: 0.58 } : undefined
              }
              accessibilityRole="button"
              accessibilityLabel="End review session"
            >
              <Text className="text-base font-black text-danger dark:text-danger-dark">
                End Session
              </Text>
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
  inset = false,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
  inset?: boolean;
}) {
  const { colors } = useAppTheme();

  return (
    <View className={`flex-row items-center justify-between py-3 px-4 bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark rounded ${inset ? 'ml-6' : ''}`}>
      <Text className="text-base font-heavy text-text dark:text-text-dark flex-1">
        {label}
      </Text>
      <Switch
        value={value}
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: '#ff00aa' }}
        thumbColor="#ffffff"
      />
    </View>
  );
}
