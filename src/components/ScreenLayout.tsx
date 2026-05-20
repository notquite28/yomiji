import { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView as RNScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TooltipPressable } from './TooltipPressable';

export function ScreenLayout({
  children,
  scrollable = false,
  keyboardShouldPersistTaps = false,
  keyboardAvoiding = false,
  scrollViewRef,
  overlay,
  footer,
}: {
  children: ReactNode;
  scrollable?: boolean;
  keyboardShouldPersistTaps?: boolean;
  keyboardAvoiding?: boolean;
  scrollViewRef?: React.RefObject<RNScrollView | null>;
  overlay?: ReactNode;
  footer?: ReactNode;
}) {
  if (scrollable) {
    const scrollView = (
      <RNScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: footer ? 32 : 20,
          gap: 18,
        }}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ? 'handled' : undefined}
      >
        {children}
      </RNScrollView>
    );

    const bodyContent = footer ? (
      <View className="flex-1">
        {scrollView}
        {footer}
      </View>
    ) : (
      scrollView
    );

    const body = keyboardAvoiding ? (
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {bodyContent}
      </KeyboardAvoidingView>
    ) : (
      bodyContent
    );

    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
        {body}
        {overlay}
      </SafeAreaView>
    );
  }

  const bodyContent = footer ? (
    <View className="flex-1">
      <View className="flex-1">{children}</View>
      {footer}
    </View>
  ) : (
    <View className="flex-1">{children}</View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      {bodyContent}
      {overlay}
    </SafeAreaView>
  );
}

export function CenteredMessage({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <ScreenLayout>
      <View className="flex-1 items-center justify-center p-6 gap-4">
        <ActivityIndicator
          color="#ff00aa"
          className={actionLabel ? 'opacity-0' : ''}
          accessibilityLabel={actionLabel ? undefined : label}
        />
        <Text className="text-lg font-heavy text-text dark:text-text-dark text-center" accessibilityRole="text">
          {label}
        </Text>
        {actionLabel ? (
          <Pressable
            onPress={onAction}
            className="min-h-[54px] items-center justify-center rounded-lg px-4.5 bg-kanji"
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text className="text-white text-[16px] font-black">
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenLayout>
  );
}

export function SessionHeader({
  onBack,
  progress,
  onSettings,
  dimmed = false,
}: {
  onBack: () => void;
  progress: string;
  onSettings?: () => void;
  dimmed?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Pressable
        onPress={onBack}
        className="rounded-full px-3.5 py-2.5 bg-surface dark:bg-surface-dark border border-border dark:border-border-dark"
        style={({ pressed }) => {
          if (pressed) return { opacity: 0.58 };
          if (dimmed) return { opacity: 0.35 };
          return undefined;
        }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text className="text-text dark:text-text-dark font-black">Back</Text>
      </Pressable>
      <Text className="text-text-muted dark:text-text-muted-dark font-black">
        {progress}
      </Text>
      {onSettings ? (
        <TooltipPressable
          tooltip="Quick settings"
          accessibilityHint="Wrap up, end session, or change answer mode"
          onPress={onSettings}
          accessibilityLabel="Quick settings"
          className="rounded-full w-[38px] h-[38px] items-center justify-center bg-surface dark:bg-surface-dark border border-border dark:border-border-dark"
        >
          <Text className="text-text dark:text-text-dark text-lg">⚙</Text>
        </TooltipPressable>
      ) : (
        <View className="w-[38px]" />
      )}
    </View>
  );
}
