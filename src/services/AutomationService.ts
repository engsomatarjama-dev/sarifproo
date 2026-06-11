import BackgroundActions, {BackgroundTaskOptions} from 'react-native-background-actions';
import {SmsPayload} from '../types';
import {smsEventEmitter, smsNative} from '../native/SarifNative';
import {makeDeterministicHash} from '../utils/sms';
import {duplicateGuardService} from './DuplicateGuardService';
import {loggingService} from './LoggingService';
import {useAppStore} from '../store/useAppStore';
import {exchangeAutomationEngine} from '../automation/ExchangeAutomationEngine';
import {balanceMonitoringEngine} from '../automation/BalanceMonitoringEngine';
import {subscriptionGuardService} from './SubscriptionGuardService';
import {notificationService} from './NotificationService';
import {normalizeSms} from '../utils/sms';
import {smsParserService} from './SmsParserService';
import {periodicBalanceCheckerService} from '../automation/PeriodicBalanceCheckerService';
import {transactionConfirmationService} from './TransactionConfirmationService';
import {automationQueueService} from './AutomationQueueService';
import {truncateToTwoDecimals} from '../utils/ussd';

type BackgroundTaskData = {delay: number};

const is898Sender = (sender: string) => {
  const normalized = sender.trim().toLowerCase();
  const digits = normalized.replace(/[^\d]/g, '');
  return normalized === '898' || digits === '898' || digits.endsWith('898');
};

const normalizeBody = (body: string) => normalizeSms(body).toLowerCase();

const looksLikeBalanceMessage = (body: string) => {
  const normalized = normalizeBody(body);
  return normalized.includes('hadhaag') || normalized.includes('balance');
};

const looksLikeIncomingBalanceTrigger = (body: string) => {
  const normalized = normalizeBody(body);
  return (
    normalized.includes('ka heshay') ||
    normalized.includes('xisaabtaada') ||
    normalized.includes('hadhaageedu waa') ||
    normalized.includes('hadhaagaagu waa') ||
    normalized.includes('hadhaagaaga:')
  );
};

const looksLikeOutgoingTransferConfirmation = (body: string) => {
  const normalized = normalizeBody(body);
  return (
    normalized.includes('u dirtay') ||
    normalized.includes('ayaad u dirtay') ||
    normalized.includes('u sariftay') ||
    normalized.includes('you have exchanged')
  );
};

const BACKGROUND_OPTIONS: BackgroundTaskOptions & {parameters: BackgroundTaskData} = {
  taskName: 'SarifPro Automation',
  taskTitle: 'SarifPro Automation Running',
  taskDesc: 'Balance checker active',
  foregroundServiceType: ['dataSync'],
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#0B6E4F',
  parameters: {
    delay: 6000,
  },
};

class AutomationService {
  private subscribed = false;

  async processSms(payload: SmsPayload) {
    const settings = useAppStore.getState().settings;
    const smsHash = makeDeterministicHash(`${payload.sender}|${payload.timestamp}|${payload.body}`);

    await transactionConfirmationService.expireOutstanding();

    if (duplicateGuardService.hasSmsHash(smsHash)) {
      return;
    }

    if (is898Sender(payload.sender)) {
      const confirmationResult = await transactionConfirmationService.processSms(payload.sender, payload.body, payload.timestamp);
      if (confirmationResult.handled) {
        duplicateGuardService.rememberSmsHash(smsHash);
        return;
      }
    }

    const classification = smsParserService.classify(payload.body);
    await loggingService.log('system', `SMS classified as ${classification}`);

    const canAutomate = await subscriptionGuardService.canRunAutomation();
    if (!canAutomate) {
      await notificationService.show('Subscription expired', 'Automation is locked until the subscription is renewed.');
      return;
    }

    if (classification === 'RECEIVED_USD' || classification === 'EXCHANGED_USD') {
      if (settings.automationEnabled) {
        const parsed = smsParserService.parseExchange(payload.body);
        const reference = parsed?.reference ?? smsHash;
        await automationQueueService.enqueue({
          id: `sms-${reference}-${Date.now()}`,
          type: settings.transferMethod === 'DARA_SALAAM_BANK' ? 'sms_bank_deposit' : 'sms_direct_transfer',
          priority: 2,
          source: 'sms',
          amount: parsed?.amount,
          reference,
          dedupeKey: reference,
          transferMethod: settings.transferMethod,
          destinationAccount: settings.accountNumber,
          onDuplicate: async reason => {
            duplicateGuardService.rememberSmsHash(smsHash);
            await loggingService.log(
              'system',
              reason === 'duplicate_key' ? 'Duplicate SMS skipped' : 'Balance transfer already covered SMS event',
            );
          },
          run: async () => {
            if (duplicateGuardService.hasSmsHash(smsHash)) {
              return;
            }
            duplicateGuardService.rememberSmsHash(smsHash);
            const stillAllowed = await subscriptionGuardService.canRunAutomation();
            if (!stillAllowed) {
              await notificationService.show('Subscription expired', 'Automation is locked until the subscription is renewed.');
              return;
            }
            await loggingService.log('sms_received', `SMS received from ${payload.sender}`);
            await exchangeAutomationEngine.process(payload);
          },
        });
      } else {
        duplicateGuardService.rememberSmsHash(smsHash);
        await loggingService.log('sms_received', `SMS received from ${payload.sender}`);
        await loggingService.log('system', `SMS automation disabled; ${classification} message ignored`);
      }
      return;
    }

    if (settings.monitoring898Enabled && is898Sender(payload.sender)) {
      if (looksLikeOutgoingTransferConfirmation(payload.body)) {
        duplicateGuardService.rememberSmsHash(smsHash);
        await loggingService.log('system', '898 transfer confirmation ignored to prevent duplicate automation');
        return;
      }

      if (looksLikeIncomingBalanceTrigger(payload.body) && looksLikeBalanceMessage(payload.body)) {
        const parsedBalance = smsParserService.parseBalance(payload.body);
        await automationQueueService.enqueue({
          id: `balance-sms-${smsHash}-${Date.now()}`,
          type: settings.transferMethod === 'DARA_SALAAM_BANK' ? 'balance_bank_deposit' : 'balance_direct_transfer',
          priority: 3,
          source: '898_balance_sms',
          amount: parsedBalance ? truncateToTwoDecimals(parsedBalance.balance) : undefined,
          reference: smsHash,
          dedupeKey: smsHash,
          transferMethod: settings.transferMethod,
          destinationAccount: settings.accountNumber,
          onDuplicate: async () => {
            duplicateGuardService.rememberSmsHash(smsHash);
            await loggingService.log('system', 'Duplicate 898 balance event skipped');
          },
          run: async () => {
            if (duplicateGuardService.hasSmsHash(smsHash)) {
              return;
            }
            duplicateGuardService.rememberSmsHash(smsHash);
            const stillAllowed = await subscriptionGuardService.canRunAutomation();
            if (!stillAllowed) {
              await notificationService.show('Subscription expired', 'Automation is locked until the subscription is renewed.');
              return;
            }
            const balanceResult = await balanceMonitoringEngine.process(payload);
            await loggingService.log(
              'system',
              `898 incoming balance route selected: handled=${balanceResult.handled} reason=${balanceResult.reason ?? 'none'}`,
            );
          },
        });
        return;
      }

      duplicateGuardService.rememberSmsHash(smsHash);
      await loggingService.log('system', '898 SMS ignored because it did not match an incoming balance trigger');
      return;
    }

    duplicateGuardService.rememberSmsHash(smsHash);
    await loggingService.log('sms_received', `SMS received from ${payload.sender}`);
    await loggingService.log('system', 'SMS ignored because it did not match a supported automation format');
  }

  async processPendingMessages() {
    const pending = await smsNative.getPendingMessages();
    for (const item of pending) {
      await this.processSms(item);
    }
  }

  subscribe() {
    if (this.subscribed || !smsEventEmitter) {
      return;
    }
    smsEventEmitter.addListener('SarifSmsReceived', (payload: SmsPayload) => {
      void this.processSms(payload);
    });
    this.subscribed = true;
  }

  async startBackgroundMonitoring() {
    if (BackgroundActions.isRunning()) {
      useAppStore.getState().setBackgroundRunning(true);
      await loggingService.log('system', 'Foreground balance service started');
      return;
    }

    const task = async (taskDataArguments?: BackgroundTaskData) => {
      const delay = taskDataArguments?.delay ?? 6000;
      while (BackgroundActions.isRunning()) {
        try {
          await transactionConfirmationService.expireOutstanding();
          await this.processPendingMessages();
          await periodicBalanceCheckerService.tick();
          if (useAppStore.getState().settings.periodicBalanceCheckerEnabled) {
            await loggingService.log('system', 'Background balance check executed');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await loggingService.log('transaction_failed', `Background balance check failed: ${message}`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    };

    await BackgroundActions.start(task, BACKGROUND_OPTIONS);
    useAppStore.getState().setBackgroundRunning(true);
    await loggingService.log('system', 'Foreground balance service started');
  }

  async stopBackgroundMonitoring() {
    if (BackgroundActions.isRunning()) {
      await BackgroundActions.stop();
      await loggingService.log('system', 'Foreground balance service stopped');
    }
    useAppStore.getState().setBackgroundRunning(false);
  }
}

export const automationService = new AutomationService();
