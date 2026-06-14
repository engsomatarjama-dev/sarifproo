import dayjs from 'dayjs';
import {subscriptionRepository} from '../repositories/SubscriptionRepository';
import {loggingService} from './LoggingService';
import {securityService} from './SecurityService';
import {Subscription, SubscriptionCacheRecord, SubscriptionIntegrityRecord} from '../types';
import {appStorage} from './StorageService';
import {useAppStore} from '../store/useAppStore';
import {daysUntil} from '../utils/format';
import {subscriptionApiService} from './SubscriptionApiService';
import {subscriptionCacheRepository} from '../repositories/SubscriptionCacheRepository';
import {evaluateOfflineGrace, getOfflineGraceRemainingMs} from './SubscriptionGracePolicy';

const INTEGRITY_KEY = 'subscription.integrity';
const AUTOMATION_VALIDATION_CACHE_MS = 15 * 60 * 1000;
const SUBSCRIPTION_STATUS_LOG_INTERVAL_MS = 15 * 60 * 1000;

type AutomationDecisionCache = {
  allowed: boolean;
  expiryDate?: string;
  checkedAt: number;
  status?: Subscription['status'];
};

const isOfflineValidationReason = (reason?: string) => {
  const normalized = reason?.toLowerCase() ?? '';
  return (
    normalized.includes('network') ||
    normalized.includes('network request failed') ||
    normalized.includes('fetch failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('load failed') ||
    normalized.includes('networkerror') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('connection') ||
    normalized.includes('connect') ||
    normalized.includes('socket') ||
    normalized.includes('host') ||
    normalized.includes('dns') ||
    normalized.includes('econn') ||
    normalized.includes('enotfound') ||
    normalized.includes('unreachable') ||
    normalized.includes('unable to resolve') ||
    normalized.includes('offline') ||
    normalized.includes('internet')
  );
};

class SubscriptionGuardService {
  private interval?: ReturnType<typeof setInterval>;
  private lastVerificationStatus: 'online' | 'offline_grace' | 'verification_required' = 'verification_required';
  private automationDecisionCache?: AutomationDecisionCache;
  private lastLoggedSubscriptionStatus?: Subscription['status'];
  private lastLoggedSubscriptionAt = 0;

  private readIntegrity() {
    const integrityRaw = appStorage.getString(INTEGRITY_KEY);
    if (!integrityRaw) {
      return undefined;
    }

    try {
      return JSON.parse(integrityRaw) as SubscriptionIntegrityRecord;
    } catch {
      return undefined;
    }
  }

  private buildIntegrityPayload(deviceId: string, subscription: Subscription, cache: SubscriptionCacheRecord | undefined, salt: string) {
    const normalizedSubscription = {
      planType: subscription.planType,
      startDate: subscription.startDate,
      expiryDate: subscription.expiryDate,
      status: subscription.status,
      paymentReference: subscription.paymentReference,
      createdAt: subscription.createdAt,
    };
    return JSON.stringify({
      deviceId,
      subscription: normalizedSubscription,
      cache,
      salt,
    });
  }

  async persistIntegrity(subscription: Subscription, cache?: SubscriptionCacheRecord) {
    const deviceId = await securityService.getDeviceId();
    const salt = await securityService.getIntegritySalt();
    const payload = this.buildIntegrityPayload(deviceId, subscription, cache, salt);
    const payloadHash = await securityService.hash(payload);
    const record: SubscriptionIntegrityRecord = {
      deviceId,
      payloadHash,
      lastValidatedAt: Date.now(),
      lastKnownNow: Date.now(),
    };
    appStorage.set(INTEGRITY_KEY, JSON.stringify(record));
  }

  private async persistSubscriptionCache(subscription: Subscription, deviceId: string, options: {
    userId?: string;
    deviceValid: boolean;
    lastVerifiedAt?: number;
  }) {
    const previousCache = await subscriptionCacheRepository.get();
    const cache: SubscriptionCacheRecord = {
      userId: options.userId,
      status: subscription.status,
      expiryDate: subscription.expiryDate,
      lastVerifiedAt: options.lastVerifiedAt ?? Date.now(),
      deviceId,
      deviceValid: options.deviceValid,
      validationSource: 'online',
    };
    await subscriptionCacheRepository.save(cache);
    if (
      !previousCache ||
      previousCache.status !== cache.status ||
      previousCache.expiryDate !== cache.expiryDate ||
      previousCache.deviceValid !== cache.deviceValid
    ) {
      await loggingService.log('subscription_checked', 'Subscription cache updated');
    }
    return cache;
  }

  private persistLastKnownNow(integrity: SubscriptionIntegrityRecord) {
    appStorage.set(
      INTEGRITY_KEY,
      JSON.stringify({
        ...integrity,
        lastKnownNow: Date.now(),
      } satisfies SubscriptionIntegrityRecord),
    );
  }

  clearIntegrity() {
    appStorage.delete(INTEGRITY_KEY);
  }

  async validateSubscription() {
    let latest = await subscriptionRepository.getLatest();
    const deviceId = await securityService.getDeviceId();
    const salt = await securityService.getIntegritySalt();
    const previousVerificationStatus = this.lastVerificationStatus;
    const remoteValidation = await subscriptionApiService.validateDeviceBoundSubscription(deviceId);
    const remoteValidated = remoteValidation.ok;
    const remoteOffline = !remoteValidation.ok && (remoteValidation.offline || isOfflineValidationReason(remoteValidation.reason));

    if (remoteValidation.ok) {
      const remoteSubscription = remoteValidation.subscription;
      const synchronized: Subscription = {
        planType: remoteSubscription.planType,
        startDate: remoteSubscription.startDate,
        expiryDate: remoteSubscription.expiryDate,
        status:
          remoteSubscription.accountStatus === 'blocked' || !remoteSubscription.deviceBound
            ? 'blocked'
            : remoteSubscription.status,
        paymentReference: remoteSubscription.paymentReference,
        createdAt: remoteSubscription.createdAt,
      };
      await subscriptionRepository.saveCurrent(synchronized);
      const cache = await this.persistSubscriptionCache(synchronized, deviceId, {
        userId: remoteSubscription.userId,
        deviceValid: remoteSubscription.deviceBound,
        lastVerifiedAt: remoteSubscription.serverVerifiedAt,
      });
      await this.persistIntegrity(synchronized, cache);
      latest = synchronized;
      this.lastVerificationStatus = 'online';
      this.cacheAutomationDecision({
        allowed: synchronized.status === 'active' || synchronized.status === 'trial',
        subscription: synchronized,
      });
      if (this.shouldLogSubscriptionStatus(synchronized.status)) {
        await loggingService.log('subscription_checked', `Online subscription verification success: ${synchronized.status}`);
      }
    } else {
      await loggingService.log('system', `Online subscription verification failed: ${remoteValidation.reason}`);
      if (remoteValidation.reason === 'Login is required') {
        useAppStore.getState().setSubscription(undefined);
        return {
          allowed: false,
          subscription: undefined,
          reason: 'Login is required',
        };
      }

      if (!remoteOffline) {
        useAppStore.getState().setSubscription(undefined);
        this.lastVerificationStatus = 'verification_required';
        return {
          allowed: false,
          subscription: undefined,
          reason: remoteValidation.reason,
        };
      }
    }

    const integrity = this.readIntegrity();
    const cache = await subscriptionCacheRepository.get();

    if (!latest && cache) {
      latest = {
        planType: cache.status === 'trial' ? 'trial' : 'monthly',
        startDate: new Date(cache.lastVerifiedAt).toISOString(),
        expiryDate: cache.expiryDate,
        status: cache.status,
        paymentReference: '',
        createdAt: new Date(cache.lastVerifiedAt).toISOString(),
      };
    }

    if (!latest) {
      useAppStore.getState().setSubscription(undefined);
      this.lastVerificationStatus = 'verification_required';
      return {
        allowed: false,
        subscription: undefined,
        reason: 'No subscription found',
      };
    }

    if (!integrity && !remoteValidated) {
      await loggingService.log('subscription_expired', 'Offline subscription grace denied because no trusted online validation exists');
      this.lastVerificationStatus = 'verification_required';
      return {
        allowed: false,
        subscription: {...latest, status: 'blocked' as const},
        reason: 'Internet is required for first subscription validation',
      };
    }

    if (integrity && integrity.deviceId !== deviceId) {
      await loggingService.log('subscription_expired', 'Device binding mismatch detected');
      this.lastVerificationStatus = 'verification_required';
      return {
        allowed: false,
        subscription: {...latest, status: 'blocked' as const},
        reason: 'Subscription is bound to another device',
      };
    }

    if (integrity && Date.now() + 24 * 60 * 60 * 1000 < integrity.lastKnownNow) {
      await loggingService.log('subscription_expired', 'Possible device date tampering detected');
      this.lastVerificationStatus = 'verification_required';
      return {
        allowed: false,
        subscription: {...latest, status: 'blocked' as const},
        reason: 'Device time appears to have moved backward',
      };
    }

    if (integrity) {
      const recalculatedHash = await securityService.hash(
        this.buildIntegrityPayload(deviceId, latest, cache, salt),
      );

      if (recalculatedHash !== integrity.payloadHash) {
        await loggingService.log('subscription_expired', 'Subscription integrity check failed');
        this.lastVerificationStatus = 'verification_required';
        return {
          allowed: false,
          subscription: {...latest, status: 'blocked' as const},
          reason: 'Subscription integrity check failed',
        };
      }
    }

    const expired = dayjs().isAfter(dayjs(latest.expiryDate));
    const status = expired ? 'expired' : latest.status;

    if (remoteOffline) {
      const grace = evaluateOfflineGrace(cache, deviceId);
      if (!grace.allowed) {
        await loggingService.log('subscription_expired', grace.reason === 'Offline grace expired' ? 'Offline grace expired' : `Offline grace denied: ${grace.reason}`);
        if (grace.reason === 'Offline grace expired') {
          await loggingService.log('subscription_expired', 'Automation blocked by expired grace');
        }
        this.lastVerificationStatus = 'verification_required';
        const blockedStatus = grace.reason === 'Subscription expired' || grace.reason === 'Offline grace expired' ? 'expired' : latest.status;
        return {
          allowed: false,
          subscription: {...latest, status: blockedStatus as Subscription['status']},
          reason: grace.reason ?? 'Internet required for subscription verification.',
        };
      }

      const resolved = {...latest, status: cache?.status ?? status, expiryDate: cache?.expiryDate ?? latest.expiryDate};
      useAppStore.getState().setSubscription(resolved);
      this.lastVerificationStatus = 'offline_grace';
      if (previousVerificationStatus !== 'offline_grace') {
        await loggingService.log('subscription_checked', 'Offline grace started');
      }
      await loggingService.log('subscription_checked', 'Offline grace active');
      await loggingService.log('subscription_checked', 'Automation allowed by offline grace');
      if (integrity) {
        this.persistLastKnownNow(integrity);
      }
      return {
        allowed: true,
        subscription: resolved,
        reason: undefined,
      };
    }

    if (expired && latest.id) {
      await subscriptionRepository.updateStatus(latest.id, 'expired');
    }

    const resolved = {...latest, status};
    useAppStore.getState().setSubscription(resolved);
    if (!remoteValidated && integrity) {
      this.persistLastKnownNow(integrity);
    }
    this.cacheAutomationDecision({
      allowed: resolved.status === 'active' || resolved.status === 'trial',
      subscription: resolved,
    });
    if (!remoteValidated && this.shouldLogSubscriptionStatus(resolved.status)) {
      await loggingService.log('subscription_checked', `Subscription checked: ${resolved.status}`);
    }
    return {
      allowed: resolved.status === 'active' || resolved.status === 'trial',
      subscription: resolved,
      reason: expired ? 'Subscription expired' : undefined,
    };
  }

  private getTrustedCachedAutomationDecision() {
    const cached = this.automationDecisionCache;
    if (!cached || !cached.allowed || cached.status === 'expired' || cached.status === 'blocked' || cached.status === 'pending') {
      return undefined;
    }
    if (Date.now() - cached.checkedAt > AUTOMATION_VALIDATION_CACHE_MS) {
      return undefined;
    }
    if (cached.expiryDate && dayjs().isAfter(dayjs(cached.expiryDate))) {
      return undefined;
    }
    return cached.allowed;
  }

  private cacheAutomationDecision(result: {allowed: boolean; subscription?: Subscription}) {
    this.automationDecisionCache = {
      allowed: result.allowed,
      expiryDate: result.subscription?.expiryDate,
      checkedAt: Date.now(),
      status: result.subscription?.status,
    };
  }

  private shouldLogSubscriptionStatus(status: Subscription['status']) {
    const now = Date.now();
    if (this.lastLoggedSubscriptionStatus !== status || now - this.lastLoggedSubscriptionAt > SUBSCRIPTION_STATUS_LOG_INTERVAL_MS) {
      this.lastLoggedSubscriptionStatus = status;
      this.lastLoggedSubscriptionAt = now;
      return true;
    }
    return false;
  }

  async canRunAutomation() {
    const cachedAllowed = this.getTrustedCachedAutomationDecision();
    if (cachedAllowed !== undefined) {
      return cachedAllowed;
    }
    const result = await this.validateSubscription();
    this.cacheAutomationDecision(result);
    if (!result.allowed) {
      await loggingService.log('subscription_expired', result.reason ?? 'Automation blocked by subscription guard');
    }
    return result.allowed;
  }

  startPeriodicValidation() {
    if (this.interval) {
      return;
    }
    this.interval = setInterval(() => {
      void this.validateSubscription();
    }, 15 * 60 * 1000);
  }

  async getDashboardSummary() {
    let subscription = useAppStore.getState().subscription ?? await subscriptionRepository.getLatest();
    const cache = await subscriptionCacheRepository.get();
    if (!subscription && cache) {
      subscription = {
        planType: cache.status === 'trial' ? 'trial' : 'monthly',
        startDate: new Date(cache.lastVerifiedAt).toISOString(),
        expiryDate: cache.expiryDate,
        status: cache.status,
        paymentReference: '',
        createdAt: new Date(cache.lastVerifiedAt).toISOString(),
      };
    }
    const expired = subscription?.expiryDate ? dayjs().isAfter(dayjs(subscription.expiryDate)) : true;
    const status = expired ? 'expired' : subscription?.status;
    const offlineGraceRemainingMs =
      this.lastVerificationStatus === 'offline_grace' && cache ? getOfflineGraceRemainingMs(cache) : undefined;
    return {
      subscriptionStatus: status ?? 'expired',
      expiryDate: subscription?.expiryDate,
      daysRemaining: daysUntil(subscription?.expiryDate),
      subscriptionVerificationStatus: this.lastVerificationStatus,
      lastSubscriptionVerifiedAt: cache?.lastVerifiedAt,
      offlineGraceRemainingMs,
    };
  }
}

export const subscriptionGuardService = new SubscriptionGuardService();
