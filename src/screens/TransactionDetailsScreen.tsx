import React, {useCallback, useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {Screen} from '../components/Screen';
import {Card} from '../components/Card';
import {Badge} from '../components/Badge';
import {useAppStore} from '../store/useAppStore';
import {RootStackParamList} from '../navigation/AppNavigator';
import {appStartupService} from '../services/AppStartupService';
import {formatCurrency, formatDateTime} from '../utils/format';
import {useThemeColors} from '../hooks/useThemeColors';
import {Transaction} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'TransactionDetails'>;

const transactionTypeLabel = (transaction?: Transaction) => {
  if (transaction?.transactionType === 'bank_deposit') {
    return 'Bank Deposit';
  }
  if (transaction?.transactionType === 'direct_transfer') {
    return 'Direct Transfer';
  }
  if (transaction?.type === 'balance_transfer') {
    return 'Balance Transfer';
  }
  return 'SMS Exchange';
};

const statusTone = (status?: Transaction['status']) => {
  if (status === 'completed') {
    return 'success' as const;
  }
  if (status === 'failed') {
    return 'danger' as const;
  }
  return 'warning' as const;
};

export const TransactionDetailsScreen = ({route}: Props) => {
  const colors = useThemeColors();
  const transactions = useAppStore(state => state.transactions);

  useFocusEffect(
    useCallback(() => {
      void appStartupService.refreshAll();
    }, []),
  );

  const transaction = useMemo(
    () => transactions.find(item => item.reference === route.params.reference),
    [route.params.reference, transactions],
  );

  if (!transaction) {
    return (
      <Screen>
        <Card>
          <Text style={[styles.empty, {color: colors.muted}]}>Transaction not found.</Text>
        </Card>
      </Screen>
    );
  }

  const receiverPhone = transaction.receiverPhone ?? transaction.phone;
  const amount = transaction.confirmedAmount ?? transaction.amount;

  return (
    <Screen>
      <Card
        title="Transaction Details"
        rightSlot={<Badge label={transaction.status} tone={statusTone(transaction.status)} />}>
        <DetailRow label="Reference" value={transaction.confirmationReference ?? transaction.reference} />
        <DetailRow label="Status" value={transaction.status} />
        <DetailRow label="Amount" value={formatCurrency(amount)} />
        <DetailRow label="Transaction Type" value={transactionTypeLabel(transaction)} />
        <DetailRow label="Date" value={formatDateTime(transaction.completedAt ?? transaction.timestamp)} />
        {transaction.status === 'failed' && transaction.failureReason ? (
          <DetailRow label="Failure Reason" value={transaction.failureReason} />
        ) : null}
        {receiverPhone ? <DetailRow label="Receiver Phone" value={receiverPhone} /> : null}
        {transaction.bankAccount ? <DetailRow label="Bank Account" value={transaction.bankAccount} /> : null}
      </Card>
    </Screen>
  );
};

const DetailRow = ({label, value}: {label: string; value: string}) => {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, {color: colors.muted}]}>{label}</Text>
      <Text selectable style={[styles.value, {color: colors.text}]}>
        {value}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    fontSize: 14,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  row: {
    gap: 6,
  },
  value: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
