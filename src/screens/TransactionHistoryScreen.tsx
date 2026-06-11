import React, {useCallback, useMemo} from 'react';
import {FlatList, StyleSheet, Text} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {TransactionCard} from '../components/TransactionCard';
import {useAppStore} from '../store/useAppStore';
import {appStartupService} from '../services/AppStartupService';
import {useThemeColors} from '../hooks/useThemeColors';
import {RootStackParamList} from '../navigation/AppNavigator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const isInvalidZeroTransfer = (amount: number, status: string, type?: string) =>
  amount <= 0 && status === 'failed' && (type === 'direct_transfer' || type === 'bank_deposit');

export const TransactionHistoryScreen = () => {
  const colors = useThemeColors();
  const navigation = useNavigation<NavProp>();
  const transactions = useAppStore(state => state.transactions);

  useFocusEffect(
    useCallback(() => {
      void appStartupService.refreshAll();
    }, []),
  );

  const visibleTransactions = useMemo(
    () =>
      transactions.filter(
        item => !isInvalidZeroTransfer(Number(item.amount), item.status, item.transactionType),
      ),
    [transactions],
  );

  return (
    <Screen scroll={false}>
      <FlatList
        contentContainerStyle={styles.list}
        data={visibleTransactions}
        keyExtractor={item => item.reference}
        ListEmptyComponent={<Text style={[styles.empty, {color: colors.muted}]}>No transactions yet.</Text>}
        renderItem={({item}) => (
          <TransactionCard
            transaction={item}
            onPress={() => navigation.navigate('TransactionDetails', {reference: item.reference})}
          />
        )}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  empty: {
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: 10,
    paddingBottom: 32,
  },
});
