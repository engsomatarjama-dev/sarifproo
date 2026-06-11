import React from 'react';
import {StyleSheet, Text, View, ViewStyle} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  rightSlot?: React.ReactNode;
}

export const Card = ({title, children, style, rightSlot}: Props) => {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border}, style]}>
      {(title || rightSlot) && (
        <View style={styles.header}>
          {title ? <Text style={[styles.title, {color: colors.text}]}>{title}</Text> : <View />}
          {rightSlot}
        </View>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
});
