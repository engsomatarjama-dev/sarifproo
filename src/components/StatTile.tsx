import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  label: string;
  value: string;
  helper?: string;
}

export const StatTile = ({label, value, helper}: Props) => {
  const colors = useThemeColors();
  return (
    <View style={[styles.tile, {backgroundColor: colors.card, borderColor: colors.border}]}>
      <Text style={[styles.label, {color: colors.muted}]}>{label}</Text>
      <Text style={[styles.value, {color: colors.text}]}>{value}</Text>
      {helper ? <Text style={[styles.helper, {color: colors.muted}]}>{helper}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 110,
    padding: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
  },
  helper: {
    fontSize: 12,
  },
});
