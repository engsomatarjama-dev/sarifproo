import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {
  ACCESSIBILITY_EVENT_STALE_MS,
  AUTOMATION_LOCK_STALE_MS,
  BALANCE_CYCLE_STALE_MS,
  BACKGROUND_HEARTBEAT_STALE_MS,
  BANK_DEPOSIT_STALE_MS,
  QUEUE_ITEM_STALE_MS,
  USSD_SESSION_LOCK_STALE_MS,
  AutomationWatchdogService,
} from '../AutomationWatchdogService';
import {periodicBalanceCheckerService} from '../../automation/PeriodicBalanceCheckerService';
import {automationLockService} from '../AutomationLockService';
import {ussdSessionLockService} from '../UssdSessionLockService';
import {automationQueueService} from '../AutomationQueueService';
import {accessibilityNative} from '../../native/SarifNative';
import {loggingService} from '../LoggingService';

jest.mock('../../automation/PeriodicBalanceCheckerService', () => ({
  periodicBalanceCheckerService: {
    getSnapshot: jest.fn(),
    resetStaleCycle: jest.fn(),
  },
}));

jest.mock('../AutomationLockService', () => ({
  automationLockService: {
    getSnapshot: jest.fn(),
    releaseIfStale: jest.fn(),
  },
}));

jest.mock('../UssdSessionLockService', () => ({
  ussdSessionLockService: {
    getSnapshot: jest.fn(),
    releaseIfStaleAndNoWindowVisible: jest.fn(),
  },
}));

jest.mock('../AutomationQueueService', () => ({
  automationQueueService: {
    getSnapshot: jest.fn(),
    triggerRecoveryChecks: jest.fn(),
  },
}));

jest.mock('../../native/SarifNative', () => ({
  accessibilityNative: {
    getAutomationHealth: jest.fn(),
  },
}));

jest.mock('../LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
  },
}));

jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      settings: {
        automationEnabled: true,
        periodicBalanceCheckerEnabled: true,
        monitoring898Enabled: true,
      },
    })),
  },
}));

const mockedBalance = periodicBalanceCheckerService as jest.Mocked<typeof periodicBalanceCheckerService>;
const mockedAutomationLock = automationLockService as jest.Mocked<typeof automationLockService>;
const mockedUssdLock = ussdSessionLockService as jest.Mocked<typeof ussdSessionLockService>;
const mockedQueue = automationQueueService as jest.Mocked<typeof automationQueueService>;
const mockedAccessibility = accessibilityNative as jest.Mocked<typeof accessibilityNative>;
const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;

const idleBalanceSnapshot = () => ({
  running: false,
  currentCycleId: undefined,
  currentCycleStartedAt: undefined,
  lastStartedAt: undefined,
  lastCompletedAt: undefined,
  nextScheduledAt: undefined,
  lastError: undefined,
});

const idleAutomationLockSnapshot = () => ({
  locked: false,
  activeJobId: undefined,
  activeJobType: undefined,
  startedAt: undefined,
  ageMs: 0,
  state: 'IDLE' as const,
});

const idleUssdSnapshot = () => ({
  active: false,
  sessionId: undefined,
  flow: undefined,
  startedAt: undefined,
  ageMs: 0,
  settling: false,
  state: 'IDLE' as const,
  lastKnownWindowVisible: undefined,
});

const emptyQueueSnapshot = () => ({
  queueLength: 0,
  oldestQueuedItemId: undefined,
  oldestQueuedItemType: undefined,
  oldestQueuedItemCreatedAt: undefined,
  oldestQueuedItemAgeMs: 0,
  waitingForSafeUssdRelease: false,
});

describe('AutomationWatchdogService', () => {
  beforeEach(() => {
    jest.useFakeTimers({now: 1_000_000});
    jest.clearAllMocks();
    mockedLogging.log.mockResolvedValue(undefined);
    mockedBalance.getSnapshot.mockReturnValue(idleBalanceSnapshot());
    mockedAutomationLock.getSnapshot.mockReturnValue(idleAutomationLockSnapshot());
    mockedUssdLock.getSnapshot.mockReturnValue(idleUssdSnapshot());
    mockedQueue.getSnapshot.mockReturnValue(emptyQueueSnapshot());
    mockedAccessibility.getAutomationHealth.mockResolvedValue({
      connected: true,
      active: false,
      mode: '',
      lastAccessibilityEventAt: 0,
      lastScreenProcessedAt: 0,
    });
  });

  it('resets a stale balance cycle and lets future checks continue', async () => {
    const service = new AutomationWatchdogService();
    mockedBalance.getSnapshot.mockReturnValue({
      ...idleBalanceSnapshot(),
      running: true,
      currentCycleId: 'cycle-1',
      currentCycleStartedAt: Date.now() - BALANCE_CYCLE_STALE_MS - 1,
    });

    await service.check();

    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Stale balance cycle detected');
    expect(mockedBalance.resetStaleCycle).toHaveBeenCalledWith('watchdog_balance_cycle_stale');
  });

  it('releases stale direct transfer automation locks after 120 seconds', async () => {
    const service = new AutomationWatchdogService();
    mockedAutomationLock.getSnapshot.mockReturnValue({
      locked: true,
      activeJobId: 'job-1',
      activeJobType: 'sms_direct_transfer',
      startedAt: Date.now() - AUTOMATION_LOCK_STALE_MS - 1,
      ageMs: AUTOMATION_LOCK_STALE_MS + 1,
      state: 'BUSY',
    });

    await service.check();

    expect(mockedAutomationLock.releaseIfStale).toHaveBeenCalledWith(
      'watchdog_automation_lock_stale',
      AUTOMATION_LOCK_STALE_MS,
    );
  });

  it('uses the longer stale threshold for Dara-Salaam bank flows', async () => {
    const service = new AutomationWatchdogService();
    mockedAutomationLock.getSnapshot.mockReturnValue({
      locked: true,
      activeJobId: 'job-2',
      activeJobType: 'sms_bank_deposit',
      startedAt: Date.now() - BANK_DEPOSIT_STALE_MS - 1,
      ageMs: BANK_DEPOSIT_STALE_MS + 1,
      state: 'BUSY',
    });

    await service.check();

    expect(mockedAutomationLock.releaseIfStale).toHaveBeenCalledWith(
      'watchdog_automation_lock_stale',
      BANK_DEPOSIT_STALE_MS,
    );
  });

  it('requests stale USSD lock recovery after 180 seconds', async () => {
    const service = new AutomationWatchdogService();
    mockedUssdLock.getSnapshot.mockReturnValue({
      active: true,
      sessionId: 'BALANCE_CHECK-1',
      flow: 'BALANCE_CHECK',
      startedAt: Date.now() - USSD_SESSION_LOCK_STALE_MS - 1,
      ageMs: USSD_SESSION_LOCK_STALE_MS + 1,
      settling: false,
      state: 'DIALING',
      lastKnownWindowVisible: false,
    });

    await service.check();

    expect(mockedUssdLock.releaseIfStaleAndNoWindowVisible).toHaveBeenCalledWith(
      'watchdog_ussd_session_stale',
      USSD_SESSION_LOCK_STALE_MS,
    );
  });

  it('logs stale queue items and triggers recovery checks', async () => {
    const service = new AutomationWatchdogService();
    mockedQueue.getSnapshot.mockReturnValue({
      queueLength: 1,
      oldestQueuedItemId: 'queued-1',
      oldestQueuedItemType: 'sms_direct_transfer',
      oldestQueuedItemCreatedAt: Date.now() - QUEUE_ITEM_STALE_MS - 1,
      oldestQueuedItemAgeMs: QUEUE_ITEM_STALE_MS + 1,
      waitingForSafeUssdRelease: false,
    });

    await service.check();

    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Queue stale detected');
    expect(mockedQueue.triggerRecoveryChecks).toHaveBeenCalled();
  });

  it('restarts a stale background worker heartbeat safely', async () => {
    const service = new AutomationWatchdogService();
    const restart = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    service.setWorkerRestartHandler(restart);
    service.recordWorkerHeartbeat();
    jest.setSystemTime(Date.now() + BACKGROUND_HEARTBEAT_STALE_MS + 1);

    await service.check();

    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Worker heartbeat stale');
    expect(restart).toHaveBeenCalled();
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Worker restarted');
  });

  it('warns on stale Accessibility only while automation is active', async () => {
    const service = new AutomationWatchdogService();
    mockedAccessibility.getAutomationHealth.mockResolvedValue({
      connected: true,
      active: true,
      mode: 'PERIODIC_BALANCE_CHECKER',
      lastAccessibilityEventAt: Date.now() - ACCESSIBILITY_EVENT_STALE_MS - 1,
      lastScreenProcessedAt: 0,
    });

    await service.check();

    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Accessibility stale detected');
    expect(mockedQueue.triggerRecoveryChecks).toHaveBeenCalled();
  });

  it('does nothing for normal active automation below thresholds', async () => {
    const service = new AutomationWatchdogService();
    mockedBalance.getSnapshot.mockReturnValue({
      ...idleBalanceSnapshot(),
      running: true,
      currentCycleId: 'cycle-2',
      currentCycleStartedAt: Date.now() - 10_000,
    });
    mockedAutomationLock.getSnapshot.mockReturnValue({
      locked: true,
      activeJobId: 'job-3',
      activeJobType: 'balance_check',
      startedAt: Date.now() - 10_000,
      ageMs: 10_000,
      state: 'BUSY',
    });

    await service.check();

    expect(mockedBalance.resetStaleCycle).not.toHaveBeenCalled();
    expect(mockedAutomationLock.releaseIfStale).not.toHaveBeenCalled();
    expect(mockedUssdLock.releaseIfStaleAndNoWindowVisible).not.toHaveBeenCalled();
    expect(mockedQueue.triggerRecoveryChecks).not.toHaveBeenCalled();
  });
});
