import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ChevronRight, LineChart} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';
import {ActivityItem} from './ActivityItem';

export interface TimelineActivity {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  time: string;
  status: 'success' | 'failed' | 'pending';
  color: string;
}

interface Props {
  items: TimelineActivity[];
  onViewAll: () => void;
}

export const ActivityTimeline = ({items, onViewAll}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.dark ? '#000000' : '#253858'}]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <LineChart color={colors.primary} size={20} strokeWidth={2.5} />
          <Text numberOfLines={1} style={[styles.title, {color: colors.text}]}>Recent Activity</Text>
        </View>
        <Pressable onPress={onViewAll} style={styles.viewAll}>
          <Text numberOfLines={1} style={[styles.viewAllText, {color: colors.primary}]}>View All</Text>
          <ChevronRight color={colors.primary} size={18} strokeWidth={2.8} />
        </Pressable>
      </View>

      <View style={styles.list}>
        {items.length ? (
          items.map(item => <ActivityItem key={item.id} {...item} />)
        ) : (
          <Text style={[styles.empty, {color: colors.muted}]}>No recent activity yet</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    elevation: 3,
    gap: 14,
    padding: 16,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  viewAll: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  list: {
    gap: 2,
  },
  empty: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    paddingVertical: 10,
  },
});
