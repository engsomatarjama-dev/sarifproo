import {Transaction, TransactionStatus} from '../types';
import type {AutomationJobType} from './AutomationLockService';
import {truncateToTwoDecimals} from '../utils/ussd';

export const AUTOMATION_LOCK_TIMEOUT_MS = 2 * 60 * 1000;
export const DUPLICATE_TRANSFER_WINDOW_MS = 3 * 60 * 1000;
export const DUPLICATE_TRANSFER_AMOUNT_TOLERANCE = 0.001;

export const DUPLICATE_TRANSFER_STATUSES: TransactionStatus[] = [
  'pending',
  'running',
  'awaiting_confirmation',
  'completed',
];

export const transferAmountsMatch = (left: number, right: number) =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(truncateToTwoDecimals(left) - truncateToTwoDecimals(right)) < DUPLICATE_TRANSFER_AMOUNT_TOLERANCE;

export const isMoneyTransferJobType = (type: AutomationJobType) =>
  type === 'sms_direct_transfer' ||
  type === 'sms_bank_deposit' ||
  type === 'balance_direct_transfer' ||
  type === 'balance_bank_deposit';

export const transactionTypeForJobType = (type: AutomationJobType): Transaction['transactionType'] | undefined => {
  if (type === 'sms_bank_deposit' || type === 'balance_bank_deposit') {
    return 'bank_deposit';
  }
  if (type === 'sms_direct_transfer' || type === 'balance_direct_transfer') {
    return 'direct_transfer';
  }
  return undefined;
};

export const normalizeTransferDestination = (destination?: string) => destination?.trim() ?? '';

export const buildTransferDedupeKey = (input: {
  amount: number;
  transferMethod: string;
  destinationAccount?: string;
  timestamp?: number;
}) => {
  const bucket = Math.floor((input.timestamp ?? Date.now()) / DUPLICATE_TRANSFER_WINDOW_MS);
  return [
    truncateToTwoDecimals(input.amount).toFixed(2),
    input.transferMethod,
    normalizeTransferDestination(input.destinationAccount),
    bucket,
  ].join('|');
};
