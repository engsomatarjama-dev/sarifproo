import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ChevronRight, Clock3, Send, WalletCards} from 'lucide-react-native';
import {Transaction} from '../types';
import {useThemeColors} from '../hooks/useThemeColors';
import {formatCurrency, formatShortTime} from '../utils/format';
import {StatusBadge} from './StatusBadge';

interface Props {
  transaction?: Transaction;
  maskedAccount?: string;
  compact?: boolean;
  onViewHistory: () => void;
}

const transactionLabel = (transaction?: Transaction) => {
  if (!transaction) {
    return 'No transaction';
  }
  return transaction.transactionType === 'bank_deposit' ? 'Bank Deposit' : 'Direct Transfer';
};

const statusTone = (status?: string) => {
  if (status === 'completed') {
    return {tone: 'success' as const, label: 'Completed'};
  }
  if (status === 'failed') {
    return {tone: 'danger' as const, label: 'Failed'};
  }
  if (status === 'unknown_result') {
    return {tone: 'warning' as const, label: 'Unknown'};
  }
  return {tone: 'info' as const, label: status ? status : 'Pending'};
};

export const LatestTransactionCard = ({transaction, maskedAccount, compact, onViewHistory}: Props) => {
  const colors = useThemeColors();
  const status = statusTone(transaction?.status);
  const Icon = transaction?.transactionType === 'bank_deposit' ? WalletCards : Send;

  return (
    <View style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.dark ? '#000' : '#253858'}]}>
      <View style={styles.header}>
        <View style={styles.titleCluster}>
          <View style={[styles.headerIcon, {backgroundColor: colors.dark ? '#273348' : '#E8EEFF'}]}>
            <Icon color={colors.primary} size={20} strokeWidth={2.4} />
          </View>
          <Text numberOfLines={1} style={[styles.title, {color: colors.text}]}>Latest Transaction</Text>
        </View>
        <Pressable onPress={onViewHistory} style={styles.viewButton}>
          <Text numberOfLines={1} style={[styles.viewText, {color: colors.accent}]}>View History</Text>
          <ChevronRight color={colors.accent} size={17} strokeWidth={3} />
        </Pressable>
      </View>

      {transaction ? (
        <View style={[styles.body, compact && styles.bodyCompact]}>
          <View style={styles.badgeRow}>
            <StatusBadge label={transactionLabel(transaction)} tone="info" />
            <StatusBadge label={status.label} tone={status.tone} />
          </View>

          <View style={styles.detailRow}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, {color: colors.text}]}>
              {formatCurrency(transaction.amount || 0)}
            </Text>
            <View style={styles.timeRow}>
              <Clock3 color={colors.muted} size={14} strokeWidth={2.3} />
              <Text numberOfLines={1} style={[styles.timeText, {color: colors.muted}]}>
                {formatShortTime(transaction.completedAt ?? transaction.timestamp)}
              </Text>
            </View>
          </View>

          {maskedAccount ? (
            <Text numberOfLines={1} style={[styles.masked, {color: colors.muted}]}>
              {maskedAccount}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.empty, {color: colors.muted}]}>No transaction yet</Text>
      )}
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
  headerIcon: {
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
  viewButton: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 2,
  },
  viewText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  body: {
    gap: 12,
  },
  bodyCompact: {
    gap: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  amount: {
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
    minWidth: 0,
  },
  timeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 5,
    justifyContent: 'flex-end',
    minWidth: 104,
  },
  timeText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  masked: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  empty: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
