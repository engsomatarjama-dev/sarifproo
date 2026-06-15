import dayjs from 'dayjs';
import {databaseService} from '../database';
import {ConfirmationParseResult, Transaction, UssdFinalResult} from '../types';
import {
  CONFIRMABLE_TRANSACTION_STATUSES,
  CONFIRMATION_MATCH_WINDOW_MS,
  confirmationAmountsMatch,
} from '../services/TransactionMatchingPolicy';
import {
  DUPLICATE_TRANSFER_STATUSES,
  DUPLICATE_TRANSFER_WINDOW_MS,
  normalizeTransferDestination,
  transferAmountsMatch,
} from '../services/DuplicateTransferPolicy';
import {canStartAwaitingConfirmation} from '../services/ConfirmationStatePolicy';

const mapRow = (row: any): Transaction => ({
  id: row.id,
  type: row.type,
  transactionType: row.transaction_type,
  amount: Number(row.amount),
  phone: row.phone,
  reference: row.reference,
  status: row.status,
  smsBody: row.sms_body,
  timestamp: Number(row.timestamp),
  resultMessage: row.result_message ?? undefined,
  failureReason: row.failure_reason ?? undefined,
  errorCode: row.error_code ?? undefined,
  completedAt: row.completed_at ? Number(row.completed_at) : undefined,
  confirmationSource: row.confirmation_source ?? undefined,
  confirmedAmount: row.confirmed_amount !== null && row.confirmed_amount !== undefined ? Number(row.confirmed_amount) : undefined,
  confirmationReference: row.confirmation_reference ?? undefined,
  receiverName: row.receiver_name ?? undefined,
  receiverPhone: row.receiver_phone ?? undefined,
  bankAccount: row.bank_account ?? undefined,
  transactionDate: row.transaction_date ?? undefined,
  confirmationNote: row.confirmation_note ?? undefined,
  confirmationStartedAt: row.confirmation_started_at ? Number(row.confirmation_started_at) : undefined,
  confirmationExpiresAt: row.confirmation_expires_at ? Number(row.confirmation_expires_at) : undefined,
  source: row.source ?? undefined,
  sourceReference: row.source_reference ?? undefined,
  dedupeKey: row.dedupe_key ?? undefined,
  relatedEventId: row.related_event_id ?? undefined,
  transferDestination: row.transfer_destination ?? undefined,
});

export const transactionRepository = {
  async create(transaction: Transaction) {
    await databaseService.executeSql(
      `INSERT INTO transactions (
        type, transaction_type, amount, phone, reference, status, sms_body, timestamp,
        result_message, failure_reason, error_code, completed_at, confirmation_source, confirmed_amount,
        confirmation_reference, receiver_name, receiver_phone, bank_account, transaction_date,
        confirmation_note, confirmation_started_at, confirmation_expires_at,
        source, source_reference, dedupe_key, related_event_id, transfer_destination
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction.type,
        transaction.transactionType ?? transaction.type,
        transaction.amount,
        transaction.phone,
        transaction.reference,
        transaction.status,
        transaction.smsBody,
        transaction.timestamp,
        transaction.resultMessage ?? null,
        transaction.failureReason ?? null,
        transaction.errorCode ?? null,
        transaction.completedAt ?? null,
        transaction.confirmationSource ?? null,
        transaction.confirmedAmount ?? null,
        transaction.confirmationReference ?? null,
        transaction.receiverName ?? null,
        transaction.receiverPhone ?? null,
        transaction.bankAccount ?? null,
        transaction.transactionDate ?? null,
        transaction.confirmationNote ?? null,
        transaction.confirmationStartedAt ?? null,
        transaction.confirmationExpiresAt ?? null,
        transaction.source ?? null,
        transaction.sourceReference ?? null,
        transaction.dedupeKey ?? null,
        transaction.relatedEventId ?? null,
        transaction.transferDestination ?? null,
      ],
    );
  },

  async updateStatus(reference: string, status: Transaction['status']) {
    await databaseService.executeSql(`UPDATE transactions SET status = ? WHERE reference = ? AND status != 'completed'`, [status, reference]);
  },

  async updateResult(
    reference: string,
    result: Pick<Transaction, 'status' | 'transactionType' | 'resultMessage' | 'failureReason' | 'errorCode' | 'completedAt'>,
  ) {
    await databaseService.executeSql(
      `UPDATE transactions
       SET status = ?, transaction_type = ?, result_message = ?, failure_reason = ?, error_code = ?, completed_at = ?
       WHERE reference = ? AND status != 'completed'`,
      [
        result.status,
        result.transactionType ?? null,
        result.resultMessage ?? null,
        result.failureReason ?? null,
        result.errorCode ?? null,
        result.completedAt ?? Date.now(),
        reference,
      ],
    );
  },

  async markAwaitingConfirmation(
    reference: string,
    result: Pick<Transaction, 'transactionType' | 'resultMessage' | 'failureReason' | 'errorCode' | 'completedAt'>,
    confirmationStartedAt = Date.now(),
    confirmationExpiresAt = confirmationStartedAt + 60_000,
  ) {
    const resultSet = await databaseService.executeSql(
      `UPDATE transactions
       SET status = 'awaiting_confirmation',
           transaction_type = COALESCE(?, transaction_type),
           result_message = ?,
           failure_reason = ?,
           error_code = ?,
           completed_at = NULL,
           confirmation_started_at = ?,
           confirmation_expires_at = ?
       WHERE reference = ?
         AND status != 'completed'`,
      [
        result.transactionType ?? null,
        result.resultMessage ?? null,
        result.failureReason ?? null,
        result.errorCode ?? null,
        confirmationStartedAt,
        confirmationExpiresAt,
        reference,
      ],
    );
    return Number(resultSet.rowsAffected ?? 0) > 0;
  },

  canStartAwaitingConfirmation(status: Transaction['status']) {
    return canStartAwaitingConfirmation(status);
  },

  async completeFromUssdResult(reference: string, result: UssdFinalResult) {
    await databaseService.executeSql(
      `UPDATE transactions
       SET status = 'completed',
           transaction_type = COALESCE(?, transaction_type),
           amount = COALESCE(?, amount),
           result_message = ?,
           failure_reason = NULL,
           error_code = NULL,
           completed_at = ?,
           receiver_name = COALESCE(?, receiver_name),
           receiver_phone = COALESCE(?, receiver_phone),
           bank_account = COALESCE(?, bank_account),
           confirmation_expires_at = NULL
       WHERE reference = ?
         AND status != 'completed'`,
      [
        result.transactionType === 'unknown' ? null : result.transactionType,
        Number.isFinite(result.amount) && result.amount && result.amount > 0 ? result.amount : null,
        result.message ?? null,
        Date.now(),
        result.receiverName ?? null,
        result.receiverPhone ?? null,
        result.bankAccount ?? null,
        reference,
      ],
    );
  },

  async completeWithConfirmation(id: number, confirmation: ConfirmationParseResult, note?: string) {
    await databaseService.executeSql(
      `UPDATE transactions
       SET status = 'completed',
           transaction_type = ?,
           amount = ?,
           confirmation_source = '898_sms',
           confirmed_amount = ?,
           confirmation_reference = COALESCE(?, confirmation_reference),
           receiver_name = COALESCE(?, receiver_name),
           receiver_phone = COALESCE(?, receiver_phone),
           bank_account = COALESCE(?, bank_account),
           transaction_date = COALESCE(?, transaction_date),
           confirmation_note = ?,
           failure_reason = NULL,
           error_code = NULL,
           completed_at = ?,
           confirmation_expires_at = NULL
       WHERE id = ?`,
      [
        confirmation.transactionType,
        confirmation.amount,
        confirmation.amount,
        confirmation.reference ?? null,
        confirmation.receiverName ?? null,
        confirmation.receiverPhone ?? null,
        confirmation.bankAccount ?? null,
        confirmation.transactionDate ?? null,
        note ?? null,
        Date.now(),
        id,
      ],
    );
  },

  async createFromConfirmation(confirmation: ConfirmationParseResult, smsHash: string) {
    const reference = confirmation.reference ?? `898-${smsHash}`;
    await this.create({
      type: confirmation.transactionType === 'bank_deposit' ? 'balance_transfer' : 'sms_exchange',
      transactionType: confirmation.transactionType,
      amount: confirmation.amount,
      phone: confirmation.receiverPhone ?? confirmation.bankAccount ?? '',
      reference,
      status: 'completed',
      smsBody: smsHash,
      timestamp: Date.now(),
      completedAt: Date.now(),
      confirmationSource: '898_sms',
      confirmedAmount: confirmation.amount,
      confirmationReference: confirmation.reference,
      receiverName: confirmation.receiverName,
      receiverPhone: confirmation.receiverPhone,
      bankAccount: confirmation.bankAccount,
      transactionDate: confirmation.transactionDate,
      confirmationNote: 'created_from_898_confirmation',
      source: '898_confirmation',
      sourceReference: smsHash,
      transferDestination: confirmation.receiverPhone ?? confirmation.bankAccount,
    });
  },

  async findConfirmationMatch(confirmation: ConfirmationParseResult, now = Date.now()) {
    const result = await databaseService.executeSql(
      `SELECT * FROM transactions
       WHERE status IN (${CONFIRMABLE_TRANSACTION_STATUSES.map(() => '?').join(',')})
         AND COALESCE(confirmation_started_at, timestamp) BETWEEN ? AND ?
       ORDER BY timestamp DESC`,
      [...CONFIRMABLE_TRANSACTION_STATUSES, now - CONFIRMATION_MATCH_WINDOW_MS, now],
    );
    const candidates = result.rows.raw().map(mapRow);
    return candidates.find(candidate => {
      const candidateTransactionType = candidate.transactionType as string | undefined;
      if (
        candidateTransactionType &&
        candidateTransactionType !== 'unknown' &&
        candidateTransactionType !== 'sms_exchange' &&
        candidateTransactionType !== 'balance_transfer' &&
        candidateTransactionType !== confirmation.transactionType
      ) {
        return false;
      }
      if (!confirmationAmountsMatch(Number(candidate.amount), confirmation.amount)) {
        return false;
      }
      if (confirmation.receiverPhone && candidate.receiverPhone && candidate.receiverPhone !== confirmation.receiverPhone) {
        return false;
      }
      if (confirmation.bankAccount && candidate.bankAccount && candidate.bankAccount !== confirmation.bankAccount) {
        return false;
      }
      return true;
    });
  },

  async hasRecentUnconfirmedTransferCandidate(confirmation: ConfirmationParseResult, now = Date.now()) {
    const result = await databaseService.executeSql(
      `SELECT * FROM transactions
       WHERE status IN (${CONFIRMABLE_TRANSACTION_STATUSES.map(() => '?').join(',')})
         AND COALESCE(confirmation_started_at, timestamp) BETWEEN ? AND ?
       ORDER BY timestamp DESC`,
      [...CONFIRMABLE_TRANSACTION_STATUSES, now - CONFIRMATION_MATCH_WINDOW_MS, now],
    );
    const candidates = result.rows.raw().map(mapRow);
    return candidates.some(candidate => confirmationAmountsMatch(Number(candidate.amount), confirmation.amount));
  },

  async existsConfirmation(confirmation: ConfirmationParseResult, smsHash: string) {
    const reference = confirmation.reference ?? `898-${smsHash}`;
    const result = await databaseService.executeSql<{count: number}>(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE reference = ?
          OR confirmation_reference = ?
          OR (confirmation_source = '898_sms'
              AND transaction_type = ?
              AND ABS(confirmed_amount - ?) < ?
              AND COALESCE(receiver_phone, '') = COALESCE(?, '')
              AND COALESCE(bank_account, '') = COALESCE(?, ''))`,
      [
        reference,
        confirmation.reference ?? '',
        confirmation.transactionType,
        confirmation.amount,
        0.001,
        confirmation.receiverPhone ?? '',
        confirmation.bankAccount ?? '',
      ],
    );
    return Number(result.rows.raw()[0]?.count ?? 0) > 0;
  },

  async expireAwaitingConfirmation(now = Date.now()) {
    await databaseService.executeSql(
      `UPDATE transactions
       SET status = 'failed',
           failure_reason = 'confirmation_sms_not_received',
           error_code = 'confirmation_sms_not_received',
           completed_at = NULL
       WHERE status = 'awaiting_confirmation'
         AND confirmation_expires_at IS NOT NULL
         AND confirmation_expires_at <= ?`,
      [now],
    );
  },

  async exists(reference: string) {
    const result = await databaseService.executeSql<{count: number}>(
      `SELECT COUNT(*) as count FROM transactions WHERE reference = ?`,
      [reference],
    );
    const rows = result.rows.raw();
    return Number(rows[0]?.count ?? 0) > 0;
  },

  async findRecentTransferDuplicate(input: {
    amount: number;
    transactionType: NonNullable<Transaction['transactionType']>;
    destinationAccount?: string;
    reference?: string;
    source?: string;
    now?: number;
  }) {
    const now = input.now ?? Date.now();
    const result = await databaseService.executeSql(
      `SELECT * FROM transactions
       WHERE status IN (${DUPLICATE_TRANSFER_STATUSES.map(() => '?').join(',')})
         AND transaction_type = ?
         AND COALESCE(completed_at, confirmation_started_at, timestamp) BETWEEN ? AND ?
       ORDER BY COALESCE(completed_at, confirmation_started_at, timestamp) DESC, timestamp DESC`,
      [
        ...DUPLICATE_TRANSFER_STATUSES,
        input.transactionType,
        now - DUPLICATE_TRANSFER_WINDOW_MS,
        now,
      ],
    );
    const requestedDestination = normalizeTransferDestination(input.destinationAccount);
    const candidates = result.rows.raw().map(mapRow);
    return candidates.find(candidate => {
      if (input.reference && candidate.reference === input.reference) {
        return true;
      }
      if (
        input.source === 'sms' &&
        (candidate.source === 'sms' || (!candidate.source && candidate.type === 'sms_exchange'))
      ) {
        return false;
      }
      if (!transferAmountsMatch(Number(candidate.amount), input.amount)) {
        return false;
      }
      const candidateDestination = normalizeTransferDestination(candidate.transferDestination);
      if (candidateDestination && requestedDestination && candidateDestination !== requestedDestination) {
        return false;
      }
      return true;
    });
  },

  async list(limit = 100) {
    const result = await databaseService.executeSql(
      `SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ?`,
      [limit],
    );
    return result.rows.raw().map(mapRow);
  },

  async getLast() {
    const result = await databaseService.executeSql(`SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 1`);
    const rows = result.rows.raw();
    return rows[0] ? mapRow(rows[0]) : undefined;
  },

  async totalToday() {
    const start = dayjs().startOf('day').valueOf();
    const end = dayjs().endOf('day').valueOf();
    const result = await databaseService.executeSql<{count: number}>(
      `SELECT COUNT(*) as count FROM transactions WHERE timestamp BETWEEN ? AND ?`,
      [start, end],
    );
    return Number(result.rows.raw()[0]?.count ?? 0);
  },

  async totalTransferredAmountToday() {
    const start = dayjs().startOf('day').valueOf();
    const end = dayjs().endOf('day').valueOf();
    const result = await databaseService.executeSql<{total: number}>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE status = 'completed'
         AND transaction_type IN ('direct_transfer', 'bank_deposit')
         AND COALESCE(completed_at, timestamp) BETWEEN ? AND ?`,
      [start, end],
    );
    return Number(result.rows.raw()[0]?.total ?? 0);
  },
};
