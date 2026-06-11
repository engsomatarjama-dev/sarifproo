import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Clock3, Wallet} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';
import {formatCurrency} from '../utils/format';
import {StatusBadge} from './StatusBadge';

interface Props {
  enabled: boolean;
  lastCheck?: string;
  nextCheck?: string;
  lastBalance?: number;
  compact?: boolean;
}

export const BalanceCheckerCard = ({enabled, lastCheck, nextCheck, lastBalance, compact}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.dark ? '#000' : '#253858'}]}>
      <View style={styles.header}>
        <View style={styles.titleCluster}>
          <View style={[styles.iconBox, {backgroundColor: colors.dark ? '#273348' : '#E8EEFF'}]}>
            <Wallet color={colors.primary} size={20} strokeWidth={2.5} />
          </View>
          <Text numberOfLines={1} style={[styles.title, {color: colors.text}]}>Balance Checker</Text>
        </View>
        <StatusBadge label={enabled ? 'Enabled' : 'Disabled'} tone={enabled ? 'success' : 'neutral'} />
      </View>

      <View style={[styles.metricsRow, compact && styles.metricsRowCompact]}>
        <Metric label="Last Check" value={lastCheck ?? '-'} icon={<Clock3 color={colors.muted} size={13} strokeWidth={2.4} />} />
        <Metric label="Last Balance" value={lastBalance !== undefined ? formatCurrency(lastBalance) : '-'} highlight />
        <Metric label="Next Check" value={nextCheck ?? '-'} icon={<Clock3 color={colors.muted} size={13} strokeWidth={2.4} />} />
      </View>
    </View>
  );
};

interface MetricProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}

const Metric = ({label, value, icon, highlight}: MetricProps) => {
  const colors = useThemeColors();
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={[styles.metricLabel, {color: colors.muted}]}>{label}</Text>
      <View style={styles.metricValueRow}>
        {icon}
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[styles.metricValue, {color: highlight ? colors.success : colors.text}]}>
          {value}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    elevation: 3,
    gap: 16,
    padding: 16,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  titleCluster: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  iconBox: {
    alignItems: 'center',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricsRowCompact: {
    gap: 6,
  },
  metric: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 7,
  },
  metricValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minWidth: 0,
  },
  metricValue: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    minWidth: 0,
  },
});
