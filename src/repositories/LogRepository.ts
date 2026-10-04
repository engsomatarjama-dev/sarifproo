import {databaseService} from '../database';
import {LogEntry} from '../types';

const mapRow = (row: any): LogEntry => ({
  id: row.id,
  type: row.type,
  message: row.message,
  timestamp: Number(row.timestamp),
});

export const logRepository = {
  async create(entry: LogEntry) {
    await databaseService.executeSql(
      `INSERT INTO logs (type, message, timestamp) VALUES (?, ?, ?)`,
      [entry.type, entry.message, entry.timestamp],
    );
  },

  // `id` is the INTEGER PRIMARY KEY (the rowid), so this walks the table
  // b-tree backwards and stops after `limit` rows. `ORDER BY timestamp` has
  // no index and forces a full scan + sort of the whole table on every call,
  // which on a months-old database saturates the single SQLite worker thread
  // and stalls everything queued behind it. Inserts are serialized, so id
  // order matches time order for this display list.
  async list(limit = 200) {
    const result = await databaseService.executeSql(`SELECT * FROM logs ORDER BY id DESC LIMIT ?`, [limit]);
    return result.rows.raw().map(mapRow);
  },

  async getIdBounds() {
    const result = await databaseService.executeSql<{min_id: number | null; max_id: number | null}>(
      `SELECT MIN(id) AS min_id, MAX(id) AS max_id FROM logs`,
    );
    const row = result.rows.raw()[0];
    if (!row || row.min_id === null || row.min_id === undefined || row.max_id === null || row.max_id === undefined) {
      return undefined;
    }
    return {minId: Number(row.min_id), maxId: Number(row.max_id)};
  },

  async deleteIdRange(fromIdInclusive: number, toIdExclusive: number) {
    const result = await databaseService.executeSql(`DELETE FROM logs WHERE id >= ? AND id < ?`, [
      fromIdInclusive,
      toIdExclusive,
    ]);
    return Number(result.rowsAffected ?? 0);
  },
};
