import { Pressable, StyleSheet, Text, View } from 'react-native';

export type SrsBarEntry = {
  label: string;
  count: number;
  color: string;
  srsMin?: number;
  srsMax?: number;
};

export function SrsBar({
  entries,
  textColor,
  mutedColor,
  trackColor,
  onEntryPress,
}: {
  entries: SrsBarEntry[];
  textColor: string;
  mutedColor: string;
  trackColor: string;
  onEntryPress?: (entry: SrsBarEntry) => void;
}) {
  const maxCount = Math.max(1, ...entries.map((e) => e.count));

  return (
    <View style={styles.container}>
      {entries.map((entry) => {
        const handlePress = onEntryPress && entry.count > 0 ? () => onEntryPress(entry) : undefined;
        return (
          <SrsRow
            key={entry.label}
            label={entry.label}
            count={entry.count}
            color={entry.color}
            maxCount={maxCount}
            textColor={textColor}
            mutedColor={mutedColor}
            trackColor={trackColor}
            onPress={handlePress}
          />
        );
      })}
    </View>
  );
}

function SrsRow({
  label,
  count,
  color,
  maxCount,
  textColor,
  mutedColor,
  trackColor,
  onPress,
}: {
  label: string;
  count: number;
  color: string;
  maxCount: number;
  textColor: string;
  mutedColor: string;
  trackColor: string;
  onPress?: () => void;
}) {
  const fillWidth = `${Math.round((count / maxCount) * 100)}%` as `${number}%`;
  const content = (
    <>
      <View style={styles.textRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, { color: mutedColor }]}>{label}</Text>
        <Text style={[styles.count, { color: textColor }]}>{count}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { backgroundColor: color, width: fillWidth }]} />
      </View>
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={`Browse ${label} items`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  pressed: {
    opacity: 0.72,
  },
  row: {
    gap: 8,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  count: {
    fontSize: 18,
    fontWeight: '900',
  },
  track: {
    overflow: 'hidden',
    height: 8,
    borderRadius: 999,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
