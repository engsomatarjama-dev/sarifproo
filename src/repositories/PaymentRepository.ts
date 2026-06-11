import {databaseService} from '../database';
import {Payment} from '../types';

const mapRow = (row: any): Payment => ({
  id: row.id,
  amount: Number(row.amount),
  reference: row.reference,
  status: row.status,
  timestamp: Number(row.timestamp),
});

export const paymentRepository = {
  async create(payment: Payment) {
    await databaseService.executeSql(
      `INSERT INTO payments (amount, reference, status, timestamp) VALUES (?, ?, ?, ?)`,
      [payment.amount, payment.reference, payment.status, payment.timestamp],
    );
  },

  async list() {
    const result = await databaseService.executeSql(`SELECT * FROM payments ORDER BY timestamp DESC`);
    return result.rows.raw().map(mapRow);
  },
};
