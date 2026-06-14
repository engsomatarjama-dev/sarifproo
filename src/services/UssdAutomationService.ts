import {AppSettings, UssdFinalResult} from '../types';
import {accessibilityNative, ussdNative} from '../native/SarifNative';
import {delay, retryOperation} from '../utils/retry';
import {buildAccountTransferUssd, buildPeriodicBalanceTransferUssd, formatTransferAmountForInput, truncateToTwoDecimals} from '../utils/ussd';
import {redactLogMessage, redactUssd} from '../utils/redaction';
import {useAppStore} from '../store/useAppStore';
import {loggingService} from './LoggingService';
import {timingLogService} from './TimingLogService';
import {UssdFlow, ussdSessionLockService} from './UssdSessionLockService';

const DARA_SALAAM_USSD = '*800#';
const BANK_PIN_PATTERN = /^\d{6}$/;

class UssdAutomationService {
  buildBalanceUssd(settings: AppSettings, amount: number) {
    return buildAccountTransferUssd(settings, amount);
  }

  buildExchangeTransferUssd(settings: AppSettings, amount: number) {
    return buildAccountTransferUssd(settings, amount);
  }

  buildPeriodicBalanceTransferUssd(settings: AppSettings, balance: number) {
    return buildPeriodicBalanceTransferUssd(settings, balance);
  }

  async runPeriodicBalanceCheck() {
    return this.withUssdSession('BALANCE_CHECK', async () => {
      await retryOperation(async () => {
        const accessibilityEnabled = await accessibilityNative.isEnabled();
        if (!accessibilityEnabled) {
          throw new Error('Accessibility Service is disabled.');
        }
        const settings = await this.currentSettings();
        await accessibilityNative.setAutomationSpeed(settings.ussdAutomationSpeed);
        await accessibilityNative.armBalanceCheckAutomation(60000);
        await ussdNative.dialUssd(DARA_SALAAM_USSD);
        ussdSessionLockService.markWaitingScreenVisible();
      }, 2);
      void loggingService.log('system', 'Periodic balance check started');
      timingLogService.log('system', `balance_check_started_at=${Date.now()}`);
      return this.monitorBalanceCheckFlow();
    });
  }

  private async monitorBalanceCheckFlow() {
    const startedAt = Date.now();
    const seenStates = new Set<string>();
    while (Date.now() - startedAt < 65_000) {
      const state = await accessibilityNative.getBalanceCheckAutomationState();
      if (state && !seenStates.has(state)) {
        seenStates.add(state);
        if (state === 'BALANCE_MAIN_MENU') {
          void loggingService.log('pin_entered', 'Periodic balance checker PIN entered');
        }
      }
      if (state === 'BALANCE_COMPLETE') {
        const rawBalance = await accessibilityNative.getBalanceCheckResult();
        const resultMessage = await accessibilityNative.getBalanceCheckResultMessage();
        const balance = Number(rawBalance);
        if (!Number.isFinite(balance)) {
          throw new Error('Balance check result was invalid.');
        }
        ussdSessionLockService.markResponseReceived('completed');
        void loggingService.log('balance_detected', 'Balance result detected');
        timingLogService.log('system', `balance_result_detected_at=${Date.now()}`);
        if (resultMessage) {
          timingLogService.log('system', `balance_ok_clicked_at=${Date.now()}`);
        }
        return balance;
      }
      if (state === 'BALANCE_FAILED') {
        const result = await this.readFinalResult();
        if (result.dismissed && result.status) {
          ussdSessionLockService.markResponseReceived('failed');
        }
        throw new Error('Balance check automation failed.');
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error('Balance check automation timed out.');
  }

  buildReceivedUsdUssd(settings: AppSettings, amount: number) {
    return this.buildExchangeTransferUssd(settings, amount);
  }

  buildExchangeUssd(settings: AppSettings, _recipientPhone: string, amount: number) {
    return this.buildExchangeTransferUssd(settings, amount);
  }

  normalizeDaraSalaamAmount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Dara-Salaam amount must be positive.');
    }
    const amountToSend = truncateToTwoDecimals(amount);
    if (amountToSend <= 0) {
      throw new Error('Dara-Salaam amount must be positive after decimal truncation.');
    }
    return amountToSend;
  }

  validateDaraSalaamSettings(settings: AppSettings, amount: number) {
    const amountToSend = this.normalizeDaraSalaamAmount(amount);
    if (amountToSend > settings.maxTransferAmount) {
      throw new Error('Transfer amount exceeds the configured maximum limit.');
    }
    if (!settings.pin2) {
      throw new Error('PIN2 is required for Dara-Salaam Bank automation.');
    }
    if (!BANK_PIN_PATTERN.test(settings.bankPin)) {
      throw new Error('Bank PIN must be exactly 6 digits.');
    }
    return amountToSend;
  }

  async startDaraSalaamBankDeposit(settings: AppSettings, originalAmount: number) {
    const amountToSend = this.validateDaraSalaamSettings(settings, originalAmount);
    return this.withUssdSession('BANK_DEPOSIT', async () => {
      await retryOperation(async () => {
        const accessibilityEnabled = await accessibilityNative.isEnabled();
        if (!accessibilityEnabled) {
          throw new Error('Accessibility Service is disabled.');
        }
        await accessibilityNative.setAutomationSpeed(settings.ussdAutomationSpeed);
        await accessibilityNative.updatePin2(settings.pin2);
        await accessibilityNative.updateBankPin(settings.bankPin);
        await accessibilityNative.armDaraSalaamAutomation(formatTransferAmountForInput(amountToSend), 90000);
        await ussdNative.dialUssd(DARA_SALAAM_USSD);
        ussdSessionLockService.markWaitingScreenVisible();
      }, 2);

      await loggingService.log('ussd_dialed', 'Dara-Salaam flow started');
      if (originalAmount !== amountToSend) {
        await loggingService.log(
          'system',
          `Dara-Salaam decimal processed. Original Amount: ${originalAmount}. Transfer Amount: ${formatTransferAmountForInput(amountToSend)}`,
        );
      }
      const result = await this.monitorDaraSalaamFlow();
      return {amountToSend, ussd: DARA_SALAAM_USSD, result};
    });
  }

  private async monitorDaraSalaamFlow() {
    const seenStates = new Set<string>();
    const startedAt = Date.now();
    while (Date.now() - startedAt < 95_000) {
      const state = await accessibilityNative.getDaraSalaamAutomationState();
      if (state && !seenStates.has(state)) {
        seenStates.add(state);
        if (state === 'DARA_INFO') {
          await loggingService.log('system', 'Dara-Salaam amount entered');
        }
        if (state === 'DARA_CONFIRM') {
          await loggingService.log('system', 'Dara-Salaam Bank PIN entered');
        }
        if (state === 'DARA_COMPLETE') {
          const result = await this.readFinalResult();
          await loggingService.log('transaction_completed', 'Dara-Salaam confirmation accepted');
          if (result.status === 'completed') {
            await loggingService.log('transaction_completed', 'Bank deposit success detected');
          } else if (result.status === 'failed') {
            await this.logTerminalUssdError(result);
            await loggingService.log('transaction_failed', 'USSD error detected');
            await loggingService.log('transaction_failed', 'Transfer failure detected');
          } else {
            await loggingService.log('transaction_failed', 'Unknown USSD result treated as failed');
            await loggingService.log('transaction_failed', `Unknown final result text: ${redactLogMessage(result.message || 'empty')}`);
          }
          await loggingService.log('system', 'Final result dismissed');
          if (result.status === 'failed') {
            await loggingService.log('system', 'Error popup dismissed');
          }
          await loggingService.log('system', 'Automation reset to IDLE');
          ussdSessionLockService.markResponseReceived(result.status === 'completed' ? 'completed' : 'failed');
          return result;
        }
        if (state === 'DARA_FAILED') {
          const result = await this.readFinalResult();
          await this.logTerminalUssdError(result);
          await loggingService.log('transaction_failed', result.failureReason || 'Dara-Salaam transfer failed');
          await loggingService.log('system', 'Final result dismissed');
          await loggingService.log('system', 'Error popup dismissed');
          await loggingService.log('system', 'Automation reset to IDLE');
          if (result.dismissed && result.status) {
            ussdSessionLockService.markResponseReceived('failed');
          }
          return result.dismissed ? result : this.fallbackResult('failed', 'bank_deposit', 'Dara-Salaam automation failed.');
        }
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await loggingService.log('transaction_failed', 'Dara-Salaam transfer failed: timeout');
    throw new Error('Dara-Salaam automation timed out.');
  }

  async dial(ussd: string) {
    return this.withUssdSession('DIRECT_TRANSFER', async () => {
      await retryOperation(async () => {
        const accessibilityEnabled = await accessibilityNative.isEnabled();
        if (!accessibilityEnabled) {
          throw new Error('Accessibility Service is disabled.');
        }
        const settings = await this.currentSettings();
        await accessibilityNative.setAutomationSpeed(settings.ussdAutomationSpeed);
        await accessibilityNative.armPinAutomation(20000);
        await ussdNative.dialUssd(ussd);
        ussdSessionLockService.markWaitingScreenVisible();
      }, 2);
      await loggingService.log('ussd_dialed', `USSD dialed: ${redactUssd(ussd)}`);
      return this.monitorFinalResult('direct_transfer');
    });
  }

  private async withUssdSession<T>(flow: UssdFlow, action: () => Promise<T>) {
    const sessionId = await ussdSessionLockService.acquire(flow, {wait: true});
    if (!sessionId) {
      throw new Error('USSD session is already active.');
    }
    try {
      return await action();
    } finally {
      await ussdSessionLockService.release(sessionId, {
        extendNativeWatcher: () => accessibilityNative.extendAutomation(30_000),
        waitForDelayedResponse: () => this.hasDelayedResponse(flow),
      });
    }
  }

  private async monitorFinalResult(fallbackType: UssdFinalResult['transactionType']) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 70_000) {
      const result = await this.readFinalResult();
      if (result.dismissed && result.status) {
        if (result.status === 'completed') {
          await loggingService.log(
            'transaction_completed',
            result.transactionType === 'bank_deposit' ? 'Bank deposit success detected' : 'Direct transfer success detected',
          );
        } else if (result.status === 'failed') {
          await this.logTerminalUssdError(result);
          await loggingService.log('transaction_failed', 'USSD error detected');
          await loggingService.log('transaction_failed', 'Transfer failure detected');
        } else {
          await loggingService.log('transaction_failed', 'Unknown USSD result treated as failed');
          await loggingService.log('transaction_failed', `Unknown final result text: ${redactLogMessage(result.message || 'empty')}`);
        }
        await loggingService.log('system', 'Final result dismissed');
        if (result.status === 'failed') {
          await loggingService.log('system', 'Error popup dismissed');
        }
        await loggingService.log('system', 'Automation reset to IDLE');
        ussdSessionLockService.markResponseReceived(result.status === 'completed' ? 'completed' : 'failed');
        return result;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    await loggingService.log('transaction_failed', 'USSD final result timeout');
    return this.fallbackResult('failed', fallbackType, 'USSD final result was not detected before timeout.');
  }

  private async hasDelayedResponse(flow: UssdFlow) {
    if (flow === 'BALANCE_CHECK') {
      const balanceState = await accessibilityNative.getBalanceCheckAutomationState();
      if (balanceState === 'BALANCE_COMPLETE') {
        ussdSessionLockService.markResponseReceived('completed');
        return true;
      }
      if (balanceState === 'BALANCE_FAILED') {
        const result = await this.readFinalResult();
        if (result.dismissed && result.status) {
          ussdSessionLockService.markResponseReceived('failed');
          return true;
        }
      }
      await delay(0);
      return false;
    }

    const result = await this.readFinalResult();
    if (result.dismissed && result.status) {
      ussdSessionLockService.markResponseReceived(result.status === 'completed' ? 'completed' : 'failed');
      return true;
    }
    await delay(0);
    return false;
  }

  private async logTerminalUssdError(result: UssdFinalResult) {
    const text = `${result.failureReason || ''} ${result.message || ''}`.toLowerCase();
    if (text.includes('invalid menu') || text.includes('please select valid option')) {
      await loggingService.log('transaction_failed', 'Invalid menu detected');
    }
    if (text.includes('invalid mmi') || text.includes('mmi code')) {
      await loggingService.log('transaction_failed', 'Invalid MMI code detected');
    }
  }

  private async readFinalResult(): Promise<UssdFinalResult> {
    const result = await accessibilityNative.getFinalUssdResult();
    return {
      classification: result.classification,
      status: result.status || 'failed',
      transactionType: result.transactionType || 'unknown',
      message: result.message ?? '',
      amount: result.amount || undefined,
      receiverName: result.receiverName || undefined,
      receiverPhone: result.receiverPhone || undefined,
      bankAccount: result.bankAccount || undefined,
      failureReason: result.failureReason || (result.status === 'failed' ? 'unknown_or_unexpected_ussd_result' : undefined),
      dismissed: Boolean(result.dismissed),
      timestamp: Number(result.timestamp) || Date.now(),
    };
  }

  private fallbackResult(
    status: UssdFinalResult['status'],
    transactionType: UssdFinalResult['transactionType'],
    message: string,
  ): UssdFinalResult {
    return {
      status,
      transactionType,
      message,
      failureReason: status === 'failed' ? message : undefined,
      dismissed: false,
      timestamp: Date.now(),
    };
  }

  private async currentSettings() {
    return useAppStore.getState().settings;
  }
}

export const ussdAutomationService = new UssdAutomationService();
