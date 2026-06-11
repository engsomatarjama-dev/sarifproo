import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  helper?: string;
  color: string;
  width: number;
}

export const SummaryCard = ({icon: Icon, label, value, helper, color, width}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, {width, backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.dark ? '#000' : '#253858'}]}>
      <View style={[styles.iconWrap, {backgroundColor: `${color}20`}]}>
        <Icon color={color} size={21} strokeWidth={2.6} />
      </View>
      <Text numberOfLines={1} style={[styles.label, {color: colors.muted}]}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.value, {color: colors.text}]}>{value}</Text>
      {helper ? <Text numberOfLines={1} style={[styles.helper, {color}]}>{helper}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    elevation: 3,
    minHeight: 128,
    padding: 12,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    marginBottom: 10,
    width: 40,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 6,
  },
  value: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0,
    minWidth: 0,
  },
  helper: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 8,
  },
});
