import SQLite, {ResultSet, SQLiteDatabase} from 'react-native-sqlite-storage';
import {schemaStatements} from './schema';

SQLite.enablePromise(true);

class DatabaseService {
  private database?: SQLiteDatabase;

  async getDb() {
    if (!this.database) {
      this.database = await SQLite.openDatabase({
        name: 'sarifpro.db',
        location: 'default',
      });
    }
    return this.database;
  }

  async init() {
    const db = await this.getDb();
    for (const statement of schemaStatements) {
      await db.executeSql(statement);
    }
    await this.migrateTransactions();
    await this.migrateSubscriptionCache();
  }

  private async migrateTransactions() {
    const result = await this.executeSql<{name: string}>(`PRAGMA table_info(transactions)`);
    const columns = new Set(result.rows.raw().map(row => row.name));
    const migrations: Array<[string, string]> = [
      ['transaction_type', `ALTER TABLE transactions ADD COLUMN transaction_type TEXT`],
      ['result_message', `ALTER TABLE transactions ADD COLUMN result_message TEXT`],
      ['failure_reason', `ALTER TABLE transactions ADD COLUMN failure_reason TEXT`],
      ['completed_at', `ALTER TABLE transactions ADD COLUMN completed_at INTEGER`],
      ['confirmation_source', `ALTER TABLE transactions ADD COLUMN confirmation_source TEXT`],
      ['confirmed_amount', `ALTER TABLE transactions ADD COLUMN confirmed_amount REAL`],
      ['confirmation_reference', `ALTER TABLE transactions ADD COLUMN confirmation_reference TEXT`],
      ['receiver_name', `ALTER TABLE transactions ADD COLUMN receiver_name TEXT`],
      ['receiver_phone', `ALTER TABLE transactions ADD COLUMN receiver_phone TEXT`],
      ['bank_account', `ALTER TABLE transactions ADD COLUMN bank_account TEXT`],
      ['transaction_date', `ALTER TABLE transactions ADD COLUMN transaction_date TEXT`],
      ['confirmation_note', `ALTER TABLE transactions ADD COLUMN confirmation_note TEXT`],
      ['confirmation_started_at', `ALTER TABLE transactions ADD COLUMN confirmation_started_at INTEGER`],
      ['confirmation_expires_at', `ALTER TABLE transactions ADD COLUMN confirmation_expires_at INTEGER`],
      ['source', `ALTER TABLE transactions ADD COLUMN source TEXT`],
      ['source_reference', `ALTER TABLE transactions ADD COLUMN source_reference TEXT`],
      ['dedupe_key', `ALTER TABLE transactions ADD COLUMN dedupe_key TEXT`],
      ['related_event_id', `ALTER TABLE transactions ADD COLUMN related_event_id TEXT`],
      ['transfer_destination', `ALTER TABLE transactions ADD COLUMN transfer_destination TEXT`],
    ];
    for (const [column, sql] of migrations) {
      if (!columns.has(column)) {
        await this.executeSql(sql);
      }
    }
  }

  private async migrateSubscriptionCache() {
    const result = await this.executeSql<{name: string}>(`PRAGMA table_info(subscription_cache)`);
    const columns = new Set(result.rows.raw().map(row => row.name));
    const migrations: Array<[string, string]> = [
      ['user_id', `ALTER TABLE subscription_cache ADD COLUMN user_id TEXT`],
      ['device_valid', `ALTER TABLE subscription_cache ADD COLUMN device_valid INTEGER NOT NULL DEFAULT 0`],
      ['validation_source', `ALTER TABLE subscription_cache ADD COLUMN validation_source TEXT NOT NULL DEFAULT 'online'`],
    ];
    for (const [column, sql] of migrations) {
      if (!columns.has(column)) {
        await this.executeSql(sql);
      }
    }
  }

  async executeSql<T = unknown>(sql: string, params: unknown[] = []) {
    const db = await this.getDb();
    const [result] = await db.executeSql(sql, params);
    return result as unknown as ResultSet & {rows: {raw: () => T[]}};
  }
}

export const databaseService = new DatabaseService();
