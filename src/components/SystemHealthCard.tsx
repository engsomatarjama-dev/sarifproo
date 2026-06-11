import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {CheckCircle2} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';

export interface HealthItem {
  label: string;
  value: string;
  ok: boolean;
}

interface Props {
  items: HealthItem[];
}

export const SystemHealthCard = ({items}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.dark ? '#000000' : '#253858'}]}>
      <Text numberOfLines={1} style={[styles.title, {color: colors.text}]}>System Health</Text>
      <View style={styles.grid}>
        {items.map(item => (
          <View key={item.label} style={styles.item}>
            <CheckCircle2 color={item.ok ? colors.success : colors.warning} size={22} strokeWidth={2.5} />
            <Text numberOfLines={1} style={[styles.label, {color: colors.text}]}>{item.label}</Text>
            <Text numberOfLines={1} style={[styles.value, {color: colors.muted}]}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    elevation: 3,
    gap: 18,
    padding: 16,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
    minWidth: 92,
  },
  label: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
});
