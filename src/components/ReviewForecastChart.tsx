import { StyleSheet, Text, View } from 'react-native';

import type { ReviewForecastHour } from '../domain/dashboard/dashboardRepository';

function formatHour(date: Date): string {
  const h = date.getHours();
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

export function ReviewForecastChart({
  hours,
  barColor,
  textColor,
  mutedColor,
  trackColor,
}: {
  hours: ReviewForecastHour[];
  barColor: string;
  textColor: string;
  mutedColor: string;
  trackColor: string;
}) {
  const visible = hours.slice(0, 25).filter((h) => h.count > 0);
  const maxCount = Math.max(1, ...visible.map((h) => h.count));
  const totalUpcoming = visible.reduce((sum, h) => sum + h.count, 0);

  let cumulative = 0;
  const rows = visible.map((entry) => {
    cumulative += entry.count;
    return {
      hour: entry.hour,
      label: formatHour(new Date(entry.hour)),
      count: entry.count,
      cumulative,
      width: `${Math.round((entry.count / maxCount) * 100)}%` as `${number}%`,
    };
  });

  return (
    <View style={styles.container}>
      <Text style={[styles.summary, { color: textColor }]}>
        +{totalUpcoming} <Text style={{ color: mutedColor }}>in the next 24h</Text>
      </Text>
      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: mutedColor }]}>No reviews coming up.</Text>
      ) : (
        <View style={styles.rows}>
          {rows.map((row) => (
            <View key={row.hour} style={styles.row}>
              <Text style={[styles.time, { color: mutedColor }]} numberOfLines={1}>
                {row.label}
              </Text>
              <View style={[styles.track, { backgroundColor: trackColor }]}>
                <View style={[styles.fill, { width: row.width, backgroundColor: barColor }]} />
              </View>
              <Text style={[styles.increment, { color: barColor }]} numberOfLines={1}>
                +{row.count}
              </Text>
              <Text style={[styles.total, { color: mutedColor }]} numberOfLines={1}>
                {row.cumulative}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  summary: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  empty: {
    fontSize: 13,
    fontWeight: '700',
  },
  rows: {
    gap: 9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  time: {
    width: 48,
    fontSize: 12,
    fontWeight: '800',
  },
  track: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 6,
    minWidth: 4,
  },
  increment: {
    width: 44,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '900',
  },
  total: {
    width: 34,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
  },
});

