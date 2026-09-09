import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {AppSettings} from '../../types';
import {accessibilityNative, ussdNative} from '../../native/SarifNative';
import {useAppStore} from '../../store/useAppStore';
import {loggingService} from '../LoggingService';
import {ussdSessionLockService} from '../UssdSessionLockService';
import {ussdAutomationService} from '../UssdAutomationService';

jest.mock('../../native/SarifNative', () => ({
  accessibilityNative: {
    isEnabled: jest.fn(),
    setAutomationSpeed: jest.fn(),
    armBalanceCheckAutomation: jest.fn(),
    getBalanceCheckAutomationState: jest.fn(),
    getBalanceCheckResult: jest.fn(),
    getBalanceCheckResultMessage: jest.fn(),
    armPinAutomation: jest.fn(),
    getFinalUssdResult: jest.fn(),
  },
  ussdNative: {
    dialUssd: jest.fn(),
  },
}));

jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock('../LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
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

const settings: AppSettings = {
  accountNumber: '4636240',
  pin1: '1122',
  pin2: '3344',
  bankPin: '123456',
  shortcode: '806',
  transferMethod: 'DIRECT_TRANSFER',
  ussdAutomationSpeed: 'FAST',
  automationEnabled: true,
  monitoring898Enabled: false,
  periodicBalanceCheckerEnabled: true,
  balanceCheckIntervalMinutes: 0,
  minimumBalanceThreshold: 0,
  maxTransferAmount: 1000,
};

const mockedAccessibility = accessibilityNative as jest.Mocked<typeof accessibilityNative>;
const mockedUssd = ussdNative as jest.Mocked<typeof ussdNative>;
const mockedLock = ussdSessionLockService as jest.Mocked<typeof ussdSessionLockService>;

describe('UssdAutomationService MMI/network recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAppStore.getState as jest.Mock).mockReturnValue({settings});
    mockedAccessibility.isEnabled.mockResolvedValue(true);
    mockedAccessibility.setAutomationSpeed.mockResolvedValue(undefined);
    mockedAccessibility.armBalanceCheckAutomation.mockResolvedValue(undefined);
    mockedAccessibility.armPinAutomation.mockResolvedValue(undefined);
    mockedUssd.dialUssd.mockResolvedValue(undefined);
    mockedLock.acquire.mockResolvedValue('BALANCE_CHECK-1');
    mockedLock.release.mockResolvedValue(undefined);
    (loggingService.log as jest.Mock).mockResolvedValue(undefined as never);
  });

  it('classifies a balance-check MMI dialog as terminal and requests recovery after OK dismissal', async () => {
    mockedAccessibility.getBalanceCheckAutomationState.mockResolvedValue('BALANCE_FAILED');
    mockedAccessibility.getFinalUssdResult.mockResolvedValue({
      state: 'RESULT_DISMISSED',
      status: 'failed',
      classification: 'FAILED_RESULT',
      transactionType: 'balance_check',
      message: 'Connection problem or invalid MMI code.',
      failureReason: 'invalid mmi code',
      errorCode: 'invalid_mmi',
      dismissed: true,
      timestamp: Date.now(),
    });

    await expect(ussdAutomationService.runPeriodicBalanceCheck()).rejects.toThrow(
      'Balance check terminal MMI/network error.',
    );

    expect(mockedAccessibility.armBalanceCheckAutomation).toHaveBeenCalled();
    expect(mockedUssd.dialUssd).toHaveBeenCalledWith('*800#');
    expect(mockedLock.markWaitingScreenVisible).toHaveBeenCalled();
    expect(mockedLock.markResponseReceived).toHaveBeenCalledWith('failed');
    expect(loggingService.log).toHaveBeenCalledWith('transaction_failed', 'Invalid MMI code detected');
    expect(loggingService.log).toHaveBeenCalledWith('transaction_failed', 'USSD_MMI_ERROR_DETECTED');
    expect(loggingService.log).toHaveBeenCalledWith('system', 'USSD_ERROR_DIALOG_DISMISSED');
    expect(mockedLock.release).toHaveBeenCalledWith('BALANCE_CHECK-1', expect.any(Object));
  });

  it('does not resubmit a money transfer when a direct-transfer MMI dialog is terminal', async () => {
    mockedLock.acquire.mockResolvedValue('DIRECT_TRANSFER-1');
    mockedAccessibility.getFinalUssdResult.mockResolvedValue({
      state: 'RESULT_DISMISSED',
      status: 'failed',
      classification: 'FAILED_RESULT',
      transactionType: 'direct_transfer',
      message: 'Connection problem or invalid MMI code.',
      failureReason: 'invalid mmi code',
      errorCode: 'invalid_mmi',
      dismissed: true,
      timestamp: Date.now(),
    });

    const result = await ussdAutomationService.dial('*806*4636240*10*1122#');

    expect(result).toMatchObject({
      status: 'failed',
      errorCode: 'invalid_mmi',
      dismissed: true,
    });
    expect(mockedUssd.dialUssd).toHaveBeenCalledTimes(1);
    expect(mockedLock.markResponseReceived).toHaveBeenCalledWith('failed');
    expect(loggingService.log).toHaveBeenCalledWith('transaction_failed', 'USSD_MMI_ERROR_DETECTED');
    expect(mockedLock.release).toHaveBeenCalledWith('DIRECT_TRANSFER-1', expect.any(Object));
  });
});
