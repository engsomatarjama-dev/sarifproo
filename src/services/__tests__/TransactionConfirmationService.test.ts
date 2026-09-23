import {describe, expect, it, jest, beforeEach, afterEach} from '@jest/globals';
import {transactionConfirmationService} from '../TransactionConfirmationService';
import {transactionRepository} from '../../repositories/TransactionRepository';
import {automationLockService} from '../AutomationLockService';
import {loggingService} from '../LoggingService';
import {dashboardService} from '../DashboardService';
import {confirmationSmsParserService} from '../ConfirmationSmsParserService';
import {UssdFinalResult} from '../../types';

jest.mock('../../repositories/TransactionRepository', () => ({
  transactionRepository: {
    completeFromUssdResult: jest.fn(),
    updateResult: jest.fn(),
    markAwaitingConfirmation: jest.fn(),
    findConfirmationMatch: jest.fn(),
    completeWithConfirmation: jest.fn(),
    existsConfirmation: jest.fn(),
    createFromConfirmation: jest.fn(),
    hasRecentUnconfirmedTransferCandidate: jest.fn(),
    expireAwaitingConfirmation: jest.fn(),
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

});

describe('TransactionConfirmationService screen-first verification policy (Sprint: SCREEN-FIRST MONEY TRANSFER VERIFICATION)', () => {
  const mockedRepo = transactionRepository as jest.Mocked<typeof transactionRepository>;
  const mockedLock = automationLockService as jest.Mocked<typeof automationLockService>;
  const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;
  const mockedParser = confirmationSmsParserService as jest.Mocked<typeof confirmationSmsParserService>;

  const successResult = (overrides: Partial<UssdFinalResult> = {}): UssdFinalResult => ({
    status: 'completed',
    classification: 'DIRECT_TRANSFER_SUCCESS',
    transactionType: 'direct_transfer',
    message: 'Ayaad u dirtay $1.00 Jane(252638724820)',
    dismissed: true,
    timestamp: Date.now(),
    ...overrides,
  });

  const failedResult = (overrides: Partial<UssdFinalResult> = {}): UssdFinalResult => ({
    status: 'failed',
    classification: 'FAILED_RESULT',
    transactionType: 'direct_transfer',
    message: 'Invalid menu, please select valid option.',
    failureReason: 'invalid menu',
    errorCode: 'invalid_menu',
    dismissed: true,
    timestamp: Date.now(),
    ...overrides,
  });

  const unknownResult = (overrides: Partial<UssdFinalResult> = {}): UssdFinalResult => ({
    status: 'unknown_result',
    classification: 'UNKNOWN_RESULT',
    transactionType: 'unknown',
    message: '<-ADEEGA SARIFKA-> Fariin aan la garanayn. OK',
    failureReason: 'unknown_or_unexpected_ussd_result',
    errorCode: 'unknown_or_unexpected_ussd_result',
    dismissed: true,
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockedRepo.markAwaitingConfirmation.mockResolvedValue(true as never);
    // transactionConfirmationService is a module-level singleton whose
    // pendingConfirmations queue persists across tests. Every
    // startAwaitingConfirmation(unknown_result) call retries that queue via
    // findConfirmationMatch -- default it to "no match" so a stale mock
    // return value from an earlier test can never spuriously complete an
    // unrelated pending item left over from another test.
    mockedRepo.findConfirmationMatch.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    // The UNKNOWN path schedules a real 60s+250ms expiry timer via
    // scheduleExpiry() -- clear it so it can never fire against a later
    // test's (differently mocked) state.
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('1. clear screen success finalizes SUCCESS, never waits for 898, and releases the lock', async () => {
    await transactionConfirmationService.startAwaitingConfirmation('REF-SUCCESS', successResult());

    expect(mockedRepo.completeFromUssdResult).toHaveBeenCalledWith('REF-SUCCESS', expect.objectContaining({status: 'completed'}));
    expect(mockedRepo.markAwaitingConfirmation).not.toHaveBeenCalled();
    expect(mockedLock.markExternalRelease).not.toHaveBeenCalled();
    expect(mockedLock.release).toHaveBeenCalledWith('REF-SUCCESS');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'TRANSFER_SCREEN_SUCCESS_CONFIRMED');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'TRANSFER_SCREEN_CONFIRMED_LOCK_RELEASED');
  });

  it('2. clear screen failure finalizes FAILED immediately with no wait and no transfer retry call', async () => {
    await transactionConfirmationService.startAwaitingConfirmation('REF-FAILED', failedResult());

    expect(mockedRepo.updateResult).toHaveBeenCalledWith('REF-FAILED', expect.objectContaining({status: 'failed'}));
    expect(mockedRepo.markAwaitingConfirmation).not.toHaveBeenCalled();
    expect(mockedLock.release).toHaveBeenCalledWith('REF-FAILED');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'TRANSFER_SCREEN_FAILURE_CONFIRMED');
    // This service never calls any transfer-initiating function itself --
    // structurally impossible for it to trigger a resend.
    expect(mockedRepo.createFromConfirmation).not.toHaveBeenCalled();
  });

  it('3. ambiguous terminal screen stays UNKNOWN and preserves the 898 fallback window', async () => {
    await transactionConfirmationService.startAwaitingConfirmation('REF-UNKNOWN', unknownResult());

    expect(mockedRepo.markAwaitingConfirmation).toHaveBeenCalledWith(
      'REF-UNKNOWN',
      expect.objectContaining({transactionType: 'unknown'}),
      expect.any(Number),
      expect.any(Number),
    );
    expect(mockedRepo.completeFromUssdResult).not.toHaveBeenCalled();
    expect(mockedRepo.updateResult).not.toHaveBeenCalled();
    expect(mockedLock.markExternalRelease).toHaveBeenCalledWith('REF-UNKNOWN');
    // The lock is deliberately NOT released synchronously here -- it stays
    // held (via markExternalRelease) until 898 arrives or the window expires.
    expect(mockedLock.release).not.toHaveBeenCalled();
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'TRANSFER_SCREEN_RESULT_UNKNOWN');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'TRANSFER_898_FALLBACK_STARTED');
  });

  it('4. a late 898 arriving after screen-confirmed SUCCESS reconciles the same transaction, not a new one', async () => {
    mockedRepo.findConfirmationMatch.mockResolvedValue({id: 42, reference: 'REF-SUCCESS', status: 'completed'} as never);
    mockedParser.parse.mockReturnValue({
      transactionType: 'direct_transfer',
      amount: 1,
      reference: 'REF-SUCCESS',
    } as never);

    const result = await transactionConfirmationService.processSms('898', 'confirmation body', Date.now());

    expect(result.matched).toBe(true);
    expect(mockedRepo.completeWithConfirmation).toHaveBeenCalledWith(42, expect.anything(), 'confirmed_by_898_sms');
    expect(mockedRepo.createFromConfirmation).not.toHaveBeenCalled();
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'TRANSFER_898_RECONCILED');
    // release() is idempotent -- calling it again on an already-idle lock is safe.
    expect(mockedLock.release).toHaveBeenCalledWith('REF-SUCCESS');
  });

  it('5. a duplicate 898 SMS for an already-recorded confirmation does not create a duplicate transaction', async () => {
    mockedRepo.findConfirmationMatch.mockResolvedValue(undefined);
    mockedRepo.hasRecentUnconfirmedTransferCandidate.mockResolvedValue(false as never);
    mockedRepo.existsConfirmation.mockResolvedValue(true as never);
    mockedParser.parse.mockReturnValue({transactionType: 'direct_transfer', amount: 1} as never);

    const result = await transactionConfirmationService.processSms('898', 'confirmation body', Date.now());

    expect(result.duplicate).toBe(true);
    expect(mockedRepo.createFromConfirmation).not.toHaveBeenCalled();
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'Duplicate 898 confirmation ignored');
  });

  it('6. screen SUCCESS followed by matching 898 SUCCESS results in exactly one transaction (update, never insert)', async () => {
    mockedRepo.findConfirmationMatch.mockResolvedValue({id: 7, reference: 'REF-SUCCESS', status: 'completed'} as never);
    mockedParser.parse.mockReturnValue({transactionType: 'direct_transfer', amount: 1} as never);

    await transactionConfirmationService.processSms('898', 'confirmation body', Date.now());

    expect(mockedRepo.completeWithConfirmation).toHaveBeenCalledTimes(1);
    expect(mockedRepo.createFromConfirmation).not.toHaveBeenCalled();
  });

  it('7. screen FAILURE with later valid 898 reconciliation is marked as an override, safely', async () => {
    mockedRepo.findConfirmationMatch.mockResolvedValue({id: 9, reference: 'REF-FAILED', status: 'failed'} as never);
    mockedParser.parse.mockReturnValue({transactionType: 'direct_transfer', amount: 1} as never);

    await transactionConfirmationService.processSms('898', 'confirmation body', Date.now());

    expect(mockedRepo.completeWithConfirmation).toHaveBeenCalledWith(9, expect.anything(), 'completed_by_898_confirmation');
    expect(mockedLogging.log).toHaveBeenCalledWith('transaction_completed', 'Transaction overridden from failed to completed');
    expect(mockedLogging.log).toHaveBeenCalledWith('system', 'TRANSFER_898_RECONCILED');
  });

  it('10. screen-confirmed success releases the lock synchronously (no old 898-wait delay) -- unlike UNKNOWN, which does not', async () => {
    await transactionConfirmationService.startAwaitingConfirmation('REF-FAST', successResult());
    // The lock is already released by the time startAwaitingConfirmation's
    // promise resolves -- a listener on automationLockService's idle
    // notification (e.g. PeriodicBalanceCheckerService's re-arm from
    // Sprint 5) becomes eligible immediately, not after any 60s window.
    expect(mockedLock.release).toHaveBeenCalledWith('REF-FAST');

    jest.clearAllMocks();
    mockedRepo.markAwaitingConfirmation.mockResolvedValue(true as never);
    await transactionConfirmationService.startAwaitingConfirmation('REF-SLOW', unknownResult());
    expect(mockedLock.release).not.toHaveBeenCalled();
  });

  it('11. a non-matching 898 SMS (amount/destination mismatch) does not blindly complete an unrelated transaction', async () => {
    mockedRepo.findConfirmationMatch.mockResolvedValue(undefined);
    mockedRepo.hasRecentUnconfirmedTransferCandidate.mockResolvedValue(true as never);
    mockedParser.parse.mockReturnValue({transactionType: 'direct_transfer', amount: 999} as never);

    const result = await transactionConfirmationService.processSms('898', 'confirmation body', Date.now());

    expect(result.pending).toBe(true);
    expect(mockedRepo.completeWithConfirmation).not.toHaveBeenCalled();
    expect(mockedRepo.createFromConfirmation).not.toHaveBeenCalled();
  });

  it('12. UNKNOWN never triggers an automatic money resubmission, including after expiry', async () => {
    await transactionConfirmationService.startAwaitingConfirmation('REF-UNKNOWN-2', unknownResult());
    await transactionConfirmationService.expireOutstanding();

    expect(mockedRepo.expireAwaitingConfirmation).toHaveBeenCalled();
    // No code path in this service ever calls a transfer-initiating function --
    // only repository state updates, lock release, and notifications.
    expect(mockedRepo.createFromConfirmation).not.toHaveBeenCalled();
    expect(mockedRepo.completeFromUssdResult).not.toHaveBeenCalled();
  });
});
