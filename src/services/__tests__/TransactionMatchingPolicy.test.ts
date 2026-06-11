import {describe, expect, it} from '@jest/globals';
import {
  CONFIRMABLE_TRANSACTION_STATUSES,
  CONFIRMATION_MATCH_WINDOW_MS,
  confirmationAmountsMatch,
} from '../TransactionMatchingPolicy';

describe('TransactionMatchingPolicy', () => {
  it('matches numeric amount variants used by 898 confirmations', () => {
    expect(confirmationAmountsMatch(0.1, 0.1)).toBe(true);
    expect(confirmationAmountsMatch(0.1, 0.10)).toBe(true);
    expect(confirmationAmountsMatch(1, 1.0)).toBe(true);
    expect(confirmationAmountsMatch(100.9, 100.90)).toBe(true);
  });

  it('uses a strict tolerance for non-equal amounts', () => {
    expect(confirmationAmountsMatch(0.1, 0.102)).toBe(false);
  });

  it('searches statuses and window required for confirmation correction', () => {
    expect(CONFIRMABLE_TRANSACTION_STATUSES).toEqual([
      'pending',
      'running',
      'awaiting_confirmation',
      'completed',
      'failed',
      'unknown_result',
    ]);
    expect(CONFIRMATION_MATCH_WINDOW_MS).toBe(10 * 60 * 1000);
  });
});
