import {describe, expect, it, jest, beforeEach, afterEach} from '@jest/globals';
import {automationLockService} from '../AutomationLockService';
import {transactionConfirmationService} from '../TransactionConfirmationService';
import {transactionRepository} from '../../repositories/TransactionRepository';
import {loggingService} from '../LoggingService';
import {confirmationSmsParserService} from '../ConfirmationSmsParserService';
import {UssdFinalResult} from '../../types';

// This file deliberately uses the REAL AutomationLockService singleton and
// the REAL TransactionConfirmationService singleton together -- not mocks of
// each other -- because that is exactly the interaction the Balance-Priority
// audit (SARIFPRO_BALANCE_PRIORITY_AND_SPEED_AUDIT.md, finding P0-1) found
// was never exercised: unit tests for TransactionConfirmationService mocked
// AutomationLockService entirely, so a reference-identity mismatch between
// the job descriptor acquire()d and the transaction reference passed to
// startAwaitingConfirmation() went undetected. Only the outer dependencies
// (repository, logging, dashboard, notifications, SMS parsing) are mocked.

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

const mockedRepo = transactionRepository as jest.Mocked<typeof transactionRepository>;
const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;
const mockedParser = confirmationSmsParserService as jest.Mocked<typeof confirmationSmsParserService>;

const unknownResult = (): UssdFinalResult => ({
  status: 'unknown_result',
  classification: 'UNKNOWN_RESULT',
  transactionType: 'unknown',
  message: '<-ADEEGA SARIFKA-> Fariin aan la garanayn. OK',
  failureReason: 'unknown_or_unexpected_ussd_result',
  errorCode: 'unknown_or_unexpected_ussd_result',
  dismissed: true,
  timestamp: Date.now(),
});

describe('AutomationLockService + TransactionConfirmationService integration (Balance-priority audit P0-1)', () => {
  beforeEach(async () => {
    jest.useFakeTimers({now: 1_000_000});
    jest.clearAllMocks();
    mockedLogging.log.mockResolvedValue(undefined);
    mockedRepo.markAwaitingConfirmation.mockResolvedValue(true as never);
    mockedRepo.findConfirmationMatch.mockResolvedValue(undefined as never);
    // Defensive: the real singleton's lock state persists across it() blocks
    // in this file -- force it idle in case a prior test left it BUSY.
    await automationLockService.release();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('holds the real automation lock for an UNKNOWN result on a job acquired the same way PeriodicBalanceCheckerService.tick() does (no reference)', async () => {
    const acquired = await automationLockService.acquire({
      id: 'balance-check-1000000',
      type: 'balance_check',
      priority: 4,
      source: 'periodic_balance_checker',
      dedupeKey: 'periodic_balance_checker',
      // no `reference` -- matches tick()'s real enqueue call exactly
    });
    expect(acquired).toBe(true);

    const transactionReference = 'PBC-1000000';
    // The exact two-line sequence PeriodicBalanceCheckerService.run() now performs.
    automationLockService.updateActiveJobReference(transactionReference);
    await transactionConfirmationService.startAwaitingConfirmation(transactionReference, unknownResult());

    // Before the fix, this would already be false -- release()/markExternalRelease()
    // silently failed to match the job, and the lock (in the real production
    // flow) would have been released moments later by AutomationQueueService's
    // own finally block regardless of the pending 898 confirmation.
    expect(automationLockService.getState()).toBe('BUSY');
    expect(automationLockService.isExternalRelease('balance-check-1000000')).toBe(true);

    // Unconditional release (no jobId) for test cleanup only -- release()
    // with no argument always clears whatever job is currently active.
    await automationLockService.release();
  });

  it('releases the real lock once a matching 898 SMS reconciles a job acquired with a mismatched reference (BalanceMonitoringEngine pattern)', async () => {
    const acquired = await automationLockService.acquire({
      id: 'balance-sms-hash123-1000000',
      type: 'balance_direct_transfer',
      priority: 3,
      source: '898_balance_sms',
      dedupeKey: 'hash123',
      reference: 'hash123', // matches AutomationService.processSms()'s job.reference = smsHash
    });
    expect(acquired).toBe(true);

    const transactionReference = 'BAL-1000000';
    automationLockService.updateActiveJobReference(transactionReference);
    await transactionConfirmationService.startAwaitingConfirmation(transactionReference, unknownResult());
    expect(automationLockService.getState()).toBe('BUSY');

    mockedRepo.findConfirmationMatch.mockResolvedValue({
      id: 5,
      reference: transactionReference,
      status: 'awaiting_confirmation',
    } as never);
    mockedParser.parse.mockReturnValue({transactionType: 'direct_transfer', amount: 1} as never);
    await transactionConfirmationService.processSms('898', 'confirmation body', Date.now());

    expect(mockedRepo.completeWithConfirmation).toHaveBeenCalledWith(5, expect.anything(), 'confirmed_by_898_sms');
    expect(automationLockService.getState()).toBe('IDLE');
  });

  it('still releases immediately for a CONFIRMED_SUCCESS result on the same no-reference job shape (no regression to the fast path)', async () => {
    await automationLockService.acquire({
      id: 'balance-check-1000001',
      type: 'balance_check',
      priority: 4,
      source: 'periodic_balance_checker',
      dedupeKey: 'periodic_balance_checker',
    });

    const transactionReference = 'PBC-1000001';
    automationLockService.updateActiveJobReference(transactionReference);
    await transactionConfirmationService.startAwaitingConfirmation(transactionReference, {
      status: 'completed',
      classification: 'DIRECT_TRANSFER_SUCCESS',
      transactionType: 'direct_transfer',
      message: 'Ayaad u dirtay $1.00 Jane(252638724820)',
      dismissed: true,
      timestamp: Date.now(),
    });

    expect(automationLockService.getState()).toBe('IDLE');
  });
});
