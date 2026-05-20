import { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { SvgCss } from 'react-native-svg/css';

import { replaceCssVariableFallbacksForHero } from '../domain/subjects/radicalSvg';

export function SubjectHeroCard({
  kicker,
  japanese,
  characterImageUrl,
  characterImageIsSvg,
  subjectType,
  level,
  color,
  minHeight = 240,
  compact = false,
}: {
  kicker: string;
  japanese: string;
  characterImageUrl?: string;
  characterImageIsSvg?: boolean;
  subjectType: string;
  level?: number;
  color: string;
  minHeight?: number;
  compact?: boolean;
}) {
  const renderContent = () => {
    if (!characterImageUrl) {
      const textProps = compact
        ? ({ numberOfLines: 3, adjustsFontSizeToFit: true, minimumFontScale: 0.5 } as const)
        : ({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.3 } as const);
      return <Text className="mt-3 text-white text-8xl font-black text-center" {...textProps}>{japanese || subjectType}</Text>;
    }
    if (characterImageIsSvg) {
      return <RadicalSvgImage uri={characterImageUrl} fallback={japanese || subjectType} compact={compact} />;
    }
    return <RadicalPngImage uri={characterImageUrl} fallback={japanese || subjectType} compact={compact} />;
  };

  return (
    <View
      className="rounded-5xl items-center justify-center p-6"
      style={{ backgroundColor: color, minHeight }}
    >
      <Text className="text-white text-[14px] font-black tracking-ultra4 uppercase">
        {kicker}
      </Text>
      {renderContent()}
      <Text className="mt-2.5 text-white text-base font-heavy opacity-[0.86] capitalize">
        Level {level ?? '?'} · {subjectType}
      </Text>
    </View>
  );
}

function RadicalPngImage({ uri, fallback, compact = false }: { uri: string; fallback: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (failed) {
    return <Text className="mt-3 text-white text-8xl font-black text-center" {...(compact ? { numberOfLines: 3, adjustsFontSizeToFit: true, minimumFontScale: 0.5 } as const : {})}>{fallback}</Text>;
  }

  return (
    <View className="mt-4 w-[150px] h-[150px] items-center justify-center rounded-4xl bg-transparent">
      <Image
        source={{ uri }}
        className="w-[112px] h-[112px]"
        resizeMode="contain"
        onError={handleError}
      />
    </View>
  );
}

function RadicalSvgImage({ uri, fallback, compact = false }: { uri: string; fallback: string; compact?: boolean }) {
  const [xml, setXml] = useState(() => svgCache.get(uri) ?? null);
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (svgCache.has(uri)) {
      setXml(svgCache.get(uri) ?? null);
      setFailed(false);
      return undefined;
    }

    const controller = new AbortController();
    setXml(null);
    setFailed(false);
    fetch(uri, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load radical image: ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        const resolvedXml = replaceCssVariableFallbacksForHero(text);
        svgCache.set(uri, resolvedXml);
        setXml(resolvedXml);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setXml(null);
        setFailed(true);
      });

    return () => controller.abort();
  }, [uri]);

  if (failed) {
    return <Text className="mt-3 text-white text-8xl font-black text-center" {...(compact ? { numberOfLines: 3, adjustsFontSizeToFit: true, minimumFontScale: 0.5 } as const : {})}>{fallback}</Text>;
  }

  return (
    <View className="mt-4 w-[150px] h-[150px] items-center justify-center rounded-4xl bg-transparent">
      <SvgCss xml={xml} width={112} height={112} onError={handleError} />
    </View>
  );
}

const svgCache = new Map<string, string>();
