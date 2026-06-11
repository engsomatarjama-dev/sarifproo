import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Activity, Bot, CheckCircle2, Power, WifiOff} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';
import {StatusBadge, StatusBadgeTone} from './StatusBadge';

interface Props {
  statusLabel: string;
  statusTone: StatusBadgeTone;
  description: string;
  enabled: boolean;
  blocked?: boolean;
  accessibilityEnabled: boolean;
  serviceRunning: boolean;
  compact?: boolean;
  onToggle: () => void;
}

export const AutomationStatusCard = ({
  statusLabel,
  statusTone,
  description,
  enabled,
  blocked,
  accessibilityEnabled,
  serviceRunning,
  compact,
  onToggle,
}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, compact && styles.cardCompact, {shadowColor: colors.dark ? '#000' : colors.primary}]}>
      <View style={styles.contentRow}>
        <View style={styles.iconShell}>
          <Bot color="#FFFFFF" size={compact ? 28 : 34} strokeWidth={2.4} />
        </View>

        <View style={styles.textColumn}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.title}>Automation Status</Text>
            <StatusBadge label={statusLabel} tone={statusTone} style={styles.heroBadge} />
          </View>
          <Text numberOfLines={2} style={styles.description}>{description}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <CheckCircle2 color="#FFFFFF" size={15} strokeWidth={2.4} />
              <Text numberOfLines={1} style={styles.metaText}>
                Accessibility: {accessibilityEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              {serviceRunning ? (
                <Activity color="#FFFFFF" size={15} strokeWidth={2.4} />
              ) : (
                <WifiOff color="#FFFFFF" size={15} strokeWidth={2.4} />
              )}
              <Text numberOfLines={1} style={styles.metaText}>
                Service: {serviceRunning ? 'Connected' : 'Stopped'}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{checked: enabled, disabled: blocked}}
          disabled={blocked}
          onPress={onToggle}
          style={({pressed}) => [
            styles.switch,
            {
              backgroundColor: enabled ? '#24B967' : 'rgba(255,255,255,0.26)',
              opacity: pressed ? 0.78 : blocked ? 0.5 : 1,
            },
          ]}>
          <View style={[styles.knob, enabled ? styles.knobOn : styles.knobOff]}>
            <Power color={enabled ? '#24B967' : '#7A869A'} size={16} strokeWidth={2.6} />
          </View>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1457E8',
    borderRadius: 16,
    elevation: 7,
    minHeight: 170,
    padding: 18,
    shadowOffset: {width: 0, height: 14},
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
  cardCompact: {
    minHeight: 160,
    padding: 15,
  },
  contentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minWidth: 0,
  },
  iconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(142,248,208,0.88)',
    borderRadius: 44,
    borderWidth: 4,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  textColumn: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  title: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    minWidth: 150,
  },
  heroBadge: {
    backgroundColor: '#24B967',
  },
  description: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    opacity: 0.94,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minWidth: 0,
  },
  metaText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  switch: {
    borderRadius: 999,
    height: 52,
    justifyContent: 'center',
    padding: 4,
    width: 88,
  },
  knob: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
  knobOff: {
    alignSelf: 'flex-start',
  },
});
