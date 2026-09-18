import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {UssdAutomationService} from '../UssdAutomationService';
import {accessibilityNative, ussdNative} from '../../native/SarifNative';
import {ussdSessionLockService} from '../UssdSessionLockService';
import {useAppStore} from '../../store/useAppStore';
import {loggingService} from '../LoggingService';

jest.mock('../../native/SarifNative', () => ({
  accessibilityNative: {
    isEnabled: jest.fn(),
    setAutomationSpeed: jest.fn(),
    armBalanceCheckAutomation: jest.fn(),
    armPinAutomation: jest.fn(),
    getBalanceCheckAutomationState: jest.fn(),
    getBalanceCheckResult: jest.fn(),
    getBalanceCheckResultMessage: jest.fn(),
    getFinalUssdResult: jest.fn(),
    extendAutomation: jest.fn(),
    isAutomationActive: jest.fn(),
    isUssdWindowVisible: jest.fn(),
    dismissVisibleUssdWindow: jest.fn(),
  },
  ussdNative: {
    dialUssd: jest.fn(),
  },
}));

jest.mock('../UssdSessionLockService', () => ({
  ussdSessionLockService: {
    acquire: jest.fn(),
    release: jest.fn(),
    markWaitingScreenVisible: jest.fn(),
    markResponseReceived: jest.fn(),
  },
}));

jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      settings: {ussdAutomationSpeed: 'SAFE'},
    })),
  },
}));

jest.mock('../LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
  },
}));

jest.mock('../TimingLogService', () => ({
  timingLogService: {
    log: jest.fn(),
  },
}));

const mockedAccessibility = accessibilityNative as jest.Mocked<typeof accessibilityNative>;
const mockedUssd = ussdNative as jest.Mocked<typeof ussdNative>;
const mockedUssdLock = ussdSessionLockService as jest.Mocked<typeof ussdSessionLockService>;
const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;

const dismissedFinalResult = (overrides: Partial<Awaited<ReturnType<typeof accessibilityNative.getFinalUssdResult>>> = {}) => ({
  state: 'FINAL_RESULT_ERROR',
  status: 'failed' as const,
  transactionType: 'unknown' as const,
  message: 'Connection problem or invalid MMI code.',
  errorCode: 'invalid_mmi',
  amount: undefined,
  receiverName: undefined,
  receiverPhone: undefined,
  bankAccount: undefined,
  failureReason: 'invalid_mmi',
  dismissed: true,
  timestamp: Date.now(),
  ...overrides,
});

describe('UssdAutomationService -- Sprint 4 operation-aware MMI recovery', () => {
  let service: UssdAutomationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UssdAutomationService();
    mockedAccessibility.isEnabled.mockResolvedValue(true);
    mockedAccessibility.setAutomationSpeed.mockResolvedValue(undefined);
    mockedAccessibility.armBalanceCheckAutomation.mockResolvedValue(undefined);
    mockedAccessibility.armPinAutomation.mockResolvedValue(undefined);
    mockedAccessibility.extendAutomation.mockResolvedValue(undefined);
    mockedUssd.dialUssd.mockResolvedValue(undefined);
    mockedUssdLock.acquire.mockResolvedValue('BALANCE_CHECK-1');
    mockedUssdLock.release.mockResolvedValue(undefined);
    mockedLogging.log.mockResolvedValue(undefined);
  });

  describe('balance-check flow (does not move money)', () => {
    it('tags the thrown error and logs USSD_MMI_DIALOG_CLEARED when the dismissed result is a network/MMI failure', async () => {
      mockedAccessibility.getBalanceCheckAutomationState.mockResolvedValue('BALANCE_FAILED');
      mockedAccessibility.getFinalUssdResult.mockResolvedValue(dismissedFinalResult());

      await expect(service.runPeriodicBalanceCheck()).rejects.toThrow('mmi_network_error');

      expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD_MMI_DIALOG_CLEARED');
      expect(mockedUssdLock.markResponseReceived).toHaveBeenCalledWith('failed');
      // Exactly one dial -- a failed, dismissed MMI result never causes a
      // second USSD attempt from within this layer.
      expect(mockedUssd.dialUssd).toHaveBeenCalledTimes(1);
    });

    it('does not tag the error or log USSD_MMI_DIALOG_CLEARED for a non-MMI balance-check failure', async () => {
      mockedAccessibility.getBalanceCheckAutomationState.mockResolvedValue('BALANCE_FAILED');
      mockedAccessibility.getFinalUssdResult.mockResolvedValue(
        dismissedFinalResult({errorCode: 'invalid_pin', failureReason: 'invalid_pin', message: 'Invalid PIN.'}),
      );

      await expect(service.runPeriodicBalanceCheck()).rejects.toThrow('Balance check automation failed.');

      expect(mockedLogging.log).not.toHaveBeenCalledWith('system', 'USSD_MMI_DIALOG_CLEARED');
    });

    it('does not tag an MMI result that was never actually dismissed', async () => {
      mockedAccessibility.getBalanceCheckAutomationState.mockResolvedValue('BALANCE_FAILED');
      mockedAccessibility.getFinalUssdResult.mockResolvedValue(dismissedFinalResult({dismissed: false}));

      await expect(service.runPeriodicBalanceCheck()).rejects.toThrow('Balance check automation failed.');

      expect(mockedLogging.log).not.toHaveBeenCalledWith('system', 'USSD_MMI_DIALOG_CLEARED');
      expect(mockedUssdLock.markResponseReceived).not.toHaveBeenCalled();
    });
  });

  describe('direct transfer flow (money-moving -- must never auto-resend)', () => {
    it('reports the MMI failure without dialing a second time', async () => {
      mockedAccessibility.getFinalUssdResult.mockResolvedValue(dismissedFinalResult({transactionType: 'direct_transfer'}));

      const result = await service.dial('*828*1234567*10*1234#');

      expect(result.status).toBe('failed');
      expect(mockedLogging.log).toHaveBeenCalledWith('transaction_failed', 'Invalid MMI code detected');
      expect(mockedLogging.log).toHaveBeenCalledWith('system', 'USSD_MMI_DIALOG_CLEARED');
      // The financial safety boundary: exactly one dial for exactly one
      // dial() call, regardless of the MMI failure. Nothing in this layer
      // ever calls dialUssd a second time to "retry" a transfer.
      expect(mockedUssd.dialUssd).toHaveBeenCalledTimes(1);
      expect(mockedUssdLock.markResponseReceived).toHaveBeenCalledWith('failed');
    });
  });
});
