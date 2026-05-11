import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colorForSubjectType } from '../theme/subjectColors';
import type { AppColors } from '../theme/palette';
import type { RecentItem, LeechedItem } from '../domain/dashboard/dashboardRepository';

export function RecentItemList({
  items,
  colors,
  onPressItem,
}: {
  items: RecentItem[];
  colors: AppColors;
  onPressItem?: (subjectId: number) => void;
}) {
  if (items.length === 0) {
    return <Text style={[styles.empty, { color: colors.mutedText }]}>No recent items.</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Pressable
          key={item.subjectId}
          onPress={() => onPressItem?.(item.subjectId)}
          disabled={!onPressItem}
          style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}
        >
          <View style={[styles.typeDot, { backgroundColor: colorForSubjectType(colors, item.subjectType) }]} />
          <Text style={[styles.itemJapanese, { color: colors.text }]}>{item.japanese || '?'}</Text>
          <Text style={[styles.itemMeta, { color: colors.mutedText }]}>L{item.level}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LeechItemList({
  items,
  colors,
  onPressItem,
}: {
  items: LeechedItem[];
  colors: AppColors;
  onPressItem?: (subjectId: number) => void;
}) {
  if (items.length === 0) {
    return <Text style={[styles.empty, { color: colors.mutedText }]}>No leeches found.</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Pressable
          key={item.subjectId}
          onPress={() => onPressItem?.(item.subjectId)}
          disabled={!onPressItem}
          style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}
        >
          <View style={[styles.typeDot, { backgroundColor: colorForSubjectType(colors, item.subjectType) }]} />
          <Text style={[styles.itemJapanese, { color: colors.text }]}>{item.japanese || '?'}</Text>
          <Text style={[styles.itemMeta, { color: colors.mutedText }]}>{item.score}%</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 6,
  },
  empty: {
    fontSize: 13,
    fontWeight: '700',
    paddingTop: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.08)',
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  itemJapanese: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
