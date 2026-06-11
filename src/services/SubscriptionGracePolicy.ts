import dayjs from 'dayjs';
import {SubscriptionCacheRecord} from '../types';

export const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;

export type OfflineGraceDecision = {
  allowed: boolean;
  reason?: string;
  remainingMs: number;
};

export const getOfflineGraceRemainingMs = (cache: Pick<SubscriptionCacheRecord, 'lastVerifiedAt'>, now = Date.now()) =>
  Math.max(GRACE_PERIOD_MS - (now - cache.lastVerifiedAt), 0);

export const evaluateOfflineGrace = (
  cache: SubscriptionCacheRecord | undefined,
  deviceId: string,
  now = Date.now(),
): OfflineGraceDecision => {
  if (!cache) {
    return {allowed: false, reason: 'No successful online verification exists', remainingMs: 0};
  }
  if (cache.validationSource !== 'online') {
    return {allowed: false, reason: 'No successful online verification exists', remainingMs: 0};
  }
  if (cache.deviceId !== deviceId || !cache.deviceValid) {
    return {allowed: false, reason: 'Device binding was invalid during last verification', remainingMs: 0};
  }
  if (cache.status !== 'active' && cache.status !== 'trial') {
    return {allowed: false, reason: `Last verified status was ${cache.status}`, remainingMs: 0};
  }
  if (dayjs(now).isAfter(dayjs(cache.expiryDate))) {
    return {allowed: false, reason: 'Subscription expired', remainingMs: 0};
  }

  const remainingMs = getOfflineGraceRemainingMs(cache, now);
  if (remainingMs <= 0) {
    return {allowed: false, reason: 'Offline grace expired', remainingMs: 0};
  }

  return {allowed: true, remainingMs};
};
