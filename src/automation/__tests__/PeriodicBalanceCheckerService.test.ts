import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {PeriodicBalanceCheckerService} from '../PeriodicBalanceCheckerService';
import {automationCoordinator} from '../../services/AutomationCoordinator';
import {loggingService} from '../../services/LoggingService';
import {transactionRepository} from '../../repositories/TransactionRepository';
import {balanceCheckRepository} from '../../repositories/BalanceCheckRepository';
import {duplicateGuardService} from '../../services/DuplicateGuardService';
import {subscriptionGuardService} from '../../services/SubscriptionGuardService';
import {useAppStore} from '../../store/useAppStore';
import {automationLockService} from '../../services/AutomationLockService';
import {automationQueueService} from '../../services/AutomationQueueService';
import {ussdSessionLockService} from '../../services/UssdSessionLockService';

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

// Mocked (not the real class): these liveness tests exercise the CONTRACT
// PeriodicBalanceCheckerService relies on -- it registers one listener via
// addIdleListener and reacts when that listener fires -- not
// AutomationLockService's own internal acquire/release/staleness logic,
// which is covered separately in AutomationLockService.test.ts. Using the
// real singleton here would also leak one listener per test (each `new
// PeriodicBalanceCheckerService()` registers again on the same shared
// instance), since Jest does not reset real module-level singletons between
// `it()` blocks in one file.
jest.mock('../../services/AutomationLockService', () => ({
  automationLockService: {
    addIdleListener: jest.fn(),
    updateActiveJobReference: jest.fn(),
  },
}));

const mockedCoordinator = automationCoordinator as jest.Mocked<typeof automationCoordinator>;
const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;
const mockedTransactions = transactionRepository as jest.Mocked<typeof transactionRepository>;
const mockedBalanceChecks = balanceCheckRepository as jest.Mocked<typeof balanceCheckRepository>;
const mockedDuplicateGuard = duplicateGuardService as jest.Mocked<typeof duplicateGuardService>;
const mockedSubscriptionGuard = subscriptionGuardService as jest.Mocked<typeof subscriptionGuardService>;
const mockedStore = useAppStore as jest.Mocked<typeof useAppStore>;
const mockedLock = automationLockService as jest.Mocked<typeof automationLockService>;
const mockedQueue = automationQueueService as jest.Mocked<typeof automationQueueService>;
const mockedUssdSession = ussdSessionLockService as jest.Mocked<typeof ussdSessionLockService>;

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

describe('PeriodicBalanceCheckerService -- Sprint 5 continuous-cycle liveness and re-arm', () => {
  let service: PeriodicBalanceCheckerService;

  const getIdleListener = (): (() => void) => {
    const call = mockedLock.addIdleListener.mock.calls[0];
    if (!call) {
      throw new Error('addIdleListener was not registered by the constructor');
    }
    return call[0] as () => void;
  };

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
    mockedUssdSession.isUssdBusy.mockResolvedValue(false);
    mockedQueue.enqueue.mockResolvedValue({status: 'started'} as never);
  });

  it('1. schedules exactly one next cycle after a normal successful run() completion', async () => {
    mockedCoordinator.executeBalanceInquiry.mockResolvedValue(0);

    await service.run();

    const scheduledCalls = mockedLogging.log.mock.calls.filter(
      call => call[1] === 'CONTINUOUS_NEXT_CYCLE_SCHEDULED delayMs=0',
    );
    expect(scheduledCalls).toHaveLength(1);
    expect(service.getSnapshot().nextScheduledAt).toBe(1_000_000);
  });

  it('2. defers (does not drop) a continuous cycle when the queue reports the automation lock is still busy', async () => {
    mockedQueue.enqueue.mockResolvedValue({status: 'duplicate'} as never);

    await service.tick();

    expect(service.getSnapshot().pendingCycleRequested).toBe(true);
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'CONTINUOUS_CYCLE_DEFERRED_BUSY status=duplicate');
  });

  it('3. re-arms exactly one next balance check once the automation lock reports idle', async () => {
    mockedQueue.enqueue.mockResolvedValue({status: 'duplicate'} as never);
    await service.tick();
    expect(service.getSnapshot().pendingCycleRequested).toBe(true);

    const idleListener = getIdleListener();
    idleListener();

    expect(service.getSnapshot().pendingCycleRequested).toBe(false);
    expect(mockedLogging.log).toHaveBeenCalledWith(
      'system',
      'Deferred continuous cycle resuming now that automation lock is idle',
    );
    expect(service.getSnapshot().nextScheduledAt).toBe(1_000_000);
    const scheduledCalls = mockedLogging.log.mock.calls.filter(
      call => call[1] === 'CONTINUOUS_NEXT_CYCLE_SCHEDULED delayMs=0',
    );
    expect(scheduledCalls).toHaveLength(1);
  });

  it('4. coalesces repeated tick attempts while a cycle is already pending, without enqueueing again', async () => {
    mockedQueue.enqueue.mockResolvedValue({status: 'skipped'} as never);
    await service.tick();
    expect(mockedQueue.enqueue).toHaveBeenCalledTimes(1);

    await service.tick();
    await service.tick();

    expect(mockedQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'CONTINUOUS_CYCLE_ALREADY_PENDING');
  });

  it('5. a redundant background-worker tick while a cycle is actively running triggers no duplicate operation', async () => {
    let resolveInquiry: (value: number) => void = () => {};
    mockedCoordinator.executeBalanceInquiry.mockImplementation(
      () => new Promise<number>(resolve => {
        resolveInquiry = resolve;
      }),
    );
    const runPromise = service.run();

    await service.tick();
    expect(mockedQueue.enqueue).not.toHaveBeenCalled();

    resolveInquiry(0);
    await runPromise;
  });

  it('6. does not resume monitoring when continuous mode/automation is switched off while a cycle is pending', async () => {
    mockedQueue.enqueue.mockResolvedValue({status: 'duplicate'} as never);
    await service.tick();
    expect(service.getSnapshot().pendingCycleRequested).toBe(true);

    mockedStore.getState.mockReturnValue({
      settings: {...continuousSettings(), periodicBalanceCheckerEnabled: false},
      setLastDetectedBalance: jest.fn(),
    } as unknown as ReturnType<typeof useAppStore.getState>);

    const idleListener = getIdleListener();
    idleListener();

    // onAutomationLockIdle() always clears the pending flag and defers to
    // scheduleContinuousCycle's own settings guard, which no-ops here.
    expect(service.getSnapshot().pendingCycleRequested).toBe(false);
    const scheduledCalls = mockedLogging.log.mock.calls.filter(
      call => typeof call[1] === 'string' && call[1].startsWith('CONTINUOUS_NEXT_CYCLE_SCHEDULED'),
    );
    expect(scheduledCalls).toHaveLength(0);

    mockedQueue.enqueue.mockClear();
    await service.tick();
    expect(mockedQueue.enqueue).not.toHaveBeenCalled();
  });

  it('7. never invokes a fresh balance-inquiry run while a cycle is deferred and pending', async () => {
    mockedQueue.enqueue.mockResolvedValue({status: 'duplicate'} as never);

    await service.tick();

    expect(mockedCoordinator.executeBalanceInquiry).not.toHaveBeenCalled();
    expect(mockedTransactions.create).not.toHaveBeenCalled();
  });

  it('8. a deferred cycle becomes eligible again and actually re-enqueues once the lock frees', async () => {
    mockedQueue.enqueue.mockResolvedValueOnce({status: 'duplicate'} as never);
    await service.tick();
    expect(mockedQueue.enqueue).toHaveBeenCalledTimes(1);

    mockedQueue.enqueue.mockResolvedValue({status: 'started'} as never);
    const idleListener = getIdleListener();
    idleListener();

    await jest.advanceTimersByTimeAsync(0);

    expect(mockedQueue.enqueue).toHaveBeenCalledTimes(2);
  });

  it('9. monitoring resumes with exactly one next cycle scheduled after a transfer-triggering cycle completes', async () => {
    mockedCoordinator.executeBalanceInquiry.mockResolvedValue(500);
    mockedTransactions.findRecentTransferDuplicate.mockResolvedValue(undefined as never);
    mockedTransactions.create.mockResolvedValue(undefined as never);
    mockedCoordinator.buildPeriodicBalanceTransferUssd.mockReturnValue('*828*1#');
    mockedCoordinator.executeDirectTransfer.mockResolvedValue({status: 'success'} as never);

    await service.run();

    const scheduledCalls = mockedLogging.log.mock.calls.filter(
      call => call[1] === 'CONTINUOUS_NEXT_CYCLE_SCHEDULED delayMs=0',
    );
    expect(scheduledCalls).toHaveLength(1);
    expect(service.getSnapshot().nextScheduledAt).toBe(1_000_000);
  });

  it('10. a failed cycle still uses the existing 30s backoff and logs CONTINUOUS_CYCLE_COMPLETED failed=true', async () => {
    mockedCoordinator.executeBalanceInquiry.mockRejectedValue(new Error('Balance check automation failed.'));

    await service.run();

    expect(service.getSnapshot().nextScheduledAt).toBe(1_000_000 + 30_000);
    expect(mockedLogging.log).toHaveBeenCalledWith(
      'system',
      expect.stringMatching(/^CONTINUOUS_CYCLE_COMPLETED durationMs=\d+ failed=true$/),
    );
  });

  it('11. re-arming after a deferred cycle only enqueues a fresh balance_check job, never a direct transfer replay', async () => {
    mockedQueue.enqueue.mockResolvedValueOnce({status: 'duplicate'} as never);
    await service.tick();

    mockedQueue.enqueue.mockResolvedValue({status: 'started'} as never);
    const idleListener = getIdleListener();
    idleListener();
    await jest.advanceTimersByTimeAsync(0);

    for (const call of mockedQueue.enqueue.mock.calls) {
      expect((call[0] as {type: string}).type).toBe('balance_check');
    }
    expect(mockedCoordinator.executeDirectTransfer).not.toHaveBeenCalled();
    expect(mockedCoordinator.executeBankDeposit).not.toHaveBeenCalled();
  });

  it('12. a transient tick failure inside the internally-scheduled timer still re-arms via the existing 30s backoff', async () => {
    mockedCoordinator.executeBalanceInquiry.mockResolvedValue(0);
    await service.run();

    mockedSubscriptionGuard.canRunAutomation.mockRejectedValueOnce(new Error('transient check failure'));
    await jest.advanceTimersByTimeAsync(0);

    expect(service.getSnapshot().nextScheduledAt).toBe(1_000_000 + 30_000);
    expect(mockedLogging.log).toHaveBeenCalledWith(
      'system',
      'Balance checker tick failed: transient check failure',
    );

    mockedSubscriptionGuard.canRunAutomation.mockResolvedValue(true);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(mockedQueue.enqueue).toHaveBeenCalledTimes(1);
  });
});
