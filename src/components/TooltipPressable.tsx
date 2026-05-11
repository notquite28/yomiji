import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';

import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

type ToastEntry = { id: number; text: string };
let toastListeners: Array<(entry: ToastEntry | null) => void> = [];
let toastId = 0;

function showToast(text: string) {
  toastId += 1;
  const entry: ToastEntry = { id: toastId, text };
  for (const fn of toastListeners) fn(entry);
}

export function ToastHost() {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
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
    <View style={styles.host} pointerEvents="box-none">
      <Pressable
        style={styles.toast}
        onPress={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          setEntry(null);
        }}
      >
        <Text style={styles.toastText}>{entry.text}</Text>
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
  style,
  accessibilityLabel,
  accessibilityHint,
}: {
  tooltip: string;
  children: React.ReactNode;
  onLongPress?: (e: GestureResponderEvent) => void;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: Parameters<typeof Pressable>[0]['style'];
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
      style={style}
      accessibilityLabel={accessibilityLabel ?? tooltip}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    host: {
      position: 'absolute',
      bottom: 40,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    toast: {
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.isDark ? '#2c2134' : '#201a24',
      maxWidth: 300,
    },
    toastText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
}
