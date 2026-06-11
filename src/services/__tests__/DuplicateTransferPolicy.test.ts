import {describe, expect, it} from '@jest/globals';
import {
  AUTOMATION_LOCK_TIMEOUT_MS,
  DUPLICATE_TRANSFER_STATUSES,
  DUPLICATE_TRANSFER_WINDOW_MS,
  buildTransferDedupeKey,
  isMoneyTransferJobType,
  transactionTypeForJobType,
  transferAmountsMatch,
} from '../DuplicateTransferPolicy';

describe('DuplicateTransferPolicy', () => {
  it('uses a 2 minute automation lock timeout and 3 minute duplicate transfer window', () => {
    expect(AUTOMATION_LOCK_TIMEOUT_MS).toBe(2 * 60 * 1000);
    expect(DUPLICATE_TRANSFER_WINDOW_MS).toBe(3 * 60 * 1000);
  });

  it('matches equivalent transfer amounts after money decimal normalization', () => {
    expect(transferAmountsMatch(10, 10.0)).toBe(true);
    expect(transferAmountsMatch(10.567, 10.56)).toBe(true);
    expect(transferAmountsMatch(0.1, 0.1)).toBe(true);
    expect(transferAmountsMatch(10.56, 10.57)).toBe(false);
  });

  it('only treats money transfer jobs as duplicate-checkable transfer jobs', () => {
    expect(isMoneyTransferJobType('sms_direct_transfer')).toBe(true);
    expect(isMoneyTransferJobType('sms_bank_deposit')).toBe(true);
    expect(isMoneyTransferJobType('balance_direct_transfer')).toBe(true);
    expect(isMoneyTransferJobType('balance_bank_deposit')).toBe(true);
    expect(isMoneyTransferJobType('balance_check')).toBe(false);
    expect(isMoneyTransferJobType('confirmation_898')).toBe(false);
  });

  it('maps transfer jobs to the transaction type stored locally', () => {
    expect(transactionTypeForJobType('sms_direct_transfer')).toBe('direct_transfer');
    expect(transactionTypeForJobType('balance_direct_transfer')).toBe('direct_transfer');
    expect(transactionTypeForJobType('sms_bank_deposit')).toBe('bank_deposit');
    expect(transactionTypeForJobType('balance_bank_deposit')).toBe('bank_deposit');
    expect(transactionTypeForJobType('balance_check')).toBeUndefined();
  });

  it('builds stable amount-method-destination dedupe keys inside the same time bucket', () => {
    const timestamp = Date.UTC(2026, 5, 8, 20, 0, 10);
    expect(
      buildTransferDedupeKey({
        amount: 10.567,
        transferMethod: 'DARA_SALAAM_BANK',
        destinationAccount: '4636240',
        timestamp,
      }),
    ).toBe(
      buildTransferDedupeKey({
        amount: 10.56,
        transferMethod: 'DARA_SALAAM_BANK',
        destinationAccount: '4636240',
        timestamp: timestamp + 30_000,
      }),
    );
  });

  it('checks only active or successful statuses for recent duplicate transfer protection', () => {
    expect(DUPLICATE_TRANSFER_STATUSES).toEqual(['pending', 'running', 'awaiting_confirmation', 'completed']);
  });
});
