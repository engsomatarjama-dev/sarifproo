import {transactionRepository} from '../repositories/TransactionRepository';
import {balanceCheckRepository} from '../repositories/BalanceCheckRepository';
import {subscriptionGuardService} from './SubscriptionGuardService';
import {useAppStore} from '../store/useAppStore';
import {duplicateGuardService} from './DuplicateGuardService';

class DashboardService {
  async refresh() {
    const settings = useAppStore.getState().settings;
    const [lastTransaction, totalTransactionsToday, totalTransferredAmount, subscriptionSummary, lastBalanceCheck, lastBalanceTransfer] = await Promise.all([
      transactionRepository.getLast(),
      transactionRepository.totalToday(),
      transactionRepository.totalTransferredAmountToday(),
      subscriptionGuardService.getDashboardSummary(),
      balanceCheckRepository.getLast(),
      balanceCheckRepository.getLastTransfer(),
    ]);
    const lastBalanceCheckTimestamp = duplicateGuardService.getLastBalanceCheckTimestamp();

    useAppStore.getState().setDashboard({
      automationEnabled: settings.automationEnabled,
      monitoring898Enabled: settings.monitoring898Enabled,
      periodicBalanceCheckerEnabled: settings.periodicBalanceCheckerEnabled,
      balanceCheckIntervalMinutes: settings.balanceCheckIntervalMinutes,
      ussdAutomationSpeed: settings.ussdAutomationSpeed,
      lastTransaction,
      lastDetectedBalance: useAppStore.getState().lastDetectedBalance ?? lastBalanceCheck?.transferAmount,
      totalTransactionsToday,
      totalTransferredAmount,
      subscriptionStatus: subscriptionSummary.subscriptionStatus,
      expiryDate: subscriptionSummary.expiryDate,
      daysRemaining: subscriptionSummary.daysRemaining,
      subscriptionVerificationStatus: subscriptionSummary.subscriptionVerificationStatus,
      lastSubscriptionVerifiedAt: subscriptionSummary.lastSubscriptionVerifiedAt,
      offlineGraceRemainingMs: subscriptionSummary.offlineGraceRemainingMs,
      lastBalanceCheck,
      lastBalanceTransfer,
      nextScheduledBalanceCheck:
        settings.periodicBalanceCheckerEnabled && settings.balanceCheckIntervalMinutes > 0 && lastBalanceCheckTimestamp
          ? lastBalanceCheckTimestamp + settings.balanceCheckIntervalMinutes * 60 * 1000
          : undefined,
    });

    useAppStore.getState().setTransactions(await transactionRepository.list());
  }
}

export const dashboardService = new DashboardService();
