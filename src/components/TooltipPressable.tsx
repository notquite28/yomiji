import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, Vibration, View } from 'react-native';
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

type ToastEntry = { id: number; text: string };
let toastListeners: Array<(entry: ToastEntry | null) => void> = [];
let toastId = 0;

function showToast(text: string) {
  toastId += 1;
  const entry: ToastEntry = { id: toastId, text };
  for (const fn of toastListeners) fn(entry);
}

export function ToastHost() {
  const [entry, setEntry] = useState<ToastEntry | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener = (e: ToastEntry | null) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (e) {
        pop.setValue(0);
        setEntry(e);
        timerRef.current = setTimeout(() => setEntry(null), 1800);
      } else {
        setEntry(null);
      }
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== listener);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pop]);

  useEffect(() => {
    if (!entry) return;
    Animated.spring(pop, {
      toValue: 1,
      damping: 13,
      stiffness: 280,
      mass: 0.7,
      overshootClamping: false,
      useNativeDriver: true,
    }).start();
  }, [entry, pop]);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setEntry(null);
  };

  const content = entry ? (
    <View
      className="absolute bottom-10 left-0 right-0 items-center"
      pointerEvents="box-none"
      style={{ zIndex: 2147483647, elevation: 2147483647 }}
    >
      <Animated.View
        style={{
          opacity: pop,
          transform: [
            {
              translateY: pop.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
                easing: Easing.out(Easing.cubic),
              }),
            },
            {
              scale: pop.interpolate({
                inputRange: [0, 0.72, 1],
                outputRange: [0.88, 1.06, 1],
              }),
            },
          ],
        }}
      >
        <Pressable
          className="rounded-2xl px-4 py-2.5 bg-text dark:bg-surface-elevated-dark max-w-[300px] shadow-lg"
          onPress={dismiss}
        >
          <Text className="text-white text-[14px] font-bold text-center">
            {entry.text}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  ) : null;

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{content}</FullWindowOverlay>;
  }

  return content;
}

export function TooltipPressable({
  tooltip,
  children,
  onLongPress: onLongPressProp,
  onPress,
  disabled,
  className,
  style,
  accessibilityLabel,
  accessibilityHint,
}: {
  tooltip: string;
  children: React.ReactNode;
  onLongPress?: (e: GestureResponderEvent) => void;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const handleLongPress = useCallback(
    (e: GestureResponderEvent) => {
      Vibration.vibrate(10);
      showToast(tooltip);
      onLongPressProp?.(e);
    },
    [tooltip, onLongPressProp],
  );

  return (
    <Pressable
      onPress={onPress}
      onLongPress={handleLongPress}
      disabled={disabled}
      className={className}
      style={style}
      accessibilityLabel={accessibilityLabel ?? tooltip}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}
