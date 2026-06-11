import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Bot, CalendarDays, CheckCircle2, Clock3, Power, ShieldCheck, Wallet} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';
import {StatusBadge, StatusBadgeTone} from './StatusBadge';

interface HeroMetric {
  label: string;
  value: string;
  helper: string;
  icon: 'clock' | 'wallet' | 'calendar' | 'shield';
}

interface Props {
  statusTitle: string;
  statusBadge: string;
  statusTone: StatusBadgeTone;
  description: string;
  enabled: boolean;
  blocked?: boolean;
  accessibilityLabel: string;
  serviceLabel: string;
  subscriptionLabel: string;
  metrics: HeroMetric[];
  compact?: boolean;
  onToggle: () => void;
}

const metricIcon = {
  clock: Clock3,
  wallet: Wallet,
  calendar: CalendarDays,
  shield: ShieldCheck,
};

export const HeroAutomationCard = ({
  statusTitle,
  statusBadge,
  statusTone,
  description,
  enabled,
  blocked,
  accessibilityLabel,
  serviceLabel,
  subscriptionLabel,
  metrics,
  compact,
  onToggle,
}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, compact && styles.cardCompact, {shadowColor: colors.dark ? '#000000' : colors.primary}]}>
      <View style={[styles.mainRow, compact && styles.mainRowCompact]}>
        <View style={styles.botWrap}>
          <View style={[styles.botCircle, compact && styles.botCircleCompact]}>
            <Bot color="#FFFFFF" size={compact ? 30 : 38} strokeWidth={2.5} />
          </View>
        </View>

        <View style={styles.heroText}>
          <View style={styles.titleRow}>
            <Text numberOfLines={2} style={styles.heroTitle}>{statusTitle}</Text>
            <StatusBadge label={statusBadge} tone={statusTone} style={styles.liveBadge} />
          </View>
          <Text numberOfLines={2} style={styles.description}>{description}</Text>

          <View style={styles.systemList}>
            <StatusLine label={accessibilityLabel} />
            <StatusLine label={serviceLabel} />
            <StatusLine label={subscriptionLabel} />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={blocked}
          onPress={onToggle}
          style={({pressed}) => [styles.stopButton, compact && styles.stopButtonCompact, {opacity: pressed ? 0.76 : blocked ? 0.5 : 1}]}>
          <View style={[styles.stopInner, compact && styles.stopInnerCompact]}>
            <Power color={enabled ? '#E51B3E' : '#24B967'} size={compact ? 24 : 30} strokeWidth={2.8} />
          </View>
          <Text numberOfLines={1} style={[styles.stopText, compact && styles.stopTextCompact]}>{enabled ? 'STOP' : 'START'}</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        {metrics.map(metric => {
          const Icon = metricIcon[metric.icon];
          return (
            <View key={metric.label} style={styles.metric}>
              <View style={styles.metricHeader}>
                <Icon color="#FFFFFF" size={17} strokeWidth={2.4} />
                <Text numberOfLines={1} style={styles.metricLabel}>{metric.label}</Text>
              </View>
              <Text numberOfLines={1} style={styles.metricValue}>{metric.value}</Text>
              <Text numberOfLines={1} style={styles.metricHelper}>{metric.helper}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const StatusLine = ({label}: {label: string}) => (
  <View style={styles.statusLine}>
    <CheckCircle2 color="#74E39A" size={16} strokeWidth={2.7} />
    <Text numberOfLines={1} style={styles.statusLineText}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0746B8',
    borderRadius: 22,
    elevation: 8,
    gap: 18,
    padding: 18,
    shadowOffset: {width: 0, height: 16},
    shadowOpacity: 0.22,
    shadowRadius: 26,
  },
  cardCompact: {
    padding: 15,
  },
  mainRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minWidth: 0,
  },
  mainRowCompact: {
    gap: 10,
  },
  botWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  botCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: '#40A8FF',
    borderRadius: 46,
    borderWidth: 4,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  botCircleCompact: {
    borderRadius: 36,
    borderWidth: 3,
    height: 72,
    width: 72,
  },
  heroText: {
    flex: 1,
    gap: 9,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  heroTitle: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 26,
    minWidth: 0,
  },
  liveBadge: {
    backgroundColor: '#22B967',
  },
  description: {
    color: 'rgba(255,255,255,0.92)',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
  },
  systemList: {
    gap: 7,
  },
  statusLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  statusLineText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  stopButton: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    minWidth: 68,
  },
  stopButtonCompact: {
    minWidth: 58,
  },
  stopInner: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(82,153,255,0.45)',
    borderRadius: 43,
    borderWidth: 8,
    height: 86,
    justifyContent: 'center',
    width: 86,
  },
  stopInnerCompact: {
    borderRadius: 32,
    borderWidth: 6,
    height: 64,
    width: 64,
  },
  stopText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  stopTextCompact: {
    fontSize: 14,
  },
  footer: {
    backgroundColor: 'rgba(0,35,120,0.35)',
    borderRadius: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
    padding: 10,
  },
  metric: {
    flex: 1,
    minWidth: 116,
    padding: 8,
  },
  metricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  metricLabel: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 7,
  },
  metricHelper: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 4,
  },
});
