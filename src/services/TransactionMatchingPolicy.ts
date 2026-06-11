import {TransactionStatus} from '../types';

export const CONFIRMATION_MATCH_WINDOW_MS = 10 * 60 * 1000;
export const CONFIRMATION_AMOUNT_TOLERANCE = 0.001;

export const CONFIRMABLE_TRANSACTION_STATUSES: TransactionStatus[] = [
  'pending',
  'running',
  'awaiting_confirmation',
  'completed',
  'failed',
  'unknown_result',
];

export const confirmationAmountsMatch = (left: number, right: number) =>
  Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < CONFIRMATION_AMOUNT_TOLERANCE;
