import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';
import {StatusBadge} from './StatusBadge';

interface Props {
  icon: LucideIcon;
  title: string;
  detail: string;
  time: string;
  status: 'success' | 'failed' | 'pending';
  color: string;
}

export const ActivityItem = ({icon: Icon, title, detail, time, status, color}: Props) => {
  const colors = useThemeColors();
  const badgeTone = status === 'success' ? 'success' : status === 'failed' ? 'danger' : 'warning';

  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, {backgroundColor: `${color}18`}]}>
        <Icon color={color} size={20} strokeWidth={2.4} />
      </View>
      <View style={styles.timeline}>
        <View style={[styles.dot, {backgroundColor: color}]} />
        <View style={[styles.line, {backgroundColor: colors.border}]} />
      </View>
      <View style={styles.content}>
        <Text numberOfLines={1} style={[styles.title, {color: colors.text}]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.detail, {color: colors.muted}]}>{detail}</Text>
      </View>
      <View style={styles.side}>
        <Text numberOfLines={1} style={[styles.time, {color: colors.text}]}>{time}</Text>
        <StatusBadge label={status === 'failed' ? 'Failed' : status === 'pending' ? 'Pending' : 'Success'} tone={badgeTone} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 70,
    minWidth: 0,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  timeline: {
    alignItems: 'center',
    alignSelf: 'stretch',
    width: 10,
  },
  dot: {
    borderRadius: 5,
    height: 10,
    marginTop: 22,
    width: 10,
  },
  line: {
    flex: 1,
    marginTop: 2,
    width: 1,
  },
  content: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  detail: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  side: {
    alignItems: 'flex-end',
    gap: 7,
    minWidth: 72,
  },
  time: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
