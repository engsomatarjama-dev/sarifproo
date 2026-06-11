import {databaseService} from '../database';
import {Subscription} from '../types';

const mapRow = (row: any): Subscription => ({
  id: row.id,
  planType: row.plan_type,
  startDate: row.start_date,
  expiryDate: row.expiry_date,
  status: row.status,
  paymentReference: row.payment_reference,
  createdAt: row.created_at,
});

export const subscriptionRepository = {
  async create(subscription: Subscription) {
    if (!subscription.planType || !subscription.startDate || !subscription.expiryDate || !subscription.status) {
      throw new Error('Invalid subscription record');
    }

    await databaseService.executeSql(
      `INSERT INTO subscriptions (plan_type, start_date, expiry_date, status, payment_reference, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        subscription.planType,
        subscription.startDate,
        subscription.expiryDate,
        subscription.status,
        subscription.paymentReference,
        subscription.createdAt,
      ],
    );
  },

  async updateStatus(id: number, status: Subscription['status']) {
    await databaseService.executeSql(`UPDATE subscriptions SET status = ? WHERE id = ?`, [status, id]);
  },

  async saveCurrent(subscription: Subscription) {
    const latest = await this.getLatest();
    if (latest?.id) {
      await databaseService.executeSql(
        `UPDATE subscriptions
         SET plan_type = ?, start_date = ?, expiry_date = ?, status = ?, payment_reference = ?, created_at = ?
         WHERE id = ?`,
        [
          subscription.planType,
          subscription.startDate,
          subscription.expiryDate,
          subscription.status,
          subscription.paymentReference,
          subscription.createdAt,
          latest.id,
        ],
      );
      return latest.id;
    }

    await this.create(subscription);
    const created = await this.getLatest();
    return created?.id;
  },

  async list() {
    const result = await databaseService.executeSql(`SELECT * FROM subscriptions ORDER BY created_at DESC`);
    return result.rows.raw().map(mapRow);
  },

  async getLatest() {
    const result = await databaseService.executeSql(`SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 1`);
    const rows = result.rows.raw();
    return rows[0] ? mapRow(rows[0]) : undefined;
  },

  async clearAll() {
    await databaseService.executeSql(`DELETE FROM subscriptions`);
  },
};
