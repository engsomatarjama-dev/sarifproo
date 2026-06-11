import {accessibilityNative} from '../native/SarifNative';
import {BalanceCheck, Transaction, UssdFinalResult} from '../types';
import {balanceCheckRepository} from '../repositories/BalanceCheckRepository';
import {duplicateGuardService} from '../services/DuplicateGuardService';
import {loggingService} from '../services/LoggingService';
import {notificationService} from '../services/NotificationService';
import {subscriptionGuardService} from '../services/SubscriptionGuardService';
import {useAppStore} from '../store/useAppStore';
import {truncateToTwoDecimals} from '../utils/ussd';
import {ussdAutomationService} from '../services/UssdAutomationService';
import {dashboardService} from '../services/DashboardService';
import {transactionRepository} from '../repositories/TransactionRepository';
import {transactionConfirmationService} from '../services/TransactionConfirmationService';
import {automationQueueService} from '../services/AutomationQueueService';
import {buildTransferDedupeKey} from '../services/DuplicateTransferPolicy';
import {ussdSessionLockService} from '../services/UssdSessionLockService';

class PeriodicBalanceCheckerService {
  private running = false;
  private continuousModeLogged = false;
  private continuousTimer?: ReturnType<typeof setTimeout>;

  getNextScheduledTimestamp() {
    const settings = useAppStore.getState().settings;
    const last = duplicateGuardService.getLastBalanceCheckTimestamp();
    if (!settings.periodicBalanceCheckerEnabled || !last) {
      return undefined;
    }
    if (settings.balanceCheckIntervalMinutes === 0) {
      return Date.now();
    }
    return last + settings.balanceCheckIntervalMinutes * 60 * 1000;
  }

  async tick() {
    const settings = useAppStore.getState().settings;
    if (!settings.automationEnabled || !settings.periodicBalanceCheckerEnabled || this.running) {
      return;
    }

    const continuousMode = settings.balanceCheckIntervalMinutes === 0;
    if (continuousMode) {
      if (!this.continuousModeLogged) {
        this.continuousModeLogged = true;
        await loggingService.log('system', 'Continuous Mode Enabled');
      }
    } else {
      this.continuousModeLogged = false;
      const intervalMs = settings.balanceCheckIntervalMinutes * 60 * 1000;
      const lastCheck = duplicateGuardService.getLastBalanceCheckTimestamp();
      if (Date.now() - lastCheck < intervalMs) {
        return;
      }
    }

    const canRun = await subscriptionGuardService.canRunAutomation();
    if (!canRun) {
      return;
    }

    if (await ussdSessionLockService.isUssdBusy()) {
      await loggingService.log('system', 'Balance check skipped because USSD session active');
      return;
    }

    await automationQueueService.enqueue({
      id: `balance-check-${Date.now()}`,
      type: 'balance_check',
      priority: 4,
      source: 'periodic_balance_checker',
      dedupeKey: 'periodic_balance_checker',
      run: async () => {
        const accessibilityEnabled = await accessibilityNative.isEnabled();
        if (!accessibilityEnabled) {
          await loggingService.log('transaction_failed', 'Periodic balance check skipped: Accessibility Service is disabled');
          return;
        }

        const automationActive = await accessibilityNative.isAutomationActive();
        if (automationActive) {
          await loggingService.log('system', 'Balance check skipped because automation is busy');
          return;
        }

        await this.run();
      },
    });
  }

  async run() {
    if (this.running) {
      return;
    }

    this.running = true;
    const startedAt = Date.now();
    duplicateGuardService.rememberBalanceCheckNow();
    let failedCycle = false;
    let pendingConfirmationReference: string | undefined;
    let pendingConfirmationType: 'direct_transfer' | 'bank_deposit' = 'direct_transfer';
    try {
      const settings = useAppStore.getState().settings;
      await loggingService.log('system', 'Balance Cycle Started');
      const originalBalance = await ussdAutomationService.runPeriodicBalanceCheck();
      const balanceToTransfer = truncateToTwoDecimals(originalBalance);
      useAppStore.getState().setLastDetectedBalance(balanceToTransfer);
      await loggingService.log('balance_detected', 'Balance Extracted');

      if (originalBalance !== balanceToTransfer) {
        await loggingService.log(
          'system',
          `Original Balance: ${originalBalance}. Transfer Balance: ${balanceToTransfer}. Extra decimal digits discarded`,
        );
      }

      if (balanceToTransfer <= 0) {
        await this.saveCheck(originalBalance, balanceToTransfer, 'completed', startedAt);
        await loggingService.log('system', 'No transferable balance available');
        await dashboardService.refresh();
        await loggingService.log('system', 'Balance Cycle Completed');
        return;
      }

      if (balanceToTransfer < settings.minimumBalanceThreshold) {
        await this.saveCheck(originalBalance, balanceToTransfer, 'completed', startedAt);
        await loggingService.log('balance_detected', 'Balance below threshold');
        await loggingService.log('system', 'Balance check completed without 898 confirmation wait');
        await dashboardService.refresh();
        await loggingService.log('system', 'Balance Cycle Completed');
        return;
      }

      if (!duplicateGuardService.canTransferPeriodicBalance(balanceToTransfer)) {
        await this.saveCheck(originalBalance, balanceToTransfer, 'completed', startedAt);
        await loggingService.log('system', 'Periodic balance transfer skipped due to duplicate cooldown');
        await loggingService.log('system', 'Balance check completed without 898 confirmation wait');
        await dashboardService.refresh();
        await loggingService.log('system', 'Balance Cycle Completed');
        return;
      }

      const reference = `PBC-${startedAt}`;
      pendingConfirmationReference = reference;
      pendingConfirmationType = settings.transferMethod === 'DARA_SALAAM_BANK' ? 'bank_deposit' : 'direct_transfer';
      const duplicateTransfer = await transactionRepository.findRecentTransferDuplicate({
        amount: balanceToTransfer,
        transactionType: pendingConfirmationType,
        destinationAccount: settings.accountNumber,
        reference,
        source: 'periodic_balance_checker',
      });
      if (duplicateTransfer) {
        await this.saveCheck(originalBalance, balanceToTransfer, 'completed', startedAt);
        await loggingService.log('system', 'Duplicate event detected');
        await loggingService.log('system', 'Periodic balance transfer skipped because matching transfer already processed');
        await dashboardService.refresh();
        await loggingService.log('system', 'Balance Cycle Completed');
        return;
      }

      await this.saveCheck(originalBalance, balanceToTransfer, 'triggered_transfer', startedAt);
      await loggingService.log('transaction_completed', 'Transfer Started');
      const transaction: Transaction = {
        type: 'balance_transfer',
        transactionType: pendingConfirmationType,
        amount: balanceToTransfer,
        phone: settings.accountNumber,
        reference,
        status: 'running',
        smsBody: 'periodic_balance_checker',
        timestamp: startedAt,
        source: 'periodic_balance_checker',
        sourceReference: reference,
        dedupeKey: buildTransferDedupeKey({
          amount: balanceToTransfer,
          transferMethod: settings.transferMethod,
          destinationAccount: settings.accountNumber,
          timestamp: startedAt,
        }),
        transferDestination: settings.accountNumber,
      };
      await transactionRepository.create(transaction);

      let result: UssdFinalResult;
      if (settings.transferMethod === 'DARA_SALAAM_BANK') {
        result = (await ussdAutomationService.startDaraSalaamBankDeposit(settings, balanceToTransfer)).result;
        await loggingService.log(
          'system',
          `Bank deposit awaiting 898 confirmation after USSD result ${result.status}`,
        );
      } else {
        const ussd = ussdAutomationService.buildPeriodicBalanceTransferUssd(settings, balanceToTransfer);
        await loggingService.log('ussd_dialed', `Generated USSD: ${ussd}`);
        result = await ussdAutomationService.dial(ussd);
        await loggingService.log(
          'system',
          `Transfer awaiting 898 confirmation after USSD result ${result.status}`,
        );
      }

      await transactionConfirmationService.startAwaitingConfirmation(reference, result);
      duplicateGuardService.rememberPeriodicBalanceTransfer(balanceToTransfer);
      await loggingService.log('system', 'Periodic balance transfer awaiting confirmation');
      await notificationService.show('Awaiting confirmation', 'Waiting for 898 SMS confirmation.');
      await dashboardService.refresh();
      await loggingService.log('system', 'Balance Cycle Completed');
    } catch (error) {
      failedCycle = true;
      if (pendingConfirmationReference) {
        await transactionRepository.updateResult(pendingConfirmationReference, {
          status: 'failed',
          transactionType: pendingConfirmationType,
          resultMessage: error instanceof Error ? error.message : 'Periodic balance transfer failed',
          failureReason: error instanceof Error ? error.message : 'Periodic balance transfer failed',
          completedAt: Date.now(),
        });
      }
      await this.saveCheck(0, 0, 'failed', startedAt);
      await loggingService.log('transaction_failed', `Balance check failed: ${error instanceof Error ? error.message : String(error)}`);
      await notificationService.show('Transfer failed', 'Periodic balance check failed.');
    } finally {
      this.running = false;
      await loggingService.log('system', 'Automation Returned To Idle');
      this.scheduleContinuousCycle(failedCycle ? 30_000 : 0);
    }
  }

  private scheduleContinuousCycle(delayMs: number) {
    const settings = useAppStore.getState().settings;
    if (
      !settings.automationEnabled ||
      !settings.periodicBalanceCheckerEnabled ||
      settings.balanceCheckIntervalMinutes !== 0
    ) {
      return;
    }

    if (this.continuousTimer) {
      clearTimeout(this.continuousTimer);
    }
    this.continuousTimer = setTimeout(() => {
      this.continuousTimer = undefined;
      void this.tick();
    }, delayMs);
  }

  private async saveCheck(balance: number, transferAmount: number, status: BalanceCheck['status'], timestamp: number) {
    await balanceCheckRepository.create({
      balance,
      transferAmount,
      status,
      source: 'periodic_balance_checker',
      timestamp,
    });
  }
}

export const periodicBalanceCheckerService = new PeriodicBalanceCheckerService();
