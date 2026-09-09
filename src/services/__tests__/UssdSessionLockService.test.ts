import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {UssdSessionLockService} from '../UssdSessionLockService';
import {accessibilityNative} from '../../native/SarifNative';
import {loggingService} from '../LoggingService';

jest.mock('../../native/SarifNative', () => ({
  accessibilityNative: {
    isAutomationActive: jest.fn(),
    isUssdWindowVisible: jest.fn(),
    dismissVisibleUssdWindow: jest.fn(),
    registerActiveUssdSession: jest.fn(),
    clearActiveUssdSession: jest.fn(),
  },
}));

jest.mock('../LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
  },
}));

const mockedAccessibility = accessibilityNative as jest.Mocked<typeof accessibilityNative>;
const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;

describe('UssdSessionLockService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAccessibility.isAutomationActive.mockResolvedValue(false);
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);
    mockedAccessibility.dismissVisibleUssdWindow.mockResolvedValue(false);
    mockedAccessibility.registerActiveUssdSession.mockResolvedValue(undefined);
    mockedAccessibility.clearActiveUssdSession.mockResolvedValue(undefined);
    mockedLogging.log.mockResolvedValue(undefined);
  });

  it('releases immediately after a clean terminal result without the old 10 second post wait', async () => {
    const service = new UssdSessionLockService();
    const onRelease = jest.fn();
    service.setReleaseCallback(onRelease);
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'DIRECT_TRANSFER-1',
      startedAt: Date.now(),
      currentFlow: 'DIRECT_TRANSFER',
      state: 'SUCCESS',
    };

    await service.release('DIRECT_TRANSFER-1');

    expect(service.getActiveSession()).toEqual({isActive: false, state: 'IDLE'});
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD popup dismissed');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Post-result 10s wait skipped');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Session lock released immediately');
  });

  it('releases a failed MMI/network terminal session only after the popup disappears', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'BALANCE_CHECK-MMI',
      startedAt: Date.now(),
      currentFlow: 'BALANCE_CHECK',
      state: 'FAILED',
    };
    mockedAccessibility.isUssdWindowVisible
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockedAccessibility.dismissVisibleUssdWindow.mockResolvedValue(true);

    await service.release('BALANCE_CHECK-MMI');

    expect(mockedAccessibility.dismissVisibleUssdWindow).toHaveBeenCalledTimes(1);
    expect(service.getActiveSession()).toEqual({isActive: false, state: 'IDLE'});
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD_SESSION_RELEASED_AFTER_ERROR');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD session released');
  });

  it('skips the pre-dial clean-idle wait after a safe release when no USSD window is visible', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {lastReleaseSafeForImmediateDial: boolean}).lastReleaseSafeForImmediateDial = true;

    const sessionId = await service.acquire('BALANCE_CHECK', {wait: false});

    expect(sessionId).toContain('BALANCE_CHECK-');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Pre-dial clean idle wait skipped');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD session started');
    expect(mockedAccessibility.registerActiveUssdSession).toHaveBeenCalledWith(
      sessionId,
      'BALANCE_CHECK',
      expect.any(Number),
    );
  });

  it('clears native ownership only for the released session id', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'DIRECT_TRANSFER-A',
      startedAt: Date.now(),
      currentFlow: 'DIRECT_TRANSFER',
      state: 'SUCCESS',
    };
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);

    await service.release('DIRECT_TRANSFER-B');

    expect(service.getActiveSession()).toMatchObject({
      isActive: true,
      sessionId: 'DIRECT_TRANSFER-A',
    });
    expect(mockedAccessibility.clearActiveUssdSession).not.toHaveBeenCalled();

    await service.release('DIRECT_TRANSFER-A');

    expect(mockedAccessibility.clearActiveUssdSession).toHaveBeenCalledWith('DIRECT_TRANSFER-A');
    expect(service.getActiveSession()).toEqual({isActive: false, state: 'IDLE'});
  });

  it('uses network settling when a session is not in a terminal state', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'BANK_DEPOSIT-1',
      startedAt: Date.now(),
      currentFlow: 'BANK_DEPOSIT',
      state: 'WAITING_SCREEN_VISIBLE',
    };
    const waitForDelayedResponse = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

    await service.release('BANK_DEPOSIT-1', {waitForDelayedResponse});

    expect(waitForDelayedResponse).toHaveBeenCalled();
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Network settling used because session unsafe');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Delayed response received during settling');
  });

  it('does not enter network settling when a clean balance result popup disappears after a short delay', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'BALANCE_CHECK-1',
      startedAt: Date.now(),
      currentFlow: 'BALANCE_CHECK',
      state: 'SUCCESS',
    };
    mockedAccessibility.isUssdWindowVisible
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockedAccessibility.dismissVisibleUssdWindow.mockResolvedValue(true);

    await service.release('BALANCE_CHECK-1');

    expect(service.getActiveSession()).toEqual({isActive: false, state: 'IDLE'});
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD popup dismissed');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Post-result 10s wait skipped');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Session lock released immediately');
    expect(mockedLogging.log).not.toHaveBeenCalledWith('system', 'Entering NETWORK_SETTLING');
  });

  it('does not release a stale USSD lock while a popup is still visible', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'DIRECT_TRANSFER-STALE',
      startedAt: Date.now() - 181_000,
      currentFlow: 'DIRECT_TRANSFER',
      state: 'DIALING',
    };
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(true);
    mockedAccessibility.dismissVisibleUssdWindow.mockResolvedValue(false);

    const released = await service.releaseIfStaleAndNoWindowVisible('watchdog_ussd_session_stale', 180_000);

    expect(released).toBe(false);
    expect(service.getActiveSession().isActive).toBe(true);
    expect(mockedAccessibility.dismissVisibleUssdWindow).toHaveBeenCalled();
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD lock not released because popup visible');
  });

  it('keeps an old lock active when popup state is unresolved through isActive', () => {
    const service = new UssdSessionLockService();
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'DIRECT_TRANSFER-STALE',
      startedAt: Date.now() - 600_000,
      currentFlow: 'DIRECT_TRANSFER',
      state: 'DIALING',
    };

    expect(service.isActive()).toBe(true);
    expect(service.getActiveSession().isActive).toBe(true);
    expect(mockedLogging.log).not.toHaveBeenCalledWith('system', 'Stale USSD session lock cleared');
  });

  it('does not let repeated automation triggers bypass an active stale lock', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'BANK_DEPOSIT-STALE',
      startedAt: Date.now() - 600_000,
      currentFlow: 'BANK_DEPOSIT',
      state: 'WAITING_SCREEN_VISIBLE',
    };

    const acquired = await service.acquire('DIRECT_TRANSFER', {wait: false});

    expect(acquired).toBeUndefined();
    expect(service.getActiveSession()).toMatchObject({
      isActive: true,
      sessionId: 'BANK_DEPOSIT-STALE',
    });
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD lock prevented duplicate session');
  });

  it('keeps a stale lock active when popup visibility cannot be verified', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'DIRECT_TRANSFER-STALE',
      startedAt: Date.now() - 181_000,
      currentFlow: 'DIRECT_TRANSFER',
      state: 'DIALING',
    };
    mockedAccessibility.isUssdWindowVisible.mockRejectedValue(new Error('visibility unavailable'));

    const released = await service.releaseIfStaleAndNoWindowVisible('watchdog_ussd_session_stale', 180_000);

    expect(released).toBe(false);
    expect(service.getActiveSession().isActive).toBe(true);
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD lock not released because popup visible');
  });

  it('releases a stale USSD lock when no popup is visible', async () => {
    const service = new UssdSessionLockService();
    const onRelease = jest.fn();
    service.setReleaseCallback(onRelease);
    (service as unknown as {session: unknown}).session = {
      isActive: true,
      sessionId: 'DIRECT_TRANSFER-STALE',
      startedAt: Date.now() - 181_000,
      currentFlow: 'DIRECT_TRANSFER',
      state: 'DIALING',
    };
    mockedAccessibility.isUssdWindowVisible.mockResolvedValue(false);

    const released = await service.releaseIfStaleAndNoWindowVisible('watchdog_ussd_session_stale', 180_000);

    expect(released).toBe(true);
    expect(service.getActiveSession()).toEqual({isActive: false, state: 'IDLE'});
    expect(onRelease).toHaveBeenCalled();
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Stale USSD session detected');
  });
});
