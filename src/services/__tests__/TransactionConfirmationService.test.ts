import {describe, expect, it, jest, beforeEach} from '@jest/globals';
import {transactionConfirmationService} from '../TransactionConfirmationService';
import {transactionRepository} from '../../repositories/TransactionRepository';
import {automationLockService} from '../AutomationLockService';
import {loggingService} from '../LoggingService';
import {dashboardService} from '../DashboardService';

jest.mock('../../repositories/TransactionRepository', () => ({
  transactionRepository: {
    completeFromUssdResult: jest.fn(),
    updateResult: jest.fn(),
    markAwaitingConfirmation: jest.fn(),
  },
}));

jest.mock('../AutomationLockService', () => ({
  automationLockService: {
    release: jest.fn(),
    markExternalRelease: jest.fn(),
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

jest.mock('../ConfirmationSmsParserService', () => ({
  confirmationSmsParserService: {
    parse: jest.fn(),
  },
}));

describe('TransactionConfirmationService terminal recovery handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks terminal USSD errors failed and does not wait for 898 confirmation', async () => {
    await transactionConfirmationService.startAwaitingConfirmation('REF-1', {
      status: 'failed',
      classification: 'FAILED_RESULT',
      transactionType: 'direct_transfer',
      message: 'Invalid menu, please select valid option.',
      failureReason: 'invalid menu',
      errorCode: 'invalid_menu',
      dismissed: true,
      timestamp: Date.now(),
    });

    expect(transactionRepository.updateResult).toHaveBeenCalledWith('REF-1', expect.objectContaining({
      status: 'failed',
      failureReason: 'invalid menu',
      errorCode: 'invalid_menu',
    }));
    expect(transactionRepository.markAwaitingConfirmation).not.toHaveBeenCalled();
    expect(automationLockService.release).toHaveBeenCalledWith('REF-1');
    expect(loggingService.log).toHaveBeenCalledWith(
      'transaction_failed',
      'Terminal USSD error finalized without 898 confirmation wait',
    );
    expect(dashboardService.refresh).toHaveBeenCalled();
  });

  it('marks unknown terminal shells unknown and still releases automation', async () => {
    await transactionConfirmationService.startAwaitingConfirmation('REF-2', {
      status: 'unknown_result',
      classification: 'UNKNOWN_RESULT',
      transactionType: 'unknown',
      message: '<-ADEEGA SARIFKA-> Fariin aan la garanayn. OK',
      failureReason: 'unknown_or_unexpected_ussd_result',
      errorCode: 'unknown_or_unexpected_ussd_result',
      dismissed: true,
      timestamp: Date.now(),
    });

    expect(transactionRepository.updateResult).toHaveBeenCalledWith('REF-2', expect.objectContaining({
      status: 'unknown_result',
      errorCode: 'unknown_or_unexpected_ussd_result',
    }));
    expect(transactionRepository.markAwaitingConfirmation).not.toHaveBeenCalled();
    expect(automationLockService.release).toHaveBeenCalledWith('REF-2');
  });
});
