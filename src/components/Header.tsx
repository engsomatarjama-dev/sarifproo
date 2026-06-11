import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  username: string;
  subscriptionLabel: string;
  subscriptionDetail: string;
  subscriptionTone: 'success' | 'warning' | 'danger';
}

export const Header = ({username, subscriptionLabel, subscriptionDetail, subscriptionTone}: Props) => {
  const colors = useThemeColors();
  const toneMap = {
    success: {background: 'rgba(18,128,92,0.14)', color: colors.success},
    warning: {background: 'rgba(168,97,0,0.16)', color: colors.warning},
    danger: {background: 'rgba(203,26,64,0.14)', color: colors.accent},
  };
  const tone = toneMap[subscriptionTone];

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text numberOfLines={1} style={[styles.brand, {color: colors.text}]}>
            SarifPro
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.greeting, {color: colors.text}]}>
          Good morning, {username}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, {color: colors.muted}]}>
          Here's your automation overview
        </Text>
      </View>

      <View style={styles.right}>
        <View style={[styles.subscriptionBadge, {backgroundColor: tone.background}]}>
          <Text numberOfLines={1} style={[styles.subscriptionLabel, {color: tone.color}]}>
            {subscriptionLabel}
          </Text>
          <Text numberOfLines={1} style={[styles.subscriptionDetail, {color: tone.color}]}>
            {subscriptionDetail}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  left: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  logoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#1457E8',
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 0,
  },
  brand: {
    flexShrink: 1,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  right: {
    alignItems: 'flex-end',
    gap: 10,
    maxWidth: 130,
  },
  subscriptionBadge: {
    alignItems: 'flex-start',
    borderRadius: 14,
    minWidth: 108,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  subscriptionLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subscriptionDetail: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2,
  },
});
