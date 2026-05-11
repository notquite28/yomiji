import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout, SessionHeader, CenteredMessage } from '../components/ScreenLayout';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { openAppDatabase } from '../domain/db/database';
import { getRadicalImagePreviewItems, RadicalImagePreviewItem } from '../domain/subjects/radicalImageRepository';
import { RootStackParamList } from '../navigation/types';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'RadicalImagePreview'>;

export function RadicalImagePreviewScreen({ navigation }: Props) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [items, setItems] = useState<RadicalImagePreviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    openAppDatabase()
      .then((db) => getRadicalImagePreviewItems(db))
      .then((previewItems) => {
        if (isMounted) {
          setItems(previewItems);
        }
      })
      .catch((caught: unknown) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return <CenteredMessage label="Loading image radicals..." />;
  }

  if (error) {
    return <CenteredMessage label={error} actionLabel="Back" onAction={() => navigation.goBack()} />;
  }

  if (!items.length) {
    return <CenteredMessage label="No image-only radicals found in the local cache. Sync first, then try again." actionLabel="Back" onAction={() => navigation.goBack()} />;
  }

  const item = items[index] ?? items[0]!;
  const meanings = item.subject.meanings
    .filter((meaning) => meaning.acceptedAnswer !== false && meaning.type !== 'blacklist')
    .map((meaning) => meaning.meaning)
    .join(', ');

  return (
    <ScreenLayout scrollable>
      <SessionHeader onBack={() => navigation.goBack()} progress={`${index + 1}/${items.length}`} />

      <SubjectHeroCard
        kicker="Radical Preview"
        japanese={item.subject.japanese}
        characterImageUrl={item.imageUrl}
        characterImageIsSvg={item.imageIsSvg}
        subjectType="radical"
        level={item.level}
        color={colorForSubjectType(theme.colors, 'radical')}
        minHeight={260}
      />

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{item.slug ?? `Subject ${item.id}`}</Text>
        <Text style={styles.bodyText}>Meanings: {meanings || 'None'}</Text>
        <Text style={styles.bodyText}>Image type: {item.imageIsSvg ? 'SVG' : 'PNG'}</Text>
        <Text style={styles.bodyText}>Resolved URL: {item.imageUrl ?? 'NONE'}</Text>
        <Text style={styles.panelTitle}>{'Raw character_images:'}</Text>
        {item.characterImages.map((img, i) => (
          <View key={i} style={styles.imageInfoRow}>
            <Text style={styles.bodyText}>{img.content_type ?? 'unknown'} | {img.style_name ?? '-'} | {img.color ?? '-'}</Text>
            <Text selectable style={styles.urlText}>{img.url}</Text>
          </View>
        ))}
      </View>

      <View style={styles.row}>
        <Pressable
          disabled={index === 0}
          onPress={() => setIndex((value) => Math.max(0, value - 1))}
          style={({ pressed }) => [styles.secondaryButton, (pressed || index === 0) && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>Previous</Text>
        </Pressable>
        <Pressable
          disabled={index >= items.length - 1}
          onPress={() => setIndex((value) => Math.min(items.length - 1, value + 1))}
          style={({ pressed }) => [styles.primaryButton, (pressed || index >= items.length - 1) && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Next</Text>
        </Pressable>
      </View>
    </ScreenLayout>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    panel: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
    },
    panelTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '900',
    },
    bodyText: {
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
    },
    urlText: {
      color: theme.colors.mutedText,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '700',
    },
    imageInfoRow: {
      gap: 2,
      paddingBottom: 6,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    primaryButton: {
      flex: 1,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.radical,
      paddingHorizontal: 18,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },
    secondaryButton: {
      flex: 1,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 18,
    },
    secondaryButtonText: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '900',
    },
    pressed: {
      opacity: 0.58,
    },
  });
}
