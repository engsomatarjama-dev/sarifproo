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

  async list(limit = 200) {
    const result = await databaseService.executeSql(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?`, [limit]);
    return result.rows.raw().map(mapRow);
  },
};
