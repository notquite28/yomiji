import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { Pressable, Text } from 'react-native';
import type { GestureResponderEvent, StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/AppThemeProvider';
import { TooltipPressable } from './TooltipPressable';

type Props = {
  children?: React.ReactNode;
  label?: string;
  tooltip?: string;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  className?: string;
  contentClassName?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<TextStyle>;
  tintColor?: string;
};

export function LiquidGlassButton({
  children,
  label,
  tooltip,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  className,
  contentClassName,
  style,
  contentStyle,
  tintColor,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const glassTint = tintColor ?? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)');
  const fallbackBg = isDark ? 'rgba(32, 30, 38, 0.72)' : 'rgba(255, 255, 255, 0.82)';
  const fallbackBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(32,26,36,0.10)';
  const content = (
    <LiquidGlassView
      effect={isDark ? 'regular' : 'clear'}
      colorScheme={isDark ? 'dark' : 'light'}
      tintColor={glassTint}
      style={[
        {
          borderRadius: 9999,
          borderCurve: 'continuous',
          overflow: 'hidden',
        },
        !isLiquidGlassSupported && {
          backgroundColor: fallbackBg,
          borderWidth: 1,
          borderColor: fallbackBorder,
        },
        style,
      ]}
    >
      <TextOrChildren
        label={label}
        color={colors.text}
        className={contentClassName}
        style={contentStyle}
      >
        {children}
      </TextOrChildren>
    </LiquidGlassView>
  );

  const pressStyle = ({ pressed }: { pressed: boolean }) => [
    disabled ? { opacity: 0.45 } : undefined,
    pressed && !disabled ? { opacity: 0.72, transform: [{ scale: 0.99 }] } : undefined,
  ];

  if (tooltip) {
    return (
      <TooltipPressable
        tooltip={tooltip}
        onPress={onPress}
        disabled={disabled}
        className={className}
        style={pressStyle}
        accessibilityLabel={accessibilityLabel ?? label ?? tooltip}
        accessibilityHint={accessibilityHint}
      >
        {content}
      </TooltipPressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={className}
      style={pressStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </Pressable>
  );
}

function TextOrChildren({
  children,
  label,
  color,
  className,
  style,
}: {
  children?: React.ReactNode;
  label?: string;
  color: string;
  className?: string;
  style?: StyleProp<TextStyle>;
}) {
  if (children) {
    return <>{children}</>;
  }

  return (
    <Text className={className ?? 'font-black'} style={[{ color }, style]}>
      {label}
    </Text>
  );
}
