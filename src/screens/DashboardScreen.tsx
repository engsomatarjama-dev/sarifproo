import React, {useCallback, useMemo} from 'react';
import {Alert, StyleSheet, useWindowDimensions} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import {Screen} from '../components/Screen';
import {Header} from '../components/Header';
import {AutomationCard, AutomationMetric} from '../components/AutomationCard';
import {SummaryCards} from '../components/SummaryCards';
import {RecentActivity, RecentActivityItem} from '../components/RecentActivity';
import {SystemHealth} from '../components/SystemHealth';
import {QuickActions} from '../components/QuickActions';
import {BottomNavigation} from '../components/BottomNavigation';
import {useAppStore} from '../store/useAppStore';
import {appStartupService} from '../services/AppStartupService';
import {dashboardService} from '../services/DashboardService';
import {settingsService} from '../services/SettingsService';
import {formatCurrency, formatSubscriptionVerificationState, maskAccount} from '../utils/format';
import {RootStackParamList} from '../navigation/AppNavigator';
import {Transaction} from '../types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const ACTIVE_SUBSCRIPTION = ['active', 'trial'];
const SCREEN_HORIZONTAL_PADDING = 36;
const CARD_GAP = 10;

const titleCase = (value: string) =>
  value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const subscriptionBadge = (
  verificationStatus: 'online' | 'offline_grace' | 'verification_required',
  subscriptionStatus: string,
) => {
  if (verificationStatus === 'offline_grace' && ACTIVE_SUBSCRIPTION.includes(subscriptionStatus)) {
    return 'Offline Grace';
  }
  return titleCase(subscriptionStatus);
};

const dashboardTime = (timestamp?: number | string) => {
  if (!timestamp) {
    return '-';
  }
  const value = dayjs(timestamp);
  if (!value.isValid()) {
    return '-';
  }
  if (value.isSame(dayjs(), 'day')) {
    return `Today, ${value.format('h:mm A')}`;
  }
  if (value.isSame(dayjs().subtract(1, 'day'), 'day')) {
    return `Yesterday, ${value.format('h:mm A')}`;
  }
  return value.format('MMM D, h:mm A');
};

const shortTime = (timestamp?: number | string) => {
  const formatted = dashboardTime(timestamp);
  return formatted.replace('Today, ', '').replace('Yesterday, ', '');
};

const minutesUntil = (timestamp?: number) => {
  if (!timestamp) {
    return '-';
  }
  const minutes = Math.max(0, dayjs(timestamp).diff(dayjs(), 'minute'));
  if (minutes < 1) {
    return 'Due now';
  }
  return `In ${minutes} min`;
};

const transferTitle = (transaction: Transaction) =>
  transaction.transactionType === 'bank_deposit' ? 'Bank Deposit Completed' : 'Direct Transfer Completed';

const transferIcon = (transaction: Transaction): RecentActivityItem['icon'] =>
  transaction.transactionType === 'bank_deposit' ? 'bank' : 'direct';

const isMoneyMovementSuccess = (transaction: Transaction) =>
  transaction.status === 'completed' &&
  (transaction.transactionType === 'direct_transfer' || transaction.transactionType === 'bank_deposit');

const completedToday = (transaction: Transaction) =>
  dayjs(transaction.completedAt ?? transaction.timestamp).isSame(dayjs(), 'day');

export const DashboardScreen = () => {
  const navigation = useNavigation<NavProp>();
  const {width} = useWindowDimensions();
  const contentWidth = Math.max(320, width - SCREEN_HORIZONTAL_PADDING);
  const summaryCardWidth = Math.max(116, Math.floor((contentWidth - CARD_GAP * 2) / 3));
  const quickCardWidth = Math.floor((contentWidth - CARD_GAP * 2) / 3);

  const dashboard = useAppStore(state => state.dashboard);
  const settings = useAppStore(state => state.settings);
  const transactions = useAppStore(state => state.transactions);
  const authEmail = useAppStore(state => state.auth.userEmail);
  const accessibilityEnabled = useAppStore(state => state.accessibilityEnabled);
  const backgroundRunning = useAppStore(state => state.backgroundRunning);
  const setSettings = useAppStore(state => state.setSettings);

  const subscriptionActive = ACTIVE_SUBSCRIPTION.includes(dashboard.subscriptionStatus);
  const blocked = !subscriptionActive;
  const automationRunning = dashboard.automationEnabled && backgroundRunning && !blocked;
  const verificationLabel = formatSubscriptionVerificationState(
    dashboard.subscriptionVerificationStatus,
    dashboard.subscriptionStatus,
    dashboard.offlineGraceRemainingMs,
  );
  const subscriptionLabel = subscriptionBadge(dashboard.subscriptionVerificationStatus, dashboard.subscriptionStatus);
  const balanceCheckerMode = dashboard.balanceCheckIntervalMinutes === 0 ? 'Continuous' : `Every ${dashboard.balanceCheckIntervalMinutes} min`;
  const ussdMode = dashboard.ussdAutomationSpeed === 'SAFE' ? 'Safe' : 'Fast';
  const subscriptionDetail = useMemo(() => {
    if (dashboard.subscriptionVerificationStatus === 'offline_grace' && dashboard.offlineGraceRemainingMs) {
      const hours = Math.max(1, Math.ceil(dashboard.offlineGraceRemainingMs / (60 * 60 * 1000)));
      return `${hours} ${hours === 1 ? 'Hour' : 'Hours'} Left`;
    }
    if (subscriptionActive) {
      if (dashboard.daysRemaining > 0) {
        return `${dashboard.daysRemaining} ${dashboard.daysRemaining === 1 ? 'Day' : 'Days'} Left`;
      }
      return 'Ends Today';
    }
    if (dashboard.subscriptionStatus === 'expired') {
      return 'Renew Required';
    }
    return 'Verification Required';
  }, [
    dashboard.daysRemaining,
    dashboard.offlineGraceRemainingMs,
    dashboard.subscriptionStatus,
    dashboard.subscriptionVerificationStatus,
    subscriptionActive,
  ]);

  const username = useMemo(() => {
    const localPart = authEmail?.split('@')[0] ?? 'Admin';
    const formatted = localPart
      .split(/[._-]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return formatted || 'Admin';
  }, [authEmail]);

  const todayStats = useMemo(() => {
    const today = transactions.filter(transaction => dayjs(transaction.timestamp).isSame(dayjs(), 'day'));
    return {
      successful: today.filter(transaction => transaction.status === 'completed').length,
      failed: today.filter(transaction => transaction.status === 'failed' || transaction.status === 'unknown_result').length,
    };
  }, [transactions]);

  const processedAmountToday = useMemo(
    () =>
      transactions
        .filter(transaction => isMoneyMovementSuccess(transaction) && completedToday(transaction))
        .reduce((total, transaction) => total + (Number.isFinite(transaction.amount) ? transaction.amount : 0), 0),
    [transactions],
  );

  const recentActivity = useMemo<RecentActivityItem[]>(() => {
    const completed = transactions
      .filter(transaction => transaction.status === 'completed')
      .map(transaction => ({
        id: `tx-${transaction.id ?? transaction.reference}`,
        title: transferTitle(transaction),
        subtitle: `${formatCurrency(transaction.amount || 0)} - ${maskAccount(transaction.phone || settings.accountNumber) || 'masked account'}`,
        timestamp: dashboardTime(transaction.completedAt ?? transaction.timestamp),
        status: 'Success' as const,
        icon: transferIcon(transaction),
        sortTime: Number(transaction.completedAt ?? transaction.timestamp),
      }));

    const failedGroups = new Map<string, Transaction[]>();
    transactions
      .filter(transaction => transaction.status === 'failed' || transaction.status === 'unknown_result')
      .forEach(transaction => {
        const key = transaction.transactionType === 'bank_deposit' ? 'bank' : 'direct';
        failedGroups.set(key, [...(failedGroups.get(key) ?? []), transaction]);
      });

    const failures = Array.from(failedGroups.entries()).map(([key, group]) => {
      const sorted = [...group].sort((a, b) => Number(b.completedAt ?? b.timestamp) - Number(a.completedAt ?? a.timestamp));
      const latest = sorted[0];
      const count = sorted.length;
      return {
        id: `failed-${key}-${latest.id ?? latest.reference}`,
        title: count > 1 ? `${count} Direct Transfer Failures` : 'Direct Transfer Failed',
        subtitle: count > 1 ? `Last Failure: ${shortTime(latest.completedAt ?? latest.timestamp)}` : `${formatCurrency(latest.amount || 0)} - ${maskAccount(latest.phone || settings.accountNumber) || 'masked account'}`,
        timestamp: dashboardTime(latest.completedAt ?? latest.timestamp),
        status: 'Failed' as const,
        icon: 'direct' as const,
        sortTime: Number(latest.completedAt ?? latest.timestamp),
      };
    });

    const balance = dashboard.lastBalanceCheck
      ? [{
          id: `balance-${dashboard.lastBalanceCheck.id ?? dashboard.lastBalanceCheck.timestamp}`,
          title: 'Balance Check Completed',
          subtitle: `Balance: ${formatCurrency(dashboard.lastBalanceCheck.balance)}`,
          timestamp: dashboardTime(dashboard.lastBalanceCheck.timestamp),
          status: 'Success' as const,
          icon: 'balance' as const,
          sortTime: Number(dashboard.lastBalanceCheck.timestamp),
        }]
      : [];

    return [...completed, ...failures, ...balance]
      .sort((a, b) => b.sortTime - a.sortTime)
      .slice(0, 3)
      .map(({sortTime: _sortTime, ...item}) => item);
  }, [dashboard.lastBalanceCheck, settings.accountNumber, transactions]);

  const refresh = useCallback(() => {
    void appStartupService.refreshAll();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const setAutomationEnabled = useCallback(async (enabled: boolean) => {
    const nextSettings = {...settings, automationEnabled: enabled};
    await settingsService.save(nextSettings);
    setSettings(nextSettings);
    await dashboardService.refresh();
  }, [setSettings, settings]);

  const onPowerPress = useCallback(() => {
    if (blocked) {
      Alert.alert('Subscription required', 'Renew your subscription before starting automation.');
      navigation.navigate('RenewSubscription');
      return;
    }

    if (!automationRunning) {
      void setAutomationEnabled(true);
      return;
    }

    Alert.alert(
      'Stop Automation?',
      'This will stop:\n\n* SMS Monitoring\n* Balance Checker\n* Automatic Transfers',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Stop Automation', style: 'destructive', onPress: () => void setAutomationEnabled(false)},
      ],
    );
  }, [automationRunning, blocked, navigation, setAutomationEnabled]);

  const heroTitle = automationRunning ? 'AUTOMATION ACTIVE' : blocked ? 'AUTOMATION BLOCKED' : 'AUTOMATION STOPPED';
  const heroBadge = automationRunning ? 'LIVE' : blocked ? 'BLOCKED' : 'IDLE';
  const heroDescription = automationRunning
    ? 'All systems are running smoothly'
    : blocked
      ? verificationLabel
      : 'Start automation when you are ready';

  const metrics: AutomationMetric[] = [
    {
      label: 'Last Transfer',
      value: dashboard.lastTransaction ? formatCurrency(dashboard.lastTransaction.amount || 0) : '-',
      helper: dashboard.lastTransaction ? shortTime(dashboard.lastTransaction.completedAt ?? dashboard.lastTransaction.timestamp) : '-',
      icon: 'clock',
    },
    {
      label: 'Last Balance Check',
      value: dashboard.lastBalanceCheck ? shortTime(dashboard.lastBalanceCheck.timestamp) : '-',
      helper: dashboard.lastDetectedBalance !== undefined ? `Balance ${formatCurrency(dashboard.lastDetectedBalance)}` : '-',
      icon: 'wallet',
    },
    {
      label: 'Balance Mode',
      value: dashboard.periodicBalanceCheckerEnabled ? balanceCheckerMode : 'Disabled',
      helper: dashboard.balanceCheckIntervalMinutes === 0 ? 'Next: immediate' : minutesUntil(dashboard.nextScheduledBalanceCheck),
      icon: 'calendar',
    },
    {
      label: 'USSD Mode',
      value: ussdMode,
      helper: backgroundRunning ? 'Service active' : 'Service stopped',
      icon: 'shield',
    },
  ];

  return (
    <Screen contentContainerStyle={styles.screen} scroll>
      <Header
        username={username}
        subscriptionLabel={subscriptionLabel}
        subscriptionDetail={subscriptionDetail}
        subscriptionTone={subscriptionActive ? 'success' : dashboard.subscriptionStatus === 'expired' ? 'danger' : 'warning'}
      />

      <AutomationCard
        title={heroTitle}
        badge={heroBadge}
        description={heroDescription}
        accessibility={`Accessibility: ${accessibilityEnabled ? 'Enabled' : 'Disabled'}`}
        service={`Service: ${backgroundRunning ? 'Connected' : 'Stopped'}`}
        subscription={`Subscription: ${subscriptionLabel}`}
        running={automationRunning}
        blocked={blocked}
        metrics={metrics}
        onPowerPress={onPowerPress}
      />

      <SummaryCards
        cardWidth={summaryCardWidth}
        items={[
          {
            title: 'Processed',
            value: processedAmountToday > 0 ? formatCurrency(processedAmountToday) : 'No transfers today',
            subtitle: processedAmountToday > 0 ? 'Today' : '',
            tone: 'green',
          },
          {
            title: 'Successful',
            value: todayStats.successful > 0 ? `${todayStats.successful}` : 'No activity',
            subtitle: todayStats.successful > 0 ? 'Completed' : '',
            tone: 'blue',
          },
          {
            title: 'Failed',
            value: todayStats.failed > 0 ? `${todayStats.failed}` : 'No failures today',
            subtitle: todayStats.failed > 0 ? 'Needs Review' : '',
            tone: 'red',
          },
        ]}
      />

      <RecentActivity items={recentActivity} onViewAll={() => navigation.navigate('Transactions')} />

      <SystemHealth items={['Accessibility', 'SMS Monitoring', 'Balance Checker', 'Internet', 'Subscription']} />

      <QuickActions
        cardWidth={quickCardWidth}
        onHistory={() => navigation.navigate('Transactions')}
        onSubscription={() => navigation.navigate('Subscription')}
        onSettings={() => navigation.navigate('Settings')}
      />

      <BottomNavigation
        onDashboard={() => undefined}
        onActivity={() => navigation.navigate('Transactions')}
        onAutomation={onPowerPress}
        onHistory={() => navigation.navigate('Transactions')}
        onSettings={() => navigation.navigate('Settings')}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    gap: 16,
    paddingBottom: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
});
