import {SubscriptionCacheRecord} from '../types';
import {databaseService} from '../database';

const mapRow = (row: Record<string, unknown>): SubscriptionCacheRecord => ({
  userId: row.user_id ? String(row.user_id) : undefined,
  status: String(row.status) as SubscriptionCacheRecord['status'],
  expiryDate: String(row.expiry_date),
  lastVerifiedAt: Number(row.last_verified_at),
  deviceId: String(row.device_id),
  deviceValid: Number(row.device_valid ?? 0) === 1,
  validationSource: (String(row.validation_source ?? 'online') || 'online') as SubscriptionCacheRecord['validationSource'],
});

export const subscriptionCacheRepository = {
  async save(cache: SubscriptionCacheRecord) {
    await databaseService.executeSql(
      `INSERT OR REPLACE INTO subscription_cache (id, user_id, status, expiry_date, last_verified_at, device_id, device_valid, validation_source)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cache.userId ?? null,
        cache.status,
        cache.expiryDate,
        cache.lastVerifiedAt,
        cache.deviceId,
        cache.deviceValid ? 1 : 0,
        cache.validationSource,
      ],
    );
  },

  async get() {
    const result = await databaseService.executeSql<Record<string, unknown>>(
      `SELECT user_id, status, expiry_date, last_verified_at, device_id, device_valid, validation_source
       FROM subscription_cache WHERE id = 1 LIMIT 1`,
    );
    const row = result.rows.raw()[0];
    return row ? mapRow(row) : undefined;
  },

  async clear() {
    await databaseService.executeSql(`DELETE FROM subscription_cache`);
  },
};
