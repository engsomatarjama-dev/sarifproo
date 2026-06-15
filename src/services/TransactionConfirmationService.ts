import {ConfirmationParseResult, UssdFinalResult} from '../types';
import {transactionRepository} from '../repositories/TransactionRepository';
import {confirmationSmsParserService} from './ConfirmationSmsParserService';
import {loggingService} from './LoggingService';
import {dashboardService} from './DashboardService';
import {notificationService} from './NotificationService';
import {makeDeterministicHash} from '../utils/sms';
import {automationLockService} from './AutomationLockService';

const CONFIRMATION_WINDOW_MS = 60_000;

const is898Sender = (sender: string) => {
  const normalized = sender.trim().toLowerCase();
  const digits = normalized.replace(/[^\d]/g, '');
  return normalized === '898' || digits === '898' || digits.endsWith('898');
};

const resultToAwaitingPayload = (result: UssdFinalResult) => ({
  transactionType: result.transactionType,
  resultMessage: result.message,
  failureReason:
    result.status === 'failed' || result.status === 'unknown_result'
      ? result.failureReason ?? result.message ?? 'awaiting_898_confirmation'
      : undefined,
  errorCode: result.errorCode,
  completedAt: undefined,
});

class TransactionConfirmationService {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingConfirmations: Array<{confirmation: ConfirmationParseResult; smsHash: string; receivedAt: number}> = [];

  is898Sender(sender: string) {
    return is898Sender(sender);
  }

  parse(body: string) {
    return confirmationSmsParserService.parse(body);
  }

  async startAwaitingConfirmation(reference: string, ussdResult: UssdFinalResult) {
    if (
      ussdResult.status === 'completed' &&
      (ussdResult.transactionType === 'direct_transfer' || ussdResult.transactionType === 'bank_deposit')
    ) {
      await transactionRepository.completeFromUssdResult(reference, ussdResult);
      await loggingService.log('transaction_completed', 'Transaction completed from USSD success result');
      await loggingService.log('system', '898 confirmation remains optional after USSD success');
      await dashboardService.refresh();
      await automationLockService.release(reference);
      return;
    }

    if (ussdResult.status === 'failed' || ussdResult.status === 'unknown_result') {
      await transactionRepository.updateResult(reference, {
        status: ussdResult.status,
        transactionType: ussdResult.transactionType,
        resultMessage: ussdResult.message,
        failureReason: ussdResult.failureReason ?? ussdResult.message ?? 'terminal_ussd_error',
        errorCode: ussdResult.errorCode ?? ussdResult.failureReason ?? 'terminal_ussd_error',
        completedAt: Date.now(),
      });
      await loggingService.log('transaction_failed', 'Terminal USSD error finalized without 898 confirmation wait');
      await dashboardService.refresh();
      await automationLockService.release(reference);
      return;
    }

    const now = Date.now();
    const started = await transactionRepository.markAwaitingConfirmation(
      reference,
      resultToAwaitingPayload(ussdResult),
      now,
      now + CONFIRMATION_WINDOW_MS,
    );
    if (!started) {
      await loggingService.log('system', 'Awaiting confirmation skipped because transaction was already completed');
      await automationLockService.release(reference);
      return;
    }
    automationLockService.markExternalRelease(reference);
    await loggingService.log('system', 'Awaiting confirmation started');
    await this.retryPendingConfirmations();
    this.scheduleExpiry(reference, CONFIRMATION_WINDOW_MS);
  }

  async processSms(sender: string, body: string, timestamp: number) {
    if (!is898Sender(sender)) {
      return {handled: false, reason: 'Not sender 898'};
    }

    await loggingService.log('sms_received', '898 SMS received');
    const confirmation = confirmationSmsParserService.parse(body);
    if (!confirmation) {
      return {handled: false, reason: 'Not a transfer confirmation'};
    }

    await loggingService.log('sms_parsed', '898 SMS parsed');
    const smsHash = makeDeterministicHash(`898|${timestamp}|${body}`);
    const match = await transactionRepository.findConfirmationMatch(confirmation, Date.now());

    if (match?.id) {
      await this.completeMatch(match, confirmation);
      return {handled: true, matched: true, confirmation};
    }

    await loggingService.log('system', 'Confirmation did not match');
    this.storePendingConfirmation(confirmation, smsHash);
    if (await transactionRepository.hasRecentUnconfirmedTransferCandidate(confirmation, Date.now())) {
      await loggingService.log('system', '898 confirmation stored for retry against pending transfer');
      await dashboardService.refresh();
      return {handled: true, matched: false, pending: true, confirmation};
    }

    if (!(await transactionRepository.existsConfirmation(confirmation, smsHash))) {
      await transactionRepository.createFromConfirmation(confirmation, smsHash);
      await loggingService.log('transaction_completed', 'Transaction completed via 898 confirmation');
      await notificationService.show('Transfer confirmed', '898 confirmation SMS created a completed local record.');
      await dashboardService.refresh();
      return {handled: true, matched: false, created: true, confirmation};
    }

    await loggingService.log('system', 'Duplicate 898 confirmation ignored');
    await dashboardService.refresh();
    return {handled: true, matched: false, duplicate: true, confirmation};
  }

  async expireOutstanding() {
    await transactionRepository.expireAwaitingConfirmation();
  }

  private scheduleExpiry(reference: string, delayMs: number) {
    this.clearTimer(reference);
    const timer = setTimeout(() => {
      this.timers.delete(reference);
      void this.expireReference(reference);
    }, delayMs + 250);
    this.timers.set(reference, timer);
  }

  private clearTimer(reference: string) {
    const timer = this.timers.get(reference);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(reference);
    }
  }

  private async expireReference(reference: string) {
    await transactionRepository.expireAwaitingConfirmation();
    await loggingService.log('transaction_failed', `Awaiting confirmation expired for ${reference}`);
    await loggingService.log('transaction_failed', 'Awaiting confirmation expired');
    await notificationService.show('Transfer not confirmed', '898 confirmation SMS was not received within 60 seconds.');
    await dashboardService.refresh();
    await automationLockService.release(reference);
  }

  private storePendingConfirmation(confirmation: ConfirmationParseResult, smsHash: string) {
    const receivedAt = Date.now();
    this.pendingConfirmations = [
      ...this.pendingConfirmations.filter(item => item.smsHash !== smsHash && receivedAt - item.receivedAt <= 10 * 60 * 1000),
      {confirmation, smsHash, receivedAt},
    ].slice(-20);
  }

  private async retryPendingConfirmations() {
    const now = Date.now();
    const stillPending: typeof this.pendingConfirmations = [];
    for (const item of this.pendingConfirmations) {
      if (now - item.receivedAt > 10 * 60 * 1000) {
        continue;
      }
      const match = await transactionRepository.findConfirmationMatch(item.confirmation, now);
      if (match?.id) {
        await this.completeMatch(match, item.confirmation);
      } else {
        stillPending.push(item);
      }
    }
    this.pendingConfirmations = stillPending;
  }

  private async completeMatch(match: {id?: number; reference: string; status: string}, confirmation: ConfirmationParseResult) {
    if (!match.id) {
      return;
    }
    const overridden = match.status === 'failed' || match.status === 'unknown_result';
    await transactionRepository.completeWithConfirmation(
      match.id,
      confirmation,
      overridden ? 'completed_by_898_confirmation' : 'confirmed_by_898_sms',
    );
    this.clearTimer(match.reference);
    await loggingService.log('transaction_completed', 'Confirmation matched');
    await loggingService.log('transaction_completed', 'Transaction completed via 898 confirmation');
    if (overridden) {
      await loggingService.log('transaction_completed', 'Transaction overridden from failed to completed');
    }
    await notificationService.show('Transfer confirmed', '898 confirmation SMS verified the transfer.');
    await dashboardService.refresh();
    await automationLockService.release(match.reference);
  }
}

export const transactionConfirmationService = new TransactionConfirmationService();
