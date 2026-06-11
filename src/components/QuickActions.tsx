import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {CreditCard, History, Settings} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface QuickAction {
  label: 'History' | 'Subscription' | 'Settings';
  icon: LucideIcon;
  color: string;
  onPress: () => void;
}

interface Props {
  cardWidth: number;
  onHistory: () => void;
  onSubscription: () => void;
  onSettings: () => void;
}

export const QuickActions = ({cardWidth, onHistory, onSubscription, onSettings}: Props) => {
  const colors = useThemeColors();
  const actions: QuickAction[] = [
    {label: 'History', icon: History, color: colors.primary, onPress: onHistory},
    {label: 'Subscription', icon: CreditCard, color: '#20B56B', onPress: onSubscription},
    {label: 'Settings', icon: Settings, color: '#6B7280', onPress: onSettings},
  ];

  return (
    <View style={styles.section}>
      <View style={styles.grid}>
        {actions.map(action => {
          const Icon = action.icon;
          return (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={({pressed}) => [
                styles.card,
                {
                  width: cardWidth,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}>
              <View style={[styles.iconWrap, {backgroundColor: action.color}]}>
                <Icon color="#FFFFFF" size={20} strokeWidth={2.6} />
              </View>
              <Text numberOfLines={1} style={[styles.label, {color: colors.text}]}>
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 69,
    padding: 7,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 13,
    height: 34,
    justifyContent: 'center',
    marginBottom: 6,
    width: 34,
  },
  label: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
