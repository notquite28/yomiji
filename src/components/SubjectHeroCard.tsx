import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgCss } from 'react-native-svg/css';

import { replaceCssVariableFallbacksForHero } from '../domain/subjects/radicalSvg';
import { AppTheme, useAppTheme } from '../theme/AppThemeProvider';

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
  const theme = useAppTheme();
  const styles = makeStyles(theme);

  const renderContent = () => {
    if (!characterImageUrl) {
      const textProps = compact
        ? ({ numberOfLines: 3, adjustsFontSizeToFit: true, minimumFontScale: 0.5 } as const)
        : ({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.3 } as const);
      return <Text style={styles.characters} {...textProps}>{japanese || subjectType}</Text>;
    }
    if (characterImageIsSvg) {
      return <RadicalSvgImage uri={characterImageUrl} fallback={japanese || subjectType} compact={compact} />;
    }
    return <RadicalPngImage uri={characterImageUrl} fallback={japanese || subjectType} compact={compact} />;
  };

  return (
    <View style={[styles.card, { backgroundColor: color, minHeight }]}>
      <Text style={styles.kicker}>{kicker}</Text>
      {renderContent()}
      <Text style={styles.meta}>
        Level {level ?? '?'} · {subjectType}
      </Text>
    </View>
  );
}

function RadicalPngImage({ uri, fallback, compact = false }: { uri: string; fallback: string; compact?: boolean }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (failed) {
    return <Text style={styles.characters} {...(compact ? { numberOfLines: 3, adjustsFontSizeToFit: true, minimumFontScale: 0.5 } as const : {})}>{fallback}</Text>;
  }

  return (
    <View style={styles.imageFrame}>
      <Image
        source={{ uri }}
        style={styles.radicalImage}
        resizeMode="contain"
        onError={handleError}
      />
    </View>
  );
}

function RadicalSvgImage({ uri, fallback, compact = false }: { uri: string; fallback: string; compact?: boolean }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
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
    return <Text style={styles.characters} {...(compact ? { numberOfLines: 3, adjustsFontSizeToFit: true, minimumFontScale: 0.5 } as const : {})}>{fallback}</Text>;
  }

  return (
    <View style={styles.imageFrame}>
      <SvgCss xml={xml} width={112} height={112} onError={handleError} />
    </View>
  );
}

const svgCache = new Map<string, string>();

function makeStyles(_theme: AppTheme) {
  return StyleSheet.create({
    card: {
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    kicker: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    characters: {
      marginTop: 12,
      color: '#ffffff',
      fontSize: 72,
      fontWeight: '900',
      textAlign: 'center',
    },
    imageFrame: {
      marginTop: 16,
      width: 150,
      height: 150,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 28,
      backgroundColor: 'transparent',
    },
    radicalImage: {
      width: 112,
      height: 112,
    },
    meta: {
      marginTop: 10,
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
      opacity: 0.86,
      textTransform: 'capitalize',
    },
  });
}
