import React from 'react';
import {StyleSheet, Text, TextInput, TextInputProps, View} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props extends TextInputProps {
  label: string;
  helper?: string;
}

export const AppTextInput = ({label, helper, ...rest}: Props) => {
  const colors = useThemeColors();
  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, {color: colors.text}]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
        {...rest}
      />
      {helper ? <Text style={[styles.helper, {color: colors.muted}]}>{helper}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  helper: {
    fontSize: 12,
  },
});
