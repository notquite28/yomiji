import { BlurTargetView, BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition } from 'react-native-reanimated';

import { TooltipPressable } from './TooltipPressable';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useAppTheme } from '../theme/AppThemeProvider';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  subjectColor: string;
  visible: boolean;

  feedback: { correct: boolean } | null;
  isContinuing: boolean;
  ankiMode: boolean;
  ankiRevealed: boolean;
  answerEmpty: boolean;
  canWrapUp: boolean;
  wrappingUp: boolean;
  showCheats: boolean;
  canAddSynonym: boolean;
  isOffline: boolean;
  isVocabulary: boolean;

  onSubmit: () => void;
  onContinue: () => void;
  onAnkiMark: (correct: boolean) => void;
  onWrapUp: () => void;
  onPlayAudio: () => void;
  onOverrideCorrect: () => void;
  onAskAgainLater: () => void;
  onAddSynonym: () => void;
};

const AnimatedView = Animated.View;

const pillMotion = () => LinearTransition.springify().damping(24).stiffness(210).mass(0.72);
const pillEntrance = () => FadeInDown.springify().damping(22).stiffness(230).mass(0.78);
const pillExit = () => FadeOutDown.duration(140);
const controlMotion = () => LinearTransition.springify().damping(26).stiffness(240).mass(0.7);
const controlEntrance = () => FadeIn.duration(160).delay(35);
const controlExit = () => FadeOut.duration(110);

export function FloatingReviewPill({
  subjectColor,
  visible,
  feedback,
  isContinuing,
  ankiMode,
  ankiRevealed,
  answerEmpty,
  canWrapUp,
  wrappingUp,
  showCheats,
  canAddSynonym,
  isOffline,
  isVocabulary,
  onSubmit,
  onContinue,
  onAnkiMark,
  onWrapUp,
  onPlayAudio,
  onOverrideCorrect,
  onAskAgainLater,
  onAddSynonym,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const keyboardHeight = useKeyboardHeight();
  const blurTargetRef = useRef<View>(null);

  const cardBg = isDark ? 'rgba(13, 11, 18, 0.76)' : 'rgba(255, 255, 255, 0.38)';
  const borderColor = feedback
    ? feedback.correct
      ? colors.success
      : colors.danger
    : isDark
      ? 'rgba(255,255,255,0.12)'
      : 'rgba(255,255,255,0.28)';
  const baseColor = isDark ? '#05040a' : '#fff8ee';

  if (!visible) {
    return null;
  }

  const disabled = isContinuing;
  const showAnkiReveal = ankiMode && !feedback && !ankiRevealed;
  const showAnkiMarks = ankiMode && ankiRevealed && !feedback;

  const primaryLabel = showAnkiReveal
    ? 'Show Answer'
    : feedback
      ? isContinuing
        ? 'Saving...'
        : feedback.correct
          ? 'Continue'
          : 'Got it wrong'
      : 'Submit Answer';

  const primaryIcon = 'arrow-forward';
  const bottomPadding = Platform.OS === 'android' ? Math.max(20, keyboardHeight) : 20;

  return (
    <AnimatedView
      className="px-5"
      entering={pillEntrance()}
      exiting={pillExit()}
      layout={pillMotion()}
      style={{ paddingBottom: bottomPadding }}
    >
      <AnimatedView layout={pillMotion()}>
        <AnimatedView
          className="overflow-hidden rounded-full"
          layout={pillMotion()}
          style={{
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
          }}
        >
          <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
            <View style={StyleSheet.absoluteFill} collapsable={false}>
              <View
                className="absolute inset-0"
                style={{ backgroundColor: baseColor }}
              />
              <View
                className="absolute h-[80px] w-[180px] rounded-full"
                style={{
                  backgroundColor: subjectColor,
                  opacity: isDark ? 0.3 : 0.45,
                  top: -10,
                  left: '50%',
                  marginLeft: -90,
                }}
              />
              <View
                className="absolute left-2 top-1.5 h-[24px] w-[24px] rounded-full"
                style={{ backgroundColor: subjectColor, opacity: isDark ? 0.15 : 0.22 }}
              />
            </View>
          </BlurTargetView>

          <BlurView
            blurTarget={blurTargetRef}
            intensity={60}
            blurReductionFactor={2}
            tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
            blurMethod={
              Platform.OS === 'android' && (Platform.Version as number) >= 31
                ? 'dimezisBlurViewSdk31Plus'
                : undefined
            }
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {feedback && (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: feedback.correct ? colors.success : colors.danger,
                  opacity: 0.08,
                  borderRadius: 9999,
                },
              ]}
              pointerEvents="none"
            />
          )}

          <AnimatedView
            className="flex-row items-center justify-between px-5 py-2.5"
            layout={controlMotion()}
          >
            {isVocabulary && feedback && (
              <AnimatedIconButton
                icon="play"
                label={isOffline ? 'Audio unavailable offline' : 'Play audio'}
                onPress={onPlayAudio}
                disabled={disabled || isOffline}
              />
            )}

            {showCheats && (
              <>
                <AnimatedIconButton
                  icon="refresh-circle"
                  label="Try again later"
                  onPress={onAskAgainLater}
                  disabled={disabled}
                />
                <AnimatedIconButton
                  icon="shield-checkmark"
                  label="My answer was correct"
                  onPress={onOverrideCorrect}
                  disabled={disabled}
                />
                {canAddSynonym && (
                  <AnimatedIconButton
                    icon="git-merge"
                    label="Add as synonym"
                    onPress={onAddSynonym}
                    disabled={disabled}
                  />
                )}
              </>
            )}

            {canWrapUp && !wrappingUp && !feedback && (
              <AnimatedIconButton icon="timer-outline" label="Wrap up" onPress={onWrapUp} disabled={disabled} />
            )}

            {showAnkiMarks ? (
              <>
                <AnimatedIconButton
                  icon="close"
                  label="Incorrect"
                  onPress={() => onAnkiMark(false)}
                  bgColor={colors.danger}
                  disabled={disabled}
                />
                <AnimatedIconButton
                  icon="checkmark"
                  label="Correct"
                  onPress={() => onAnkiMark(true)}
                  bgColor={colors.success}
                  disabled={disabled}
                />
              </>
            ) : (
              <AnimatedIconButton
                icon={primaryIcon}
                label={primaryLabel}
                onPress={feedback ? onContinue : onSubmit}
                disabled={disabled || (!feedback && !ankiMode && answerEmpty)}
                bgColor={subjectColor}
                size="lg"
              />
            )}
          </AnimatedView>
        </AnimatedView>
      </AnimatedView>
    </AnimatedView>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  bgColor,
  size = 'md',
}: {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  bgColor?: string;
  size?: 'md' | 'lg';
}) {
  const { colors, isDark } = useAppTheme();

  const hasBgColor = !!bgColor;
  const frostedBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)';
  const frostedBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.42)';

  return (
    <TooltipPressable
      tooltip={label}
      onPress={onPress}
      disabled={disabled}
      className={`rounded-full items-center justify-center ${size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'}`}
      style={({ pressed }) => [
        hasBgColor
          ? { backgroundColor: bgColor }
          : { backgroundColor: frostedBg, borderWidth: 1, borderColor: frostedBorder },
        (pressed || disabled) ? { opacity: 0.5 } : undefined,
      ]}
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={size === 'lg' ? 22 : 18}
        color={hasBgColor ? '#fff' : colors.text}
      />
    </TooltipPressable>
  );
}

function AnimatedIconButton({
  icon,
  label,
  onPress,
  disabled,
  bgColor,
  size = 'md',
}: {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  bgColor?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <AnimatedView
      className="flex-1 items-center"
      entering={controlEntrance()}
      exiting={controlExit()}
      layout={controlMotion()}
    >
      <IconButton
        icon={icon}
        label={label}
        onPress={onPress}
        disabled={disabled}
        bgColor={bgColor}
        size={size}
      />
    </AnimatedView>
  );
}
