import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';

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

  useEffect(() => {
    const listener = (e: ToastEntry | null) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (e) {
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
  }, []);

  return entry ? (
    <View className="absolute bottom-10 left-0 right-0 items-center" pointerEvents="box-none">
      <Pressable
        className="rounded px-4 py-2.5 bg-text dark:bg-surface-elevated-dark max-w-[300px]"
        onPress={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          setEntry(null);
        }}
      >
        <Text className="text-white text-[14px] font-bold text-center">
          {entry.text}
        </Text>
      </Pressable>
    </View>
  ) : null;
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
