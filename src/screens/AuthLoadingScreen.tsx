import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

export const AuthLoadingScreen = () => {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <Text style={[styles.title, {color: colors.text}]}>SarifPro</Text>
      <Text style={[styles.subtitle, {color: colors.muted}]}>Checking your secure session</Text>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
  },
});
