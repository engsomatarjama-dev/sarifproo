import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  color: string;
  width: number;
  onPress: () => void;
}

export const QuickActionCard = ({icon: Icon, title, subtitle, color, width, onPress}: Props) => {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.card,
        {
          width,
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      <View style={[styles.iconBox, {backgroundColor: color, shadowColor: color}]}>
        <Icon color="#FFFFFF" size={24} strokeWidth={2.6} />
      </View>
      <Text numberOfLines={1} style={[styles.title, {color: colors.text}]}>{title}</Text>
      <Text numberOfLines={1} style={[styles.subtitle, {color: colors.muted}]}>{subtitle}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 116,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  iconBox: {
    alignItems: 'center',
    borderRadius: 13,
    elevation: 3,
    height: 50,
    justifyContent: 'center',
    marginBottom: 10,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.18,
    shadowRadius: 12,
    width: 50,
  },
  title: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    maxWidth: '100%',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 3,
    maxWidth: '100%',
  },
});
