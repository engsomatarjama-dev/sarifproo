import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

export const Badge = ({label, tone = 'neutral'}: Props) => {
  const colors = useThemeColors();
  const backgroundMap = {
    neutral: colors.border,
    success: '#D1FADF',
    warning: '#FEEFCB',
    danger: '#FEE4E2',
    info: '#DCEBFF',
  };

  const textMap = {
    neutral: colors.text,
    success: '#05603A',
    warning: '#7A4D00',
    danger: '#B42318',
    info: '#175CD3',
  };

  return (
    <View style={[styles.badge, {backgroundColor: backgroundMap[tone]}]}>
      <Text style={[styles.text, {color: textMap[tone]}]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
