import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Bot, CalendarDays, CheckCircle2, Clock3, Power, ShieldCheck, Wallet} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';
import {StatusBadge} from './StatusBadge';

export interface AutomationMetric {
  label: string;
  value: string;
  helper: string;
  icon: 'clock' | 'wallet' | 'calendar' | 'shield';
}

interface Props {
  title: string;
  badge: string;
  description: string;
  accessibility: string;
  service: string;
  subscription: string;
  running: boolean;
  blocked: boolean;
  metrics: AutomationMetric[];
  onPowerPress: () => void;
}

const metricIcons = {
  clock: Clock3,
  wallet: Wallet,
  calendar: CalendarDays,
  shield: ShieldCheck,
};

export const AutomationCard = ({
  title,
  badge,
  description,
  accessibility,
  service,
  subscription,
  running,
  blocked,
  metrics,
  onPowerPress,
}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, {shadowColor: colors.dark ? '#000000' : colors.primary}]}>
      <View style={styles.topRow}>
        <View style={styles.robotWrap}>
          <Bot color="#FFFFFF" size={33} strokeWidth={2.6} />
        </View>
        <View style={styles.titleArea}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.title}>
            {title}
          </Text>
          <StatusBadge label={badge} tone={running ? 'success' : blocked ? 'danger' : 'warning'} style={styles.liveBadge} />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={blocked}
          onPress={onPowerPress}
          style={({pressed}) => [styles.powerButton, {opacity: pressed ? 0.76 : blocked ? 0.5 : 1}]}>
          <Power color={running ? '#E51B3E' : '#24B967'} size={28} strokeWidth={2.8} />
        </Pressable>
      </View>

      <View style={styles.middleRow}>
        <Text numberOfLines={1} style={styles.description}>
          {description}
        </Text>
        <StatusLine label={accessibility} />
        <StatusLine label={service} />
        <StatusLine label={subscription} />
      </View>

      <View style={styles.metricGrid}>
        {metrics.slice(0, 4).map(metric => {
          const Icon = metricIcons[metric.icon];
          return (
            <View key={metric.label} style={styles.metric}>
              <View style={styles.metricHeader}>
                <Icon color="#FFFFFF" size={15} strokeWidth={2.5} />
                <Text numberOfLines={1} style={styles.metricLabel}>
                  {metric.label}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.metricValue}>
                {metric.value}
              </Text>
              <Text numberOfLines={1} style={styles.metricHelper}>
                {metric.helper}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const StatusLine = ({label}: {label: string}) => (
  <View style={styles.statusLine}>
    <CheckCircle2 color="#74E39A" size={14} strokeWidth={2.7} />
    <Text numberOfLines={1} style={styles.statusText}>
      {label}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0746B8',
    borderRadius: 22,
    elevation: 8,
    gap: 8,
    padding: 12,
    shadowOffset: {width: 0, height: 16},
    shadowOpacity: 0.22,
    shadowRadius: 26,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  robotWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: '#40A8FF',
    borderRadius: 35,
    borderWidth: 3,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  titleArea: {
    alignItems: 'center',
    flex: 1,
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
    minWidth: 0,
  },
  liveBadge: {
    backgroundColor: '#22B967',
  },
  powerButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(82,153,255,0.45)',
    borderRadius: 31,
    borderWidth: 5,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  middleRow: {
    gap: 4,
    minWidth: 0,
  },
  description: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  statusLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  statusText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  metricGrid: {
    backgroundColor: 'rgba(0,35,120,0.35)',
    borderRadius: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    padding: 7,
  },
  metric: {
    flexGrow: 1,
    minWidth: '47%',
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  metricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  metricLabel: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 3,
  },
  metricHelper: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 1,
  },
});
