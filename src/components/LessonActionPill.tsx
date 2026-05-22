import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition } from 'react-native-reanimated';

import { TooltipPressable } from './TooltipPressable';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useAppTheme } from '../theme/AppThemeProvider';
import { compositeAlpha, readableOnColor, withAlpha } from '../theme/colorUtils';

type Props = {
  subjectColor: string;
  feedback: { correct: boolean } | null;
  isContinuing: boolean;
  answerEmpty: boolean;
  onSubmit: () => void;
  onContinue: () => void;
};

const AnimatedView = Animated.View;

const pillMotion = () => LinearTransition.springify().damping(24).stiffness(210).mass(0.72);
const pillEntrance = () => FadeInDown.springify().damping(22).stiffness(230).mass(0.78);
const pillExit = () => FadeOutDown.duration(140);
const controlMotion = () => LinearTransition.springify().damping(26).stiffness(240).mass(0.7);
const controlEntrance = () => FadeIn.duration(160).delay(35);
const controlExit = () => FadeOut.duration(110);

export function LessonActionPill({
  subjectColor,
  feedback,
  isContinuing,
  answerEmpty,
  onSubmit,
  onContinue,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const keyboardHeight = useKeyboardHeight();
  const accentColor = feedback ? (feedback.correct ? colors.success : colors.danger) : subjectColor;
  const tintColor = withAlpha(accentColor, feedback ? (isDark ? 0.22 : 0.12) : (isDark ? 0.14 : 0.08));
  const glassBg = isDark ? 'rgba(32, 30, 38, 0.34)' : 'rgba(255, 255, 255, 0.72)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(32,26,36,0.08)';
  const fallbackBg = isDark ? 'rgba(32, 30, 38, 0.72)' : 'rgba(255, 255, 255, 0.82)';
  const fallbackBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(32,26,36,0.10)';
  const pillBg = isLiquidGlassSupported ? glassBg : fallbackBg;
  const effectivePillBg = compositeAlpha(pillBg, colors.background);
  const disabled = isContinuing || (!feedback && answerEmpty);
  const label = feedback ? (isContinuing ? 'Saving...' : 'Continue') : 'Submit Answer';
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
        <LiquidGlassView
          interactive
          effect={isDark ? 'regular' : 'clear'}
          colorScheme={isDark ? 'dark' : 'light'}
          tintColor={tintColor}
          style={[
            styles.pillGlass,
            {
              backgroundColor: glassBg,
              borderWidth: 1,
              borderColor: glassBorder,
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.18 : 0.08,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 7 },
              elevation: 4,
            },
            !isLiquidGlassSupported && {
              backgroundColor: fallbackBg,
              borderWidth: 1,
              borderColor: fallbackBorder,
            },
          ]}
        >
          <AnimatedView className="flex-row items-center justify-center px-5 py-2.5" layout={controlMotion()}>
            <AnimatedView
              className="flex-1 items-center"
              entering={controlEntrance()}
              exiting={controlExit()}
              layout={controlMotion()}
            >
              <TooltipPressable
                tooltip={label}
                onPress={feedback ? onContinue : onSubmit}
                disabled={disabled}
                className="h-12 w-12 items-center justify-center rounded-full"
                style={({ pressed }) => [
                  disabled
                    ? {
                        backgroundColor: withAlpha(accentColor, isDark ? 0.3 : 0.16),
                        borderWidth: 1,
                        borderColor: withAlpha(accentColor, isDark ? 0.38 : 0.3),
                      }
                    : { backgroundColor: accentColor },
                  pressed ? { opacity: 0.5 } : undefined,
                ]}
                accessibilityLabel={label}
              >
                <Ionicons
                  name="arrow-forward"
                  size={22}
                  color={feedback
                    ? readableOnColor(effectivePillBg)
                    : readableOnColor(
                        disabled ? withAlpha(accentColor, isDark ? 0.3 : 0.16) : accentColor,
                        disabled ? effectivePillBg : undefined,
                      )}
                />
              </TooltipPressable>
            </AnimatedView>
          </AnimatedView>
        </LiquidGlassView>
      </AnimatedView>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  pillGlass: {
    borderRadius: 9999,
    overflow: 'hidden',
  },
});
