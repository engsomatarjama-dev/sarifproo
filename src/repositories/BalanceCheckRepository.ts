import {databaseService} from '../database';
import {BalanceCheck} from '../types';

const mapRow = (row: any): BalanceCheck => ({
  id: row.id,
  balance: Number(row.balance),
  transferAmount: Number(row.transfer_amount),
  status: row.status,
  source: row.source,
  timestamp: Number(row.timestamp),
});

export const balanceCheckRepository = {
  async create(check: BalanceCheck) {
    await databaseService.executeSql(
      `INSERT INTO balance_checks (balance, transfer_amount, status, source, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [check.balance, check.transferAmount, check.status, check.source, check.timestamp],
    );
  },

  async getLast() {
    const result = await databaseService.executeSql(`SELECT * FROM balance_checks ORDER BY timestamp DESC LIMIT 1`);
    const rows = result.rows.raw();
    return rows[0] ? mapRow(rows[0]) : undefined;
  },

  async getLastTransfer() {
    const result = await databaseService.executeSql(
      `SELECT * FROM balance_checks WHERE status = 'triggered_transfer' ORDER BY timestamp DESC LIMIT 1`,
    );
    const rows = result.rows.raw();
    return rows[0] ? mapRow(rows[0]) : undefined;
  },
};
