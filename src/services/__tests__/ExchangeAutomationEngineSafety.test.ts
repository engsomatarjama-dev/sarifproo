import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {AppSettings} from '../../types';
import {exchangeAutomationEngine} from '../../automation/ExchangeAutomationEngine';
import {smsParserService} from '../SmsParserService';
import {duplicateGuardService} from '../DuplicateGuardService';
import {transactionRepository} from '../../repositories/TransactionRepository';
import {automationCoordinator} from '../AutomationCoordinator';
import {loggingService} from '../LoggingService';
import {useAppStore} from '../../store/useAppStore';

jest.mock('../SmsParserService', () => ({
  smsParserService: {
    parseExchange: jest.fn(),
  },
}));

jest.mock('../DuplicateGuardService', () => ({
  duplicateGuardService: {
    hasReference: jest.fn(),
    rememberReference: jest.fn(),
  },
}));

jest.mock('../../repositories/TransactionRepository', () => ({
  transactionRepository: {
    exists: jest.fn(),
    findRecentTransferDuplicate: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    updateResult: jest.fn(),
  },
}));

jest.mock('../AutomationCoordinator', () => ({
  automationCoordinator: {
    buildExchangeTransferUssd: jest.fn(),
    executeDirectTransfer: jest.fn(),
    executeBankDeposit: jest.fn(),
  },
}));

jest.mock('../LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
  },
}));

jest.mock('../DashboardService', () => ({
  dashboardService: {
    refresh: jest.fn(),
  },
}));

jest.mock('../NotificationService', () => ({
  notificationService: {
    show: jest.fn(),
  },
}));

jest.mock('../TransactionConfirmationService', () => ({
  transactionConfirmationService: {
    startAwaitingConfirmation: jest.fn(),
  },
}));

jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

const baseSettings: AppSettings = {
  accountNumber: '4636240',
  pin1: '1122',
  pin2: '3344',
  bankPin: '123456',
  shortcode: '806',
  transferMethod: 'DIRECT_TRANSFER',
  ussdAutomationSpeed: 'FAST',
  automationEnabled: true,
  monitoring898Enabled: true,
  periodicBalanceCheckerEnabled: false,
  balanceCheckIntervalMinutes: 5,
  minimumBalanceThreshold: 0,
  maxTransferAmount: 1000,
};

const parsedExchange = {
  reference: '14807170160',
  amount: 2.5,
  receivedAmount: 2.5,
  classification: 'EXCHANGED_USD' as const,
  phone: '252634422749',
  raw: 'Waxaad $2.5 u sariftay SLSH25,000 NAME(252634422749)',
};

describe('ExchangeAutomationEngine financial safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (smsParserService.parseExchange as jest.Mock).mockReturnValue(parsedExchange);
    (duplicateGuardService.hasReference as jest.Mock).mockReturnValue(false);
    (transactionRepository.exists as jest.Mock).mockResolvedValue(false as never);
    (transactionRepository.findRecentTransferDuplicate as jest.Mock).mockResolvedValue(undefined as never);
  });

  it('rejects invalid direct-transfer destination before creating a transaction or dialing USSD', async () => {
    (useAppStore.getState as jest.Mock).mockReturnValue({
      settings: {...baseSettings, accountNumber: ''},
    });

    const result = await exchangeAutomationEngine.process({
      sender: 'Telesom',
      body: parsedExchange.raw,
      timestamp: 1_790_000_000_000,
    });

    expect(result).toMatchObject({handled: false, reason: 'Account number is invalid.'});
    expect(transactionRepository.create).not.toHaveBeenCalled();
    expect(automationCoordinator.buildExchangeTransferUssd).not.toHaveBeenCalled();
    expect(automationCoordinator.executeDirectTransfer).not.toHaveBeenCalled();
    expect(loggingService.log).toHaveBeenCalledWith(
      'transaction_failed',
      'Exchange automation rejected before transfer start: Account number is invalid.',
    );
  });

  it('rejects invalid Dara-Salaam bank settings before creating a transaction or starting the bank flow', async () => {
    (useAppStore.getState as jest.Mock).mockReturnValue({
      settings: {...baseSettings, transferMethod: 'DARA_SALAAM_BANK', bankPin: '12345'},
    });

    const result = await exchangeAutomationEngine.process({
      sender: 'Telesom',
      body: parsedExchange.raw,
      timestamp: 1_790_000_000_000,
    });

    expect(result).toMatchObject({handled: false, reason: 'Bank PIN must be exactly 6 digits.'});
    expect(transactionRepository.create).not.toHaveBeenCalled();
    expect(automationCoordinator.executeBankDeposit).not.toHaveBeenCalled();
    expect(loggingService.log).toHaveBeenCalledWith(
      'transaction_failed',
      'Exchange automation rejected before transfer start: Bank PIN must be exactly 6 digits.',
    );
  });
});
