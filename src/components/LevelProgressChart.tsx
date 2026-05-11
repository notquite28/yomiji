import { StyleSheet, Text, View } from 'react-native';

import { colorForSubjectType } from '../theme/subjectColors';
import type { AppColors } from '../theme/palette';
import type { LevelProgress } from '../domain/dashboard/dashboardRepository';

export function LevelProgressChart({
  progress,
  colors,
  textColor,
  mutedColor,
  trackColor,
}: {
  progress: LevelProgress[];
  colors: AppColors;
  textColor: string;
  mutedColor: string;
  trackColor: string;
}) {
  if (progress.length === 0) return null;

  return (
    <View style={styles.container}>
      {progress.map((item) => (
        <LevelBar
          key={item.subjectType}
          subjectType={item.subjectType}
          total={item.total}
          passed={item.passed}
          color={colorForSubjectType(colors, item.subjectType)}
          textColor={textColor}
          mutedColor={mutedColor}
          trackColor={trackColor}
        />
      ))}
    </View>
  );
}

function LevelBar({
  subjectType,
  total,
  passed,
  color,
  textColor,
  mutedColor,
  trackColor,
}: {
  subjectType: string;
  total: number;
  passed: number;
  color: string;
  textColor: string;
  mutedColor: string;
  trackColor: string;
}) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const fillWidth = `${pct}%` as `${number}%`;
  const label = subjectType.charAt(0).toUpperCase() + subjectType.slice(1);

  return (
    <View style={styles.row}>
      <View style={styles.textRow}>
        <Text style={[styles.label, { color: mutedColor }]}>{label}</Text>
        <Text style={[styles.count, { color: textColor }]}>{passed}/{total}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { backgroundColor: color, width: fillWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  row: {
    gap: 8,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  count: {
    fontSize: 16,
    fontWeight: '900',
  },
  track: {
    overflow: 'hidden',
    height: 10,
    borderRadius: 999,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
