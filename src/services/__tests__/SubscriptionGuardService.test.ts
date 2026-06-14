import {describe, expect, it, beforeEach, jest} from '@jest/globals';
import {Subscription, SubscriptionCacheRecord, SubscriptionIntegrityRecord} from '../../types';

const futureSubscription: Subscription = {
  id: 1,
  planType: 'monthly',
  startDate: '2026-06-01T00:00:00.000Z',
  expiryDate: '2026-07-01T00:00:00.000Z',
  status: 'active',
  paymentReference: 'PAY-1',
  createdAt: '2026-06-01T00:00:00.000Z',
};

const cacheRecord: SubscriptionCacheRecord = {
  userId: 'user-1',
  status: 'active',
  expiryDate: futureSubscription.expiryDate,
  lastVerifiedAt: Date.UTC(2026, 5, 15, 8),
  deviceId: 'device-1',
  deviceValid: true,
  validationSource: 'online',
};

const integrityRecord: SubscriptionIntegrityRecord = {
  deviceId: 'device-1',
  payloadHash: 'old-hash',
  lastValidatedAt: Date.UTC(2026, 5, 15, 8),
  lastKnownNow: Date.UTC(2026, 5, 15, 8),
};

const mockStore = new Map<string, string>();
let mockLatestSubscription: Subscription | undefined = futureSubscription;
let mockLatestCache: SubscriptionCacheRecord | undefined = cacheRecord;
let mockRemoteResolver: (() => void) | undefined;

const mockLoggingService = {
  log: jest.fn(() => Promise.resolve()),
};

const mockSubscriptionApiService = {
  validateDeviceBoundSubscription: jest.fn(
    () =>
      new Promise(resolve => {
        mockRemoteResolver = () =>
          resolve({
            ok: false,
            offline: true,
            reason: 'Network request failed',
          });
      }),
  ),
};

const flushMicrotasks = async () => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

jest.mock('../../repositories/SubscriptionRepository', () => ({
  subscriptionRepository: {
    getLatest: jest.fn(() => Promise.resolve(mockLatestSubscription)),
    saveCurrent: jest.fn(() => Promise.resolve(1)),
    updateStatus: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../repositories/SubscriptionCacheRepository', () => ({
  subscriptionCacheRepository: {
    get: jest.fn(() => Promise.resolve(mockLatestCache)),
    save: jest.fn((cache: SubscriptionCacheRecord) => {
      mockLatestCache = cache;
      return Promise.resolve();
    }),
  },
}));

jest.mock('../LoggingService', () => ({loggingService: mockLoggingService}));

jest.mock('../SecurityService', () => ({
  securityService: {
    getDeviceId: jest.fn(() => Promise.resolve('device-1')),
    getIntegritySalt: jest.fn(() => Promise.resolve('salt-1')),
    hash: jest.fn(() => Promise.resolve('new-hash')),
  },
}));

jest.mock('../StorageService', () => ({
  appStorage: {
    getString: jest.fn((key: string) => mockStore.get(key)),
    set: jest.fn((key: string, value: string) => {
      mockStore.set(key, value);
    }),
    delete: jest.fn((key: string) => {
      mockStore.delete(key);
    }),
  },
}));

jest.mock('../SubscriptionApiService', () => ({subscriptionApiService: mockSubscriptionApiService}));

jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      setSubscription: jest.fn(),
      subscription: mockLatestSubscription,
    })),
  },
}));

describe('SubscriptionGuardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockStore.clear();
    mockStore.set('subscription.integrity', JSON.stringify(integrityRecord));
    mockLatestSubscription = futureSubscription;
    mockLatestCache = cacheRecord;
    mockRemoteResolver = undefined;
  });

  it('reuses the active startup validation instead of starting duplicate Supabase calls', async () => {
    const {subscriptionGuardService} = require('../SubscriptionGuardService');

    const first = subscriptionGuardService.validateSubscription('startup');
    const second = subscriptionGuardService.validateSubscription('startup');

    await flushMicrotasks();
    expect(mockSubscriptionApiService.validateDeviceBoundSubscription).toHaveBeenCalledTimes(1);
    mockRemoteResolver?.();

    const results = await Promise.all([first, second]);

    expect(results[0].allowed).toBe(false);
    expect(results[1]).toBe(results[0]);
    expect(mockSubscriptionApiService.validateDeviceBoundSubscription).toHaveBeenCalledTimes(1);
  });

  it('logs the same integrity failure only once for the same startup state', async () => {
    const {subscriptionGuardService} = require('../SubscriptionGuardService');

    const first = subscriptionGuardService.validateSubscription('startup');
    await flushMicrotasks();
    mockRemoteResolver?.();
    await first;

    const second = subscriptionGuardService.validateSubscription('startup');
    await flushMicrotasks();
    mockRemoteResolver?.();
    await second;

    const integrityLogs = (mockLoggingService.log.mock.calls as unknown as Array<[string, string]>).filter(
      call => call[0] === 'subscription_expired' && call[1] === 'Subscription integrity check failed',
    );

    expect(integrityLogs).toHaveLength(1);
  });
});
