import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals';
import {AppSettings} from '../../types';
import {periodicBalanceCheckerService} from '../../automation/PeriodicBalanceCheckerService';
import {automationCoordinator} from '../AutomationCoordinator';
import {transactionConfirmationService} from '../TransactionConfirmationService';
import {transactionRepository} from '../../repositories/TransactionRepository';
import {balanceCheckRepository} from '../../repositories/BalanceCheckRepository';
import {duplicateGuardService} from '../DuplicateGuardService';
import {loggingService} from '../LoggingService';
import {useAppStore} from '../../store/useAppStore';

jest.mock('../AutomationCoordinator', () => ({
  automationCoordinator: {
    executeBalanceInquiry: jest.fn(),
    buildPeriodicBalanceTransferUssd: jest.fn(),
    executeDirectTransfer: jest.fn(),
    executeBankDeposit: jest.fn(),
  },
}));

jest.mock('../TransactionConfirmationService', () => ({
  transactionConfirmationService: {
    startAwaitingConfirmation: jest.fn(),
  },
}));

jest.mock('../../repositories/TransactionRepository', () => ({
  transactionRepository: {
    create: jest.fn(),
    updateResult: jest.fn(),
    findRecentTransferDuplicate: jest.fn(),
  },
}));

jest.mock('../../repositories/BalanceCheckRepository', () => ({
  balanceCheckRepository: {
    create: jest.fn(),
  },
}));

jest.mock('../DuplicateGuardService', () => ({
  duplicateGuardService: {
    canTransferPeriodicBalance: jest.fn(),
    rememberPeriodicBalanceTransfer: jest.fn(),
    rememberBalanceCheckNow: jest.fn(),
    getLastBalanceCheckTimestamp: jest.fn(),
  },
}));

jest.mock('../LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
  },
}));

jest.mock('../NotificationService', () => ({
  notificationService: {
    show: jest.fn(),
  },
}));

jest.mock('../SubscriptionGuardService', () => ({
  subscriptionGuardService: {
    canRunAutomation: jest.fn(),
  },
}));

jest.mock('../../native/SarifNative', () => ({
  accessibilityNative: {
    isEnabled: jest.fn(),
    isAutomationActive: jest.fn(),
  },
}));

jest.mock('../AutomationQueueService', () => ({
  automationQueueService: {
    enqueue: jest.fn(),
  },
}));

jest.mock('../UssdSessionLockService', () => ({
  ussdSessionLockService: {
    isUssdBusy: jest.fn(),
  },
}));

jest.mock('../DashboardService', () => ({
  dashboardService: {
    refresh: jest.fn(),
  },
}));

jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

const settings: AppSettings = {
  accountNumber: '4636240',
  pin1: '1122',
  pin2: '3344',
  bankPin: '123456',
  shortcode: '806',
  transferMethod: 'DIRECT_TRANSFER',
  ussdAutomationSpeed: 'FAST',
  automationEnabled: true,
  monitoring898Enabled: true,
  periodicBalanceCheckerEnabled: true,
  balanceCheckIntervalMinutes: 0,
  minimumBalanceThreshold: 0,
  maxTransferAmount: 1000,
};

describe('PeriodicBalanceCheckerService insufficient-balance recovery', () => {
  const setLastDetectedBalance = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_790_000_000_000);
    jest.clearAllMocks();
    (useAppStore.getState as jest.Mock).mockReturnValue({settings, setLastDetectedBalance});
    (automationCoordinator.executeBalanceInquiry as jest.Mock).mockResolvedValue(10 as never);
    (automationCoordinator.buildPeriodicBalanceTransferUssd as jest.Mock).mockReturnValue('*806*4636240*10*1122#');
    (automationCoordinator.executeDirectTransfer as jest.Mock).mockResolvedValue({
      status: 'failed',
      classification: 'FAILED_RESULT',
      transactionType: 'direct_transfer',
      message: 'Hadhaagaagu kuguma filna. Hadhagaagu waa 5.',
      failureReason: 'insufficient balance',
      errorCode: 'insufficient_balance',
      observedAvailableBalance: 5,
      dismissed: true,
      timestamp: 1_790_000_000_100,
    } as never);
    (transactionConfirmationService.startAwaitingConfirmation as jest.Mock).mockImplementation(
      async (...args: unknown[]) => {
        const reference = args[0] as string;
        const result = args[1] as {status: 'failed'; errorCode?: string};
        await transactionRepository.updateResult(reference, {
          status: result.status,
          transactionType: 'direct_transfer',
          resultMessage: 'Hadhaagaagu kuguma filna. Hadhagaagu waa 5.',
          failureReason: 'insufficient balance',
          errorCode: result.errorCode,
          completedAt: Date.now(),
        });
      },
    );
    (transactionRepository.findRecentTransferDuplicate as jest.Mock).mockResolvedValue(undefined as never);
    (balanceCheckRepository.create as jest.Mock).mockResolvedValue(undefined as never);
    (duplicateGuardService.canTransferPeriodicBalance as jest.Mock).mockReturnValue(true);
    (duplicateGuardService.rememberPeriodicBalanceTransfer as jest.Mock).mockReturnValue(undefined);
    (duplicateGuardService.rememberBalanceCheckNow as jest.Mock).mockReturnValue(undefined);
    (loggingService.log as jest.Mock).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('stores observed available balance, keeps the current transaction failed, and schedules a fresh normal check', async () => {
    await periodicBalanceCheckerService.run();

    expect(transactionRepository.create).toHaveBeenCalledTimes(1);
    expect(transactionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 10,
      status: 'running',
      transactionType: 'direct_transfer',
    }));
    expect(transactionRepository.updateResult).toHaveBeenCalledWith('PBC-1790000000000', expect.objectContaining({
      status: 'failed',
      errorCode: 'insufficient_balance',
    }));
    expect(setLastDetectedBalance).toHaveBeenNthCalledWith(1, 10);
    expect(setLastDetectedBalance).toHaveBeenLastCalledWith(5);
    expect(periodicBalanceCheckerService.getSnapshot().lastObservedAvailableBalance).toBe(5);
    expect(automationCoordinator.executeDirectTransfer).toHaveBeenCalledTimes(1);
    expect(automationCoordinator.executeBankDeposit).not.toHaveBeenCalled();
    expect(loggingService.log).toHaveBeenCalledWith(
      'system',
      'Fresh balance check scheduled after insufficient-balance terminal result',
    );
    expect(periodicBalanceCheckerService.getSnapshot().nextScheduledAt).toBe(1_790_000_000_000);
  });

  it('does not create another transfer while the fresh check waits behind the existing single-session guards', async () => {
    await periodicBalanceCheckerService.run();

    expect(automationCoordinator.executeDirectTransfer).toHaveBeenCalledTimes(1);
    expect(transactionRepository.create).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(0);
    expect(automationCoordinator.executeDirectTransfer).toHaveBeenCalledTimes(1);
    expect(transactionRepository.create).toHaveBeenCalledTimes(1);
  });

  it('schedules a short retry after a balance-check MMI/network terminal error without starting a transfer', async () => {
    (automationCoordinator.executeBalanceInquiry as jest.Mock).mockRejectedValue(
      new Error('Balance check terminal MMI/network error.') as never,
    );

    await periodicBalanceCheckerService.run();

    expect(transactionRepository.create).not.toHaveBeenCalled();
    expect(automationCoordinator.executeDirectTransfer).not.toHaveBeenCalled();
    expect(automationCoordinator.executeBankDeposit).not.toHaveBeenCalled();
    expect(balanceCheckRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      balance: 0,
      transferAmount: 0,
      status: 'failed',
      source: 'periodic_balance_checker',
    }));
    expect(loggingService.log).toHaveBeenCalledWith('system', 'BALANCE_CHECK_RETRY_SCHEDULED');
    expect(periodicBalanceCheckerService.getSnapshot().nextScheduledAt).toBe(1_790_000_010_000);
  });

  it('does not create concurrent sessions or transfers when repeated MMI errors schedule retries', async () => {
    (automationCoordinator.executeBalanceInquiry as jest.Mock).mockRejectedValue(
      new Error('Connection problem or invalid MMI code.') as never,
    );

    await periodicBalanceCheckerService.run();
    await periodicBalanceCheckerService.run();

    expect(transactionRepository.create).not.toHaveBeenCalled();
    expect(automationCoordinator.executeDirectTransfer).not.toHaveBeenCalled();
    expect(automationCoordinator.executeBankDeposit).not.toHaveBeenCalled();
    expect(loggingService.log).toHaveBeenCalledWith('system', 'BALANCE_CHECK_RETRY_SCHEDULED');
  });
});
