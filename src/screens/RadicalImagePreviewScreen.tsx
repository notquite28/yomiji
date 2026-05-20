import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenLayout, SessionHeader, CenteredMessage } from '../components/ScreenLayout';
import { SubjectHeroCard } from '../components/SubjectHeroCard';
import { openAppDatabase } from '../domain/db/database';
import { getRadicalImagePreviewItems, RadicalImagePreviewItem } from '../domain/subjects/radicalImageRepository';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/AppThemeProvider';
import { colorForSubjectType } from '../theme/subjectColors';

type Props = NativeStackScreenProps<RootStackParamList, 'RadicalImagePreview'>;

export function RadicalImagePreviewScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
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
        color={colorForSubjectType(colors, 'radical')}
        minHeight={260}
      />

      <View className="rounded-3xl p-[18px] bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark gap-2">
        <Text className="text-lg font-black text-text dark:text-text-dark">
          {item.slug ?? `Subject ${item.id}`}
        </Text>
        <Text className="text-base leading-[21px] font-bold text-text-muted dark:text-text-muted-dark">
          Meanings: {meanings || 'None'}
        </Text>
        <Text className="text-base leading-[21px] font-bold text-text-muted dark:text-text-muted-dark">
          Image type: {item.imageIsSvg ? 'SVG' : 'PNG'}
        </Text>
        <Text className="text-base leading-[21px] font-bold text-text-muted dark:text-text-muted-dark">
          Resolved URL: {item.imageUrl ?? 'NONE'}
        </Text>
        <Text className="text-lg font-black text-text dark:text-text-dark">
          Raw character_images:
        </Text>
        {item.characterImages.map((img, i) => (
          <View key={i} className="gap-0.5 pb-1.5">
            <Text className="text-base leading-[21px] font-bold text-text-muted dark:text-text-muted-dark">
              {img.content_type ?? 'unknown'} | {img.style_name ?? '-'} | {img.color ?? '-'}
            </Text>
            <Text selectable className="text-xs leading-[17px] font-bold text-text-muted dark:text-text-muted-dark">
              {img.url}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row gap-3">
        <Pressable
          disabled={index === 0}
          onPress={() => setIndex((value) => Math.max(0, value - 1))}
          className="flex-1 min-h-[54px] items-center justify-center rounded-lg bg-surface dark:bg-surface-dark border border-border dark:border-border-dark px-[18px]"
          style={({ pressed }) =>
            pressed || index === 0 ? { opacity: 0.58 } : undefined
          }
          accessibilityRole="button"
          accessibilityLabel="Previous radical"
          accessibilityState={{ disabled: index === 0 }}
        >
          <Text className="text-[16px] font-black text-text dark:text-text-dark">Previous</Text>
        </Pressable>
        <Pressable
          disabled={index >= items.length - 1}
          onPress={() => setIndex((value) => Math.min(items.length - 1, value + 1))}
          className="flex-1 min-h-[54px] items-center justify-center rounded-lg bg-radical px-[18px]"
          style={({ pressed }) =>
            pressed || index >= items.length - 1 ? { opacity: 0.58 } : undefined
          }
          accessibilityRole="button"
          accessibilityLabel="Next radical"
          accessibilityState={{ disabled: index >= items.length - 1 }}
        >
          <Text className="text-[16px] font-black text-white">Next</Text>
        </Pressable>
      </View>
    </ScreenLayout>
  );
}
