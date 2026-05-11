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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WaniKaniApiError, WaniKaniClient } from '../domain/api/WaniKaniClient';
import { openAppDatabase, putUser } from '../domain/db/database';
import { saveApiToken } from '../domain/storage/secureToken';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'> & {
  onAuthenticated: (token: string) => void;
};

const TOKEN_HELP_URL = 'https://www.wanikani.com/settings/personal_access_tokens';

export function LoginScreen({ onAuthenticated }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
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
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.select({ ios: 'padding', android: undefined })}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View style={[styles.heroCard, entranceStyle]}>
            <View style={styles.brandPill}>
              <View style={styles.brandDot} />
              <Text style={styles.kicker}>WaniKani study</Text>
            </View>
            <Text style={styles.logo}>読み道</Text>
            <Text style={styles.title}>Yomichi</Text>
            <Text style={styles.subtitle}>A quieter path through reviews.</Text>
          </Animated.View>

          <Animated.View style={[styles.formCard, entranceStyle]}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Connect</Text>
              <Text style={styles.formMeta}>Private token</Text>
            </View>
            <Text style={styles.label}>API token</Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Paste personal access token"
              placeholderTextColor={theme.colors.mutedText}
              selectionColor={theme.colors.kanji}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <Text style={styles.helpText}>Needs review and study-material scopes.</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable disabled={isSubmitting} onPress={submit} style={({ pressed }) => [styles.primaryButton, (pressed || isSubmitting) && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{isSubmitting ? 'Validating...' : 'Enter Yomichi'}</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(TOKEN_HELP_URL)} style={styles.linkButton}>
              <Text style={styles.linkText}>Create token</Text>
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

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.isDark ? '#0c0b0f' : '#f7f4ef',
    },
    keyboard: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingVertical: 28,
      justifyContent: 'center',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 460,
      gap: 16,
    },
    heroCard: {
      overflow: 'hidden',
      borderRadius: 30,
      padding: 24,
      minHeight: 258,
      justifyContent: 'space-between',
      backgroundColor: theme.isDark ? '#15141a' : '#fffdf8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)',
      shadowColor: '#000000',
      shadowOpacity: theme.isDark ? 0.18 : 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    brandPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.isDark ? '#201e26' : '#f2eee8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.06)',
    },
    brandDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.kanji,
    },
    kicker: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    logo: {
      marginTop: 34,
      color: theme.colors.kanji,
      fontSize: 74,
      fontWeight: '900',
      letterSpacing: 8,
    },
    title: {
      marginTop: 4,
      color: theme.colors.text,
      fontSize: 38,
      lineHeight: 44,
      fontWeight: '900',
    },
    subtitle: {
      marginTop: 6,
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
    },
    formCard: {
      borderRadius: 28,
      padding: 18,
      backgroundColor: theme.isDark ? '#15141a' : '#fffdf8',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(32, 26, 36, 0.08)',
      gap: 13,
      shadowColor: '#000000',
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    formTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '900',
    },
    formMeta: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    label: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    input: {
      minHeight: 58,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(32, 26, 36, 0.08)',
      backgroundColor: theme.isDark ? '#0f0e13' : '#f2eee8',
      color: theme.colors.text,
      paddingHorizontal: 18,
      fontSize: 16,
      fontWeight: '700',
    },
    helpText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    primaryButton: {
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      backgroundColor: theme.colors.kanji,
      shadowColor: '#000000',
      shadowOpacity: theme.isDark ? 0.2 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    pressed: {
      opacity: 0.72,
      transform: [{ scale: 0.99 }],
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    linkText: {
      color: theme.colors.radical,
      fontSize: 14,
      fontWeight: '800',
    },
  });
}
