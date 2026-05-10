import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
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
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          <View style={styles.heroCard}>
            <Text style={styles.logo}>読み道</Text>
            <Text style={styles.title}>Yomichi</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>WaniKani API token</Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Token token=... not needed"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <Text style={styles.helpText}>Required permissions: assignments:start, reviews:create, study_materials:create, and study_materials:update.</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable disabled={isSubmitting} onPress={submit} style={({ pressed }) => [styles.primaryButton, (pressed || isSubmitting) && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{isSubmitting ? 'Validating...' : 'Validate and Continue'}</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(TOKEN_HELP_URL)} style={styles.linkButton}>
              <Text style={styles.linkText}>Open WaniKani token settings</Text>
            </Pressable>
          </View>
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
      backgroundColor: theme.colors.background,
    },
    keyboard: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      padding: 20,
      justifyContent: 'center',
      gap: 18,
    },
    heroCard: {
      overflow: 'hidden',
      borderRadius: 32,
      padding: 26,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    kicker: {
      color: theme.colors.vocabulary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    logo: {
      marginTop: 14,
      color: theme.colors.kanji,
      fontSize: 72,
      fontWeight: '900',
      letterSpacing: 10,
    },
    title: {
      marginTop: 6,
      color: theme.colors.text,
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '900',
    },
    subtitle: {
      marginTop: 12,
      color: theme.colors.mutedText,
      fontSize: 16,
      lineHeight: 24,
    },
    formCard: {
      borderRadius: 28,
      padding: 20,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 12,
    },
    label: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    input: {
      minHeight: 54,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      paddingHorizontal: 16,
      fontSize: 16,
    },
    helpText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    primaryButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.kanji,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },
    pressed: {
      opacity: 0.72,
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
