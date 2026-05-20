import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WaniKaniApiError, WaniKaniClient } from '../domain/api/WaniKaniClient';
import { openAppDatabase, putUser } from '../domain/db/database';
import { saveApiToken } from '../domain/storage/secureToken';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/AppThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'> & {
  onAuthenticated: (token: string) => void;
};

const TOKEN_HELP_URL = 'https://www.wanikani.com/settings/personal_access_tokens';

export function LoginScreen({ onAuthenticated }: Props) {
  const theme = useAppTheme();
  const entrance = useRef(new Animated.Value(0)).current;
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 640,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const entranceStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  const submit = async () => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError('Paste a WaniKani API token to continue.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const client = new WaniKaniClient(trimmedToken);
      const user = await client.getUser();
      const db = await openAppDatabase();
      await putUser(db, user);
      await saveApiToken(trimmedToken);
      onAuthenticated(trimmedToken);
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f7f4ef] dark:bg-[#0c0b0f]">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingVertical: 28,
            justifyContent: 'center',
            alignSelf: 'center',
            width: '100%',
            maxWidth: 460,
            gap: 16,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            className="overflow-hidden rounded-[30px] p-6 min-h-[258px] justify-between bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)]"
            style={[
              entranceStyle,
              {
                shadowColor: '#000',
                shadowOpacity: theme.isDark ? 0.18 : 0.06,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 5,
              },
            ]}
          >
            <View className="self-start flex-row items-center gap-2 rounded-full px-3 py-2 bg-[#f2eee8] dark:bg-[#201e26] border border-[rgba(32,26,36,0.06)] dark:border-[rgba(255,255,255,0.08)]">
              <View className="w-2 h-2 rounded-full bg-kanji" />
              <Text className="text-xs font-heavy tracking-ultra3 uppercase text-text-muted dark:text-text-muted-dark">
                WaniKani study
              </Text>
            </View>
            <Text className="mt-[34px] text-[74px] font-black tracking-[8px] text-kanji">
              読み道
            </Text>
            <Text className="mt-1 text-[38px] leading-[44px] font-black text-text dark:text-text-dark">
              読路
            </Text>
            <Text className="mt-1.5 text-base leading-[21px] font-bold text-text-muted dark:text-text-muted-dark">
              A quieter path through reviews.
            </Text>
          </Animated.View>

          <Animated.View
            className="rounded-4xl p-[18px] bg-[#fffdf8] dark:bg-[#15141a] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.08)] gap-[13px]"
            style={[
              entranceStyle,
              {
                shadowColor: '#000',
                shadowOpacity: theme.isDark ? 0.16 : 0.05,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 4,
              },
            ]}
          >
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-2xl font-black text-text dark:text-text-dark">
                Connect
              </Text>
              <Text className="text-xs font-heavy tracking-ultra uppercase text-text-muted dark:text-text-muted-dark">
                Private token
              </Text>
            </View>
            <Text className="text-xs font-heavy tracking-ultra uppercase text-text-muted dark:text-text-muted-dark">
              API token
            </Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Paste personal access token"
              placeholderTextColor={theme.colors.mutedText}
              selectionColor={theme.colors.kanji}
              className="min-h-[58px] rounded-[20px] border border-[rgba(32,26,36,0.08)] dark:border-[rgba(255,255,255,0.12)] bg-[#f2eee8] dark:bg-[#0f0e13] text-text dark:text-text-dark px-[18px] text-[16px] font-bold"
              returnKeyType="done"
              onSubmitEditing={submit}
              accessibilityLabel="WaniKani API token"
              accessibilityHint="Paste a personal access token with review and study material scopes."
            />
            <Text className="text-[13px] leading-[18px] font-bold text-text-muted dark:text-text-muted-dark">
              Needs review and study-material scopes.
            </Text>
            {error ? (
              <Text className="text-[14px] leading-5 font-bold text-danger dark:text-danger-dark" accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Pressable
              disabled={isSubmitting}
              onPress={submit}
              className="min-h-[58px] items-center justify-center rounded-[20px] bg-kanji"
              style={({ pressed }) => ({
                opacity: pressed || isSubmitting ? 0.72 : 1,
                transform: [{ scale: pressed || isSubmitting ? 0.99 : 1 }],
                shadowColor: '#000',
                shadowOpacity: theme.isDark ? 0.2 : 0.12,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 4,
              })}
              accessibilityRole="button"
              accessibilityLabel={isSubmitting ? 'Validating token' : 'Enter Yomiji'}
              accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            >
              <Text className="text-[16px] font-black tracking-wide text-white">
                {isSubmitting ? 'Validating...' : 'Enter 読路'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(TOKEN_HELP_URL)}
              className="items-center py-2"
              accessibilityRole="link"
              accessibilityLabel="Create WaniKani API token"
            >
              <Text className="text-[14px] font-heavy text-radical">Create token</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function loginErrorMessage(error: unknown) {
  if (error instanceof WaniKaniApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'That token was rejected. Check that it is active and has the required permissions.';
    }
    if (error.status === 429) {
      return 'WaniKani rate limited the request. Wait a minute, then try again.';
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Could not validate the token.';
}
