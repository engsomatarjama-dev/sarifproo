import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {CheckCircle2, Clock3, XCircle} from 'lucide-react-native';
import {Transaction} from '../types';
import {useThemeColors} from '../hooks/useThemeColors';
import {formatCurrency, formatDateTime} from '../utils/format';

interface Props {
  transaction: Transaction;
  onPress: () => void;
}

const transactionTitle = (transaction: Transaction) => {
  if (transaction.status === 'failed') {
    return 'Failed Transfer';
  }
  if (transaction.transactionType === 'bank_deposit') {
    return 'Bank Deposit';
  }
  return 'Direct Transfer';
};

const statusColor = (transaction: Transaction, colors: ReturnType<typeof useThemeColors>) => {
  if (transaction.status === 'completed') {
    return colors.success;
  }
  if (transaction.status === 'failed') {
    return colors.accent;
  }
  return colors.warning;
};

export const TransactionCard = ({transaction, onPress}: Props) => {
  const colors = useThemeColors();
  const color = statusColor(transaction, colors);
  const StatusIcon = transaction.status === 'completed' ? CheckCircle2 : transaction.status === 'failed' ? XCircle : Clock3;

  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}>
      <View style={[styles.iconWrap, {backgroundColor: `${color}1A`}]}>
        <StatusIcon color={color} size={22} strokeWidth={2.5} />
      </View>

      <View style={styles.content}>
        <Text numberOfLines={1} style={[styles.title, {color: colors.text}]}>
          {transactionTitle(transaction)}
        </Text>
        <Text numberOfLines={1} style={[styles.date, {color: colors.muted}]}>
          {formatDateTime(transaction.completedAt ?? transaction.timestamp)}
        </Text>
      </View>

      <Text numberOfLines={1} style={[styles.amount, {color: colors.text}]}>
        {formatCurrency(transaction.confirmedAmount ?? transaction.amount)}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  amount: {
    flexShrink: 0,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
    maxWidth: 110,
    textAlign: 'right',
  },
  card: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  content: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  date: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
