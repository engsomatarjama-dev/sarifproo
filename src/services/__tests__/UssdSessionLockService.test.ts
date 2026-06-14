import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {UssdSessionLockService} from '../UssdSessionLockService';
import {accessibilityNative} from '../../native/SarifNative';
import {loggingService} from '../LoggingService';

jest.mock('../../native/SarifNative', () => ({
  accessibilityNative: {
    isAutomationActive: jest.fn(),
    isUssdWindowVisible: jest.fn(),
    dismissVisibleUssdWindow: jest.fn(),
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

  it('skips the pre-dial clean-idle wait after a safe release when no USSD window is visible', async () => {
    const service = new UssdSessionLockService();
    (service as unknown as {lastReleaseSafeForImmediateDial: boolean}).lastReleaseSafeForImmediateDial = true;

    const sessionId = await service.acquire('BALANCE_CHECK', {wait: false});

    expect(sessionId).toContain('BALANCE_CHECK-');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Pre-dial clean idle wait skipped');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD session started');
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
});
