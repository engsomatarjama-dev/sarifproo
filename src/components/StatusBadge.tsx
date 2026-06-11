import React from 'react';
import {StyleSheet, Text, View, ViewStyle} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

export type StatusBadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface Props {
  label: string;
  tone?: StatusBadgeTone;
  style?: ViewStyle;
}

export const StatusBadge = ({label, tone = 'neutral', style}: Props) => {
  const colors = useThemeColors();
  const toneMap = {
    success: {background: 'rgba(18,128,92,0.14)', color: colors.success},
    warning: {background: 'rgba(168,97,0,0.16)', color: colors.warning},
    danger: {background: 'rgba(203,26,64,0.14)', color: colors.accent},
    info: {background: 'rgba(4,72,119,0.12)', color: colors.primary},
    neutral: {background: colors.dark ? '#263241' : '#EEF2F6', color: colors.muted},
  };
  const selected = toneMap[tone];

  return (
    <View style={[styles.badge, {backgroundColor: selected.background}, style]}>
      <Text numberOfLines={1} style={[styles.text, {color: selected.color}]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
