import {SmsPayload, Transaction} from '../types';
import {smsParserService} from '../services/SmsParserService';
import {duplicateGuardService} from '../services/DuplicateGuardService';
import {transactionRepository} from '../repositories/TransactionRepository';
import {loggingService} from '../services/LoggingService';
import {dashboardService} from '../services/DashboardService';
import {useAppStore} from '../store/useAppStore';
import {ussdAutomationService} from '../services/UssdAutomationService';
import {notificationService} from '../services/NotificationService';
import {makeDeterministicHash} from '../utils/sms';
import {redactReference} from '../utils/redaction';
import {transactionConfirmationService} from '../services/TransactionConfirmationService';
import {buildTransferDedupeKey} from '../services/DuplicateTransferPolicy';

class ExchangeAutomationEngine {
  async process(payload: SmsPayload) {
    const settings = useAppStore.getState().settings;
    const parsed = smsParserService.parseExchange(payload.body);
    if (!parsed) {
      await loggingService.log('transaction_failed', 'Exchange SMS rejected: invalid format');
      return {handled: false, reason: 'Invalid exchange SMS'};
    }

    if (duplicateGuardService.hasReference(parsed.reference) || (await transactionRepository.exists(parsed.reference))) {
      await loggingService.log('transaction_failed', `Duplicate exchange SMS ignored: ${parsed.reference}`);
      return {handled: false, reason: 'Duplicate reference'};
    }

    const transferDestination = settings.accountNumber;
    const transactionType = settings.transferMethod === 'DARA_SALAAM_BANK' ? 'bank_deposit' : 'direct_transfer';
    const duplicateTransfer = await transactionRepository.findRecentTransferDuplicate({
      amount: parsed.amount,
      transactionType,
      destinationAccount: transferDestination,
      reference: parsed.reference,
      source: 'sms',
    });
    if (duplicateTransfer) {
      duplicateGuardService.rememberReference(parsed.reference);
      await loggingService.log('system', 'Duplicate SMS skipped');
      await loggingService.log(
        'system',
        'Skipped SMS-triggered automation because matching balance-triggered transfer already processed.',
      );
      return {handled: false, reason: 'Duplicate transfer'};
    }

    const transaction: Transaction = {
      type: 'sms_exchange',
      transactionType,
      amount: parsed.amount,
      phone: parsed.phone,
      reference: parsed.reference,
      status: 'pending',
      smsBody: makeDeterministicHash(payload.body),
      timestamp: payload.timestamp,
      source: 'sms',
      sourceReference: parsed.reference,
      dedupeKey: buildTransferDedupeKey({
        amount: parsed.amount,
        transferMethod: settings.transferMethod,
        destinationAccount: transferDestination,
        timestamp: payload.timestamp,
      }),
      transferDestination,
    };

    await transactionRepository.create(transaction);
    duplicateGuardService.rememberReference(parsed.reference);
    await loggingService.log('sms_parsed', `SMS parsed as ${parsed.classification} reference ${redactReference(parsed.reference)}`);

    if (
      settings.transferMethod === 'DIRECT_TRANSFER' &&
      (!settings.accountNumber || !settings.shortcode || !settings.pin1)
    ) {
      await transactionRepository.updateStatus(parsed.reference, 'failed');
      await loggingService.log('transaction_failed', `Exchange automation skipped for ${parsed.reference}: missing account, shortcode, or PIN1`);
      await notificationService.show('Transfer failed', 'SMS was parsed, but account, shortcode, or PIN1 is missing in settings.');
      await dashboardService.refresh();
      return {handled: false, reason: 'Missing account, shortcode, or PIN1'};
    }

    const originalUsdAmount = parsed.amount;

    try {
      if (settings.transferMethod === 'DARA_SALAAM_BANK') {
        await transactionRepository.updateStatus(parsed.reference, 'running');
        await loggingService.log('transaction_completed', 'Transfer triggered');
        const result = await ussdAutomationService.startDaraSalaamBankDeposit(settings, originalUsdAmount);
        await transactionConfirmationService.startAwaitingConfirmation(parsed.reference, result.result);
        await loggingService.log(
          'system',
          `Dara-Salaam Bank automation awaiting 898 confirmation after USSD result ${result.result.status} classification ${parsed.classification}`,
        );
        await notificationService.show('Awaiting confirmation', `Waiting for 898 SMS confirmation for $${result.amountToSend}.`);
        await dashboardService.refresh();
        return {handled: true, parsed, ussd: result.ussd, transferDestination, amountToSend: result.amountToSend, result: result.result};
      }

      let ussd: string;
      try {
        ussd = ussdAutomationService.buildExchangeTransferUssd(settings, parsed.amount);
      } catch (error) {
        await transactionRepository.updateStatus(parsed.reference, 'failed');
        await loggingService.log('transaction_failed', `Exchange automation rejected: ${error instanceof Error ? error.message : 'Invalid transfer settings'}`);
        await notificationService.show('Transfer failed', 'Transfer settings or amount failed validation.');
        await dashboardService.refresh();
        return {handled: false, reason: 'Invalid transfer settings'};
      }

      await loggingService.log('transaction_completed', 'Transfer triggered');
      await transactionRepository.updateStatus(parsed.reference, 'running');
      const result = await ussdAutomationService.dial(ussd);
      await transactionConfirmationService.startAwaitingConfirmation(parsed.reference, result);
      await loggingService.log('system', `Exchange automation awaiting 898 confirmation after USSD result ${result.status} classification ${parsed.classification}`);
      await notificationService.show('Awaiting confirmation', 'Waiting for 898 SMS confirmation.');
      await dashboardService.refresh();
      return {handled: true, parsed, ussd, transferDestination, result};
    } catch (error) {
      await transactionRepository.updateResult(parsed.reference, {
        status: 'failed',
        transactionType: settings.transferMethod === 'DARA_SALAAM_BANK' ? 'bank_deposit' : 'direct_transfer',
        resultMessage: error instanceof Error ? error.message : 'USSD automation failed',
        failureReason: error instanceof Error ? error.message : 'USSD automation failed',
        completedAt: Date.now(),
      });
      await loggingService.log('transaction_failed', `Exchange automation failed for ${parsed.reference}: ${String(error)}`);
      await notificationService.show('Transfer failed', 'Exchange transfer failed before 898 confirmation wait could start.');
      await dashboardService.refresh();
      return {handled: false, reason: 'USSD failed'};
    }
  }
}

export const exchangeAutomationEngine = new ExchangeAutomationEngine();
