import {AutomationPreview} from '../types';
import {smsParserService} from './SmsParserService';
import {useAppStore} from '../store/useAppStore';
import {automationCoordinator} from './AutomationCoordinator';
import {truncateToTwoDecimals, resolveTransferDestination, formatTransferAmountForInput} from '../utils/ussd';

class TestModeService {
  previewSms(body: string): AutomationPreview {
    const exchange = smsParserService.parseExchange(body);
    if (exchange) {
      const settings = useAppStore.getState().settings;
      const amountToTransfer = truncateToTwoDecimals(exchange.amount);
      const daraAmount = formatTransferAmountForInput(amountToTransfer);
      const canTransferExchange =
        settings.transferMethod === 'DARA_SALAAM_BANK'
          ? Boolean(settings.pin2 && /^\d{6}$/.test(settings.bankPin) && amountToTransfer > 0)
          : (exchange.classification === 'RECEIVED_USD' || exchange.classification === 'EXCHANGED_USD') &&
            Boolean(settings.accountNumber && settings.shortcode && settings.pin1);
      const transferDestination = resolveTransferDestination(settings);
      return {
        kind: 'exchange',
        parsed: {
          classification: exchange.classification,
          amount: exchange.amount,
          receivedAmount: exchange.receivedAmount,
          balanceAmount: exchange.balanceAmount,
          transferAmount: amountToTransfer,
          amountSource: exchange.amountSource,
          phone: exchange.phone,
          reference: exchange.reference,
          transferDestination,
          transferMethod: settings.transferMethod,
          daraAmountToSend: settings.transferMethod === 'DARA_SALAAM_BANK' ? daraAmount : undefined,
          raw: exchange.raw,
        },
        ussdPreview:
          canTransferExchange && settings.transferMethod === 'DARA_SALAAM_BANK'
            ? '*800#'
            : canTransferExchange
              ? automationCoordinator.buildExchangeTransferUssd(settings, amountToTransfer)
              : undefined,
        canAutomate: canTransferExchange,
        reason: canTransferExchange
          ? undefined
          : settings.transferMethod === 'DARA_SALAAM_BANK'
            ? 'PIN2, a 6-digit Bank PIN, and a positive amount are required for Dara-Salaam Bank automation'
            : 'Account, shortcode, and PIN1 are required for exchange automation',
      };
    }

    const balance = smsParserService.parseBalance(body);
    if (balance) {
      const settings = useAppStore.getState().settings;
      const balanceToTransfer = truncateToTwoDecimals(balance.balance);
      const canAutomate = balanceToTransfer >= settings.minimumBalanceThreshold;
      return {
        kind: 'balance',
        parsed: {
          balance: balance.balance,
          transferBalance: balanceToTransfer,
          transferMethod: settings.transferMethod,
          raw: balance.raw,
        },
        ussdPreview:
          canAutomate && settings.transferMethod === 'DARA_SALAAM_BANK'
            ? '*800#'
            : canAutomate
              ? automationCoordinator.buildPeriodicBalanceTransferUssd(settings, balanceToTransfer)
              : undefined,
        canAutomate,
        reason: canAutomate ? undefined : 'Below minimum threshold',
      };
    }

    return {
      kind: 'unknown',
      parsed: {},
      canAutomate: false,
      reason: 'No supported pattern matched',
    };
  }
}

export const testModeService = new TestModeService();
