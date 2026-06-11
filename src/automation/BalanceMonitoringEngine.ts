import {SmsPayload, Transaction, UssdFinalResult} from '../types';
import {smsParserService} from '../services/SmsParserService';
import {useAppStore} from '../store/useAppStore';
import {loggingService} from '../services/LoggingService';
import {duplicateGuardService} from '../services/DuplicateGuardService';
import {ussdAutomationService} from '../services/UssdAutomationService';
import {transactionRepository} from '../repositories/TransactionRepository';
import {dashboardService} from '../services/DashboardService';
import {notificationService} from '../services/NotificationService';
import {makeDeterministicHash} from '../utils/sms';
import {truncateToTwoDecimals} from '../utils/ussd';
import {transactionConfirmationService} from '../services/TransactionConfirmationService';
import {buildTransferDedupeKey} from '../services/DuplicateTransferPolicy';

class BalanceMonitoringEngine {
  async process(payload: SmsPayload) {
    const settings = useAppStore.getState().settings;
    const parsed = smsParserService.parseBalance(payload.body);

    if (!parsed) {
      await loggingService.log('transaction_failed', 'Sender 898 SMS did not contain a supported balance format');
      return {handled: false, reason: 'Unsupported balance SMS'};
    }

    useAppStore.getState().setLastDetectedBalance(parsed.balance);
    await loggingService.log('balance_detected', 'Balance detected from sender 898');
    await notificationService.show('Balance detected', 'A supported balance SMS was detected from sender 898.');

    const normalizedAmount = truncateToTwoDecimals(parsed.balance);
    if (normalizedAmount <= 0) {
      await loggingService.log('system', 'No transferable balance available');
      await dashboardService.refresh();
      return {handled: true, reason: 'No transferable balance'};
    }

    if (normalizedAmount < settings.minimumBalanceThreshold) {
      await dashboardService.refresh();
      return {handled: true, reason: 'Below threshold'};
    }

    if (!duplicateGuardService.canTransferNow()) {
      await loggingService.log('transaction_failed', 'Balance transfer skipped due to cooldown loop protection');
      await dashboardService.refresh();
      return {handled: true, reason: 'Cooldown active'};
    }

    const reference = `BAL-${payload.timestamp}`;
    const transactionType = settings.transferMethod === 'DARA_SALAAM_BANK' ? 'bank_deposit' : 'direct_transfer';
    const duplicateTransfer = await transactionRepository.findRecentTransferDuplicate({
      amount: normalizedAmount,
      transactionType,
      destinationAccount: settings.accountNumber,
      reference,
      source: '898_balance_sms',
    });
    if (duplicateTransfer) {
      await loggingService.log('system', 'Duplicate event detected');
      await loggingService.log('system', 'Duplicate 898 balance event skipped');
      await dashboardService.refresh();
      return {handled: true, reason: 'Duplicate transfer'};
    }

    const transaction: Transaction = {
      type: 'balance_transfer',
      transactionType,
      amount: normalizedAmount,
      phone: settings.accountNumber,
      reference,
      status: 'pending',
      smsBody: makeDeterministicHash(payload.body),
      timestamp: payload.timestamp,
      source: '898_balance_sms',
      sourceReference: makeDeterministicHash(payload.body),
      dedupeKey: buildTransferDedupeKey({
        amount: normalizedAmount,
        transferMethod: settings.transferMethod,
        destinationAccount: settings.accountNumber,
        timestamp: payload.timestamp,
      }),
      transferDestination: settings.accountNumber,
    };

    await transactionRepository.create(transaction);

    try {
      let result: UssdFinalResult;
      await loggingService.log('transaction_completed', 'Transfer triggered');
      await transactionRepository.updateStatus(reference, 'running');
      if (settings.transferMethod === 'DARA_SALAAM_BANK') {
        result = (await ussdAutomationService.startDaraSalaamBankDeposit(settings, normalizedAmount)).result;
      } else {
        const ussd = ussdAutomationService.buildBalanceUssd(settings, normalizedAmount);
        result = await ussdAutomationService.dial(ussd);
      }
      duplicateGuardService.rememberTransferNow();
      await transactionConfirmationService.startAwaitingConfirmation(reference, result);
      await loggingService.log('system', `Balance automation awaiting 898 confirmation after USSD result ${result.status}`);
      await notificationService.show('Awaiting confirmation', 'Waiting for 898 SMS confirmation.');
      await dashboardService.refresh();
      return {handled: true, result};
    } catch (error) {
      await transactionRepository.updateResult(reference, {
        status: 'failed',
        transactionType: settings.transferMethod === 'DARA_SALAAM_BANK' ? 'bank_deposit' : 'direct_transfer',
        resultMessage: error instanceof Error ? error.message : 'USSD automation failed',
        failureReason: error instanceof Error ? error.message : 'USSD automation failed',
        completedAt: Date.now(),
      });
      await loggingService.log('transaction_failed', `USSD automation failed: ${String(error)}`);
      await notificationService.show('Transfer failed', 'Balance transfer failed before 898 confirmation wait could start.');
      await dashboardService.refresh();
      return {handled: true, reason: 'USSD failed'};
    }
  }
}

export const balanceMonitoringEngine = new BalanceMonitoringEngine();
