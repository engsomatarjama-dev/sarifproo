import {AppSettings} from '../types';
import {loggingService} from './LoggingService';
import {ussdAutomationService} from './UssdAutomationService';

type AutomationRequestSource = 'sms' | '898_balance_sms' | 'periodic_balance_checker' | 'manual';

type AutomationRequestContext = {
  source: AutomationRequestSource;
  reference?: string;
};

class AutomationCoordinator {
  buildExchangeTransferUssd(settings: AppSettings, amount: number) {
    return ussdAutomationService.buildExchangeTransferUssd(settings, amount);
  }

  buildBalanceTransferUssd(settings: AppSettings, amount: number) {
    return ussdAutomationService.buildBalanceUssd(settings, amount);
  }

  buildPeriodicBalanceTransferUssd(settings: AppSettings, balance: number) {
    return ussdAutomationService.buildPeriodicBalanceTransferUssd(settings, balance);
  }

  async executeBalanceInquiry(context: AutomationRequestContext) {
    await this.logRequest('balance_inquiry', context);
    return ussdAutomationService.runPeriodicBalanceCheck();
  }

  async executeDirectTransfer(ussd: string, context: AutomationRequestContext) {
    await this.logRequest('direct_transfer', context);
    return ussdAutomationService.dial(ussd);
  }

  async executeBankDeposit(settings: AppSettings, amount: number, context: AutomationRequestContext) {
    await this.logRequest('bank_deposit', context);
    return ussdAutomationService.startDaraSalaamBankDeposit(settings, amount);
  }

  private async logRequest(type: string, context: AutomationRequestContext) {
    await loggingService.log(
      'system',
      `AutomationCoordinator accepted ${type} request from ${context.source}${context.reference ? ` reference ${context.reference}` : ''}`,
    );
  }
}

export const automationCoordinator = new AutomationCoordinator();
