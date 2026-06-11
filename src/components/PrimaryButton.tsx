import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'neutral' | 'danger';
}

export const PrimaryButton = ({label, onPress, disabled, loading, tone = 'primary'}: Props) => {
  const colors = useThemeColors();
  const backgroundMap = {
    primary: colors.primary,
    neutral: colors.card,
    danger: colors.danger,
  };
  const textMap = {
    primary: '#FFFFFF',
    neutral: colors.text,
    danger: '#FFFFFF',
  };

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        {
          backgroundColor: backgroundMap[tone],
          borderColor: tone === 'neutral' ? colors.border : backgroundMap[tone],
          opacity: pressed || disabled ? 0.8 : 1,
        },
      ]}>
      {loading ? <ActivityIndicator color={textMap[tone]} /> : <Text style={[styles.text, {color: textMap[tone]}]}>{label}</Text>}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
  },
});
