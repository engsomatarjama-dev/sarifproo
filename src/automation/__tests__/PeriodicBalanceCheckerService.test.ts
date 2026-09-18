import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {PeriodicBalanceCheckerService} from '../PeriodicBalanceCheckerService';
import {automationCoordinator} from '../../services/AutomationCoordinator';
import {loggingService} from '../../services/LoggingService';
import {transactionRepository} from '../../repositories/TransactionRepository';
import {balanceCheckRepository} from '../../repositories/BalanceCheckRepository';
import {duplicateGuardService} from '../../services/DuplicateGuardService';
import {subscriptionGuardService} from '../../services/SubscriptionGuardService';
import {useAppStore} from '../../store/useAppStore';

jest.mock('../../native/SarifNative', () => ({
  accessibilityNative: {},
}));

jest.mock('../../repositories/BalanceCheckRepository', () => ({
  balanceCheckRepository: {
    create: jest.fn(),
  },
}));

jest.mock('../../services/DuplicateGuardService', () => ({
  duplicateGuardService: {
    getLastBalanceCheckTimestamp: jest.fn(),
    canTransferPeriodicBalance: jest.fn(),
    rememberBalanceCheckNow: jest.fn(),
    rememberPeriodicBalanceTransfer: jest.fn(),
  },
}));

jest.mock('../../services/LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
  },
}));

jest.mock('../../services/NotificationService', () => ({
  notificationService: {
    show: jest.fn(),
  },
}));

jest.mock('../../services/SubscriptionGuardService', () => ({
  subscriptionGuardService: {
    canRunAutomation: jest.fn(),
  },
}));

jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock('../../services/AutomationCoordinator', () => ({
  automationCoordinator: {
    executeBalanceInquiry: jest.fn(),
    executeBankDeposit: jest.fn(),
    executeDirectTransfer: jest.fn(),
    buildPeriodicBalanceTransferUssd: jest.fn(),
  },
}));

jest.mock('../../services/DashboardService', () => ({
  dashboardService: {
    refresh: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));

jest.mock('../../repositories/TransactionRepository', () => ({
  transactionRepository: {
    create: jest.fn(),
    findRecentTransferDuplicate: jest.fn(),
    updateResult: jest.fn(),
  },
}));

jest.mock('../../services/TransactionConfirmationService', () => ({
  transactionConfirmationService: {
    startAwaitingConfirmation: jest.fn(),
  },
}));

jest.mock('../../services/AutomationQueueService', () => ({
  automationQueueService: {
    enqueue: jest.fn(),
  },
}));

jest.mock('../../services/UssdSessionLockService', () => ({
  ussdSessionLockService: {
    isUssdBusy: jest.fn(),
  },
}));

jest.mock('../../services/TimingLogService', () => ({
  timingLogService: {
    log: jest.fn(),
  },
}));

const mockedCoordinator = automationCoordinator as jest.Mocked<typeof automationCoordinator>;
const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;
const mockedTransactions = transactionRepository as jest.Mocked<typeof transactionRepository>;
const mockedBalanceChecks = balanceCheckRepository as jest.Mocked<typeof balanceCheckRepository>;
const mockedDuplicateGuard = duplicateGuardService as jest.Mocked<typeof duplicateGuardService>;
const mockedSubscriptionGuard = subscriptionGuardService as jest.Mocked<typeof subscriptionGuardService>;
const mockedStore = useAppStore as jest.Mocked<typeof useAppStore>;

const continuousSettings = () => ({
  automationEnabled: true,
  periodicBalanceCheckerEnabled: true,
  monitoring898Enabled: false,
  balanceCheckIntervalMinutes: 0 as const,
  minimumBalanceThreshold: 1,
  maxTransferAmount: 100000,
  transferMethod: 'DIRECT_TRANSFER' as const,
  accountNumber: '1234567',
  shortcode: '828',
  pin1: '1234',
  pin2: '',
  bankPin: '',
  ussdAutomationSpeed: 'SAFE' as const,
});

describe('PeriodicBalanceCheckerService -- Sprint 4 MMI-triggered balance-check retry', () => {
  let service: PeriodicBalanceCheckerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({now: 1_000_000});
    service = new PeriodicBalanceCheckerService();
    mockedStore.getState.mockReturnValue({
      settings: continuousSettings(),
      setLastDetectedBalance: jest.fn(),
    } as unknown as ReturnType<typeof useAppStore.getState>);
    mockedBalanceChecks.create.mockResolvedValue(undefined as never);
    mockedDuplicateGuard.getLastBalanceCheckTimestamp.mockReturnValue(0);
    mockedDuplicateGuard.rememberBalanceCheckNow.mockReturnValue(undefined);
    mockedDuplicateGuard.canTransferPeriodicBalance.mockReturnValue(true);
    mockedSubscriptionGuard.canRunAutomation.mockResolvedValue(true);
    mockedLogging.log.mockResolvedValue(undefined);
  });

  it('schedules the existing 30s failed-cycle backoff (not a tight retry loop) and logs USSD_MMI_BALANCE_RETRY_SCHEDULED for a dismissed MMI/network failure', async () => {
    mockedCoordinator.executeBalanceInquiry.mockRejectedValue(new Error('Balance check automation failed: mmi_network_error'));

    await service.run();

    expect(service.getSnapshot().nextScheduledAt).toBe(1_000_000 + 30_000);
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD_MMI_BALANCE_RETRY_SCHEDULED');
    // The failure happened at the balance-inquiry step itself -- no
    // transfer decision was ever reached, so nothing here should have
    // touched transfer-duplicate detection or created a transaction record.
    expect(mockedTransactions.findRecentTransferDuplicate).not.toHaveBeenCalled();
    expect(mockedTransactions.create).not.toHaveBeenCalled();
  });

  it('still uses the same 30s backoff, but does not log the MMI-specific diagnostic, for a non-MMI failure', async () => {
    mockedCoordinator.executeBalanceInquiry.mockRejectedValue(new Error('Balance check automation failed.'));

    await service.run();

    expect(service.getSnapshot().nextScheduledAt).toBe(1_000_000 + 30_000);
    expect(mockedLogging.log).not.toHaveBeenCalledWith('system', 'USSD_MMI_BALANCE_RETRY_SCHEDULED');
  });

  it('does not schedule the failed-cycle backoff or log the MMI diagnostic on a normal successful cycle', async () => {
    mockedCoordinator.executeBalanceInquiry.mockResolvedValue(0);

    await service.run();

    // A zero/no-transferable balance completes cleanly with the normal
    // 0-delay continuous-mode scheduling, not the 30s failure backoff.
    expect(service.getSnapshot().nextScheduledAt).toBe(1_000_000);
    expect(mockedLogging.log).not.toHaveBeenCalledWith('system', 'USSD_MMI_BALANCE_RETRY_SCHEDULED');
  });
});
