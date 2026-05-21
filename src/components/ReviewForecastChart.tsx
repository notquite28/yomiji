import { StyleSheet, Text, View } from 'react-native';

import type { ReviewForecastHour } from '../domain/dashboard/dashboardRepository';

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
  const visible = hours.slice(0, 25);
  const currentHour = new Date().getHours();
  const maxCount = Math.max(1, ...visible.map((h) => h.count));
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const nowIso = `${year}-${month}-${day}T${hour}:00:00`;
  const totalUpcoming = visible.reduce((sum, h) => sum + h.count, 0);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.summary, { color: mutedColor }]}>
          {totalUpcoming} reviews in the next 24h
        </Text>
      </View>
      <View style={styles.chart}>
        {visible.map((hour, i) => {
          const hourDate = new Date(hour.hour);
          const h = hourDate.getHours();
          const isNow = hour.hour === nowIso;
          const barHeight = `${Math.round((hour.count / maxCount) * 100)}%` as `${number}%`;
          const showLabel = i === 0 || h === 0 || i === visible.length - 1 || (h - currentHour) % 6 === 0;

          return (
            <View key={hour.hour} style={styles.barColumn}>
              <Text style={[styles.barCount, { color: hour.count > 0 ? textColor : 'transparent' }]}>
                {hour.count > 0 ? hour.count : ''}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: trackColor }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: isNow ? barColor : barColor + '88',
                      height: barHeight,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: showLabel ? mutedColor : 'transparent' }]}>
                {h === 0 ? '24' : String(h)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summary: {
    fontSize: 12,
    fontWeight: '700',
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 72,
    gap: 2,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barCount: {
    fontSize: 9,
    fontWeight: '800',
  },
  barTrack: {
    width: '100%',
    flex: 1,
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 3,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 8,
    fontWeight: '700',
  },
});
