import {describe, expect, it} from '@jest/globals';
import {evaluateOfflineGrace, GRACE_PERIOD_MS} from '../SubscriptionGracePolicy';
import {SubscriptionCacheRecord} from '../../types';

const baseCache = (overrides: Partial<SubscriptionCacheRecord> = {}): SubscriptionCacheRecord => ({
  userId: 'user-1',
  status: 'active',
  expiryDate: '2026-06-10T00:00:00.000Z',
  lastVerifiedAt: Date.UTC(2026, 5, 1, 8),
  deviceId: 'device-1',
  deviceValid: true,
  validationSource: 'online',
  ...overrides,
});

describe('SubscriptionGracePolicy', () => {
  it('allows active cached subscriptions within 72 hours', () => {
    const now = Date.UTC(2026, 5, 4, 7);
    const decision = evaluateOfflineGrace(baseCache(), 'device-1', now);

    expect(decision.allowed).toBe(true);
    expect(decision.remainingMs).toBe(GRACE_PERIOD_MS - (now - baseCache().lastVerifiedAt));
  });

  it('blocks once the 72-hour grace expires', () => {
    const now = Date.UTC(2026, 5, 4, 9);
    const decision = evaluateOfflineGrace(baseCache(), 'device-1', now);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('Offline grace expired');
  });

  it('blocks blocked, pending, expired, and device-invalid caches', () => {
    expect(evaluateOfflineGrace(baseCache({status: 'blocked'}), 'device-1').allowed).toBe(false);
    expect(evaluateOfflineGrace(baseCache({status: 'pending'}), 'device-1').allowed).toBe(false);
    expect(evaluateOfflineGrace(baseCache({status: 'expired'}), 'device-1').allowed).toBe(false);
    expect(evaluateOfflineGrace(baseCache({deviceValid: false}), 'device-1').allowed).toBe(false);
    expect(evaluateOfflineGrace(baseCache(), 'other-device').allowed).toBe(false);
  });
});
