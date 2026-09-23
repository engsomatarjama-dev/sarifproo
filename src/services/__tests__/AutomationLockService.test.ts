import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {AutomationLockService} from '../AutomationLockService';
import {accessibilityNative} from '../../native/SarifNative';
import {loggingService} from '../LoggingService';
import {transactionRepository} from '../../repositories/TransactionRepository';
import {ussdSessionLockService} from '../UssdSessionLockService';

jest.mock('../../native/SarifNative', () => ({
  accessibilityNative: {
    resetAutomation: jest.fn(),
    isUssdWindowVisible: jest.fn(),
  },
}));

jest.mock('../LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
  },
}));

jest.mock('../../repositories/TransactionRepository', () => ({
  transactionRepository: {
    updateResult: jest.fn(),
  },
}));

jest.mock('../UssdSessionLockService', () => ({
  ussdSessionLockService: {
    isActive: jest.fn(),
  },
}));

const mockedAccessibility = accessibilityNative as jest.Mocked<typeof accessibilityNative>;
const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;
const mockedTransactions = transactionRepository as jest.Mocked<typeof transactionRepository>;
const mockedUssdLock = ussdSessionLockService as jest.Mocked<typeof ussdSessionLockService>;

const directTransferJob = (overrides: Partial<Parameters<AutomationLockService['acquire']>[0]> = {}) => ({
  id: 'job-1',
  type: 'sms_direct_transfer' as const,
  priority: 1,
  source: 'test',
  reference: 'REF-1',
  dedupeKey: 'dedupe-1',
  ...overrides,
});

describe('AutomationLockService stale recovery vs. active USSD ownership', () => {
  beforeEach(() => {
    jest.useFakeTimers({now: 1_000_000});
    jest.clearAllMocks();
    mockedLogging.log.mockResolvedValue(undefined);
    mockedTransactions.updateResult.mockResolvedValue(undefined);
    mockedAccessibility.resetAutomation.mockResolvedValue(undefined);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);
    mockedUssdLock.isActive.mockReturnValue(false);
  });

  it('does not blindly reset native USSD state while the USSD session lock is still active', async () => {
    const service = new AutomationLockService();
    await service.acquire(directTransferJob());
    mockedUssdLock.isActive.mockReturnValue(true);

    const recovered = await service.recover('max_duration_exceeded');

    expect(recovered).toBe(false);
    expect(mockedAccessibility.resetAutomation).not.toHaveBeenCalled();
    expect(service.getSnapshot().locked).toBe(true);
  });

  it('waits instead of resetting while a USSD/phone window is still visible', async () => {
    const service = new AutomationLockService();
    await service.acquire(directTransferJob());
    mockedUssdLock.isActive.mockReturnValue(false);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(true);

    const recovered = await service.recover('max_duration_exceeded');

    expect(recovered).toBe(false);
    expect(mockedAccessibility.resetAutomation).not.toHaveBeenCalled();
    expect(service.getSnapshot().locked).toBe(true);
  });

  it('recovers stale automation bookkeeping once no USSD session or window remains', async () => {
    const service = new AutomationLockService();
    await service.acquire(directTransferJob());
    mockedUssdLock.isActive.mockReturnValue(false);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);

    const recovered = await service.recover('max_duration_exceeded');

    expect(recovered).toBe(true);
    expect(mockedAccessibility.resetAutomation).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().locked).toBe(false);
  });

  it('does not allow an overlapping USSD operation across repeated watchdog ticks while deferred', async () => {
    const service = new AutomationLockService();
    await service.acquire(directTransferJob());
    mockedUssdLock.isActive.mockReturnValue(true);

    jest.advanceTimersByTime(1);
    await service.releaseIfStale('watchdog_automation_lock_stale', 0);
    jest.advanceTimersByTime(15_000);
    await service.releaseIfStale('watchdog_automation_lock_stale', 0);
    jest.advanceTimersByTime(15_000);
    await service.releaseIfStale('watchdog_automation_lock_stale', 0);

    expect(mockedAccessibility.resetAutomation).not.toHaveBeenCalled();
    const acquiredSecondJob = await service.acquire(directTransferJob({id: 'job-2', reference: 'REF-2'}));
    expect(acquiredSecondJob).toBe(false);
  });

  it('recovers normally once the owned USSD session genuinely finishes', async () => {
    const service = new AutomationLockService();
    await service.acquire(directTransferJob());
    mockedUssdLock.isActive.mockReturnValue(true);
    jest.advanceTimersByTime(1);
    await service.releaseIfStale('watchdog_automation_lock_stale', 0);
    expect(service.getSnapshot().locked).toBe(true);

    mockedUssdLock.isActive.mockReturnValue(false);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);
    jest.advanceTimersByTime(15_000);
    const recovered = await service.releaseIfStale('watchdog_automation_lock_stale', 0);

    expect(recovered).toBe(true);
    expect(mockedAccessibility.resetAutomation).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().locked).toBe(false);
  });

  it('lets a balance-check operation resume after legitimate cleanup without touching transaction records', async () => {
    const service = new AutomationLockService();
    await service.acquire(directTransferJob({id: 'balance-1', type: 'balance_check', reference: undefined}));
    mockedUssdLock.isActive.mockReturnValue(false);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);

    const recovered = await service.recover('max_duration_exceeded');

    expect(recovered).toBe(true);
    expect(mockedTransactions.updateResult).not.toHaveBeenCalled();
    const acquiredNext = await service.acquire(directTransferJob({id: 'balance-2', type: 'balance_check', reference: undefined}));
    expect(acquiredNext).toBe(true);
  });

  it('never automatically replays a money-moving transfer merely because stale recovery occurred', async () => {
    const service = new AutomationLockService();
    await service.acquire(directTransferJob({id: 'transfer-1', reference: 'REF-9'}));
    mockedUssdLock.isActive.mockReturnValue(false);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);

    await service.recover('max_duration_exceeded');

    expect(mockedTransactions.updateResult).toHaveBeenCalledTimes(1);
    expect(mockedTransactions.updateResult).toHaveBeenCalledWith(
      'REF-9',
      expect.objectContaining({status: 'failed', resultMessage: 'automation_timeout_recovery'}),
    );
  });
});

describe('AutomationLockService multi-listener idle notifications (Sprint 5)', () => {
  beforeEach(() => {
    jest.useFakeTimers({now: 1_000_000});
    jest.clearAllMocks();
    mockedLogging.log.mockResolvedValue(undefined);
    mockedTransactions.updateResult.mockResolvedValue(undefined);
    mockedAccessibility.resetAutomation.mockResolvedValue(undefined);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);
    mockedUssdLock.isActive.mockReturnValue(false);
  });

  it('notifies every registered idle listener on release(), not just the first', async () => {
    const service = new AutomationLockService();
    const first = jest.fn();
    const second = jest.fn();
    service.addIdleListener(first);
    service.addIdleListener(second);
    await service.acquire(directTransferJob());

    await service.release('job-1');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps setIdleCallback backward-compatible by registering it as one more listener alongside addIdleListener', async () => {
    const service = new AutomationLockService();
    const legacy = jest.fn();
    const additional = jest.fn();
    service.setIdleCallback(legacy);
    service.addIdleListener(additional);
    await service.acquire(directTransferJob());

    await service.release('job-1');

    expect(legacy).toHaveBeenCalledTimes(1);
    expect(additional).toHaveBeenCalledTimes(1);
  });

  it('notifies all listeners on a successful stale recover(), the same as a plain release()', async () => {
    const service = new AutomationLockService();
    const listener = jest.fn();
    service.addIdleListener(listener);
    await service.acquire(directTransferJob());
    mockedUssdLock.isActive.mockReturnValue(false);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);

    const recovered = await service.recover('max_duration_exceeded');

    expect(recovered).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify idle listeners when recovery is deferred, since the lock is not actually idle yet', async () => {
    const service = new AutomationLockService();
    const listener = jest.fn();
    service.addIdleListener(listener);
    await service.acquire(directTransferJob());
    mockedUssdLock.isActive.mockReturnValue(true);

    const recovered = await service.recover('max_duration_exceeded');

    expect(recovered).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
