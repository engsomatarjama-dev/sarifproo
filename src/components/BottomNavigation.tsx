import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Bot, Clock3, History, LayoutDashboard, Settings} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  onDashboard: () => void;
  onActivity: () => void;
  onAutomation: () => void;
  onHistory: () => void;
  onSettings: () => void;
}

export const BottomNavigation = ({onDashboard, onActivity, onAutomation, onHistory, onSettings}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.nav, {backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.dark ? '#000000' : '#253858'}]}>
      <NavItem active icon={LayoutDashboard} label="Dashboard" onPress={onDashboard} />
      <NavItem icon={Clock3} label="Activity" onPress={onActivity} />
      <Pressable onPress={onAutomation} style={({pressed}) => [styles.centerItem, {opacity: pressed ? 0.76 : 1}]}>
        <View style={styles.centerButton}>
          <Bot color="#FFFFFF" size={24} strokeWidth={2.6} />
        </View>
        <Text numberOfLines={1} style={[styles.centerLabel, {color: colors.primary}]}>Automation</Text>
      </Pressable>
      <NavItem icon={History} label="History" onPress={onHistory} />
      <NavItem icon={Settings} label="Settings" onPress={onSettings} />
    </View>
  );
};

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onPress: () => void;
}

const NavItem = ({icon: Icon, label, active, onPress}: NavItemProps) => {
  const colors = useThemeColors();
  const color = active ? colors.primary : colors.muted;

  return (
    <Pressable onPress={onPress} style={({pressed}) => [styles.item, {opacity: pressed ? 0.72 : 1}]}>
      <Icon color={color} size={21} strokeWidth={active ? 2.8 : 2.3} />
      <Text numberOfLines={1} style={[styles.label, {color}]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  nav: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 74,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.09,
    shadowRadius: 16,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minWidth: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    maxWidth: 68,
  },
  centerItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minWidth: 0,
  },
  centerButton: {
    alignItems: 'center',
    backgroundColor: '#1457E8',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    shadowColor: '#1457E8',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.25,
    shadowRadius: 14,
    width: 50,
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    maxWidth: 74,
  },
});
