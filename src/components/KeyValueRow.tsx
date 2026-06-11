import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  label: string;
  value: string;
}

export const KeyValueRow = ({label, value}: Props) => {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, {color: colors.muted}]}>{label}</Text>
      <Text style={[styles.value, {color: colors.text}]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  label: {
    fontSize: 14,
  },
  value: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
});
