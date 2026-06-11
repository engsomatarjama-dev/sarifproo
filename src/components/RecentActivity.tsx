import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Banknote, ChevronRight, Send, Wallet} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';
import {StatusBadge} from './StatusBadge';

export interface RecentActivityItem {
  id: string;
  title: string;
  subtitle: string;
  timestamp: string;
  status: 'Success' | 'Failed' | 'Pending';
  icon: 'direct' | 'balance' | 'bank';
}

interface Props {
  items: RecentActivityItem[];
  onViewAll: () => void;
}

const icons: Record<RecentActivityItem['icon'], LucideIcon> = {
  direct: Send,
  balance: Wallet,
  bank: Banknote,
};

export const RecentActivity = ({items, onViewAll}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.dark ? '#000000' : '#253858'}]}>
      <View style={styles.header}>
        <Text numberOfLines={1} style={[styles.heading, {color: colors.text}]}>
          Recent Activity
        </Text>
        <Pressable onPress={onViewAll} style={styles.viewAll}>
          <Text numberOfLines={1} style={[styles.viewAllText, {color: colors.primary}]}>
            View All
          </Text>
          <ChevronRight color={colors.primary} size={17} strokeWidth={2.8} />
        </Pressable>
      </View>

      <View style={styles.list}>
        {items.length ? (
          items.slice(0, 3).map(item => {
            const Icon = icons[item.icon];
            const failed = item.status === 'Failed';
            const pending = item.status === 'Pending';
            const iconColor = failed ? colors.accent : pending ? colors.warning : colors.success;
            return (
              <View key={item.id} style={styles.row}>
                <View style={[styles.iconWrap, {backgroundColor: `${iconColor}18`}]}>
                  <Icon color={iconColor} size={20} strokeWidth={2.5} />
                </View>
                <View style={styles.content}>
                  <Text numberOfLines={2} style={[styles.title, {color: colors.text}]}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.subtitle, {color: colors.muted}]}>
                    {item.subtitle}
                  </Text>
                </View>
                <View style={styles.side}>
                  <Text numberOfLines={1} style={[styles.timestamp, {color: colors.text}]}>
                    {item.timestamp}
                  </Text>
                  <StatusBadge label={item.status} tone={failed ? 'danger' : pending ? 'warning' : 'success'} />
                </View>
              </View>
            );
          })
        ) : (
          <Text style={[styles.empty, {color: colors.muted}]}>No recent activity</Text>
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
    gap: 12,
    padding: 15,
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
  heading: {
    flex: 1,
    fontSize: 18,
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
    gap: 8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    minWidth: 0,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  content: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  side: {
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 98,
  },
  timestamp: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  empty: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
    paddingVertical: 8,
  },
});
