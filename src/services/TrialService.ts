import {PlanType, Subscription, SubscriptionStatus} from '../types';
import {subscriptionRepository} from '../repositories/SubscriptionRepository';
import {useAppStore} from '../store/useAppStore';
import {securityService} from './SecurityService';
import {supabaseClientService} from './SupabaseClientService';
import {loggingService} from './LoggingService';

type TrialProfile = {
  fullName: string;
  phone: string;
};

type TrialRpcRow = {
  plan_type: 'trial';
  start_date: string;
  expiry_date: string;
  status: 'trial';
  payment_reference: string;
  created_at: string;
};

type SubscriptionStatusRpcRow = {
  plan_type: PlanType;
  start_date: string;
  expiry_date: string;
  status: SubscriptionStatus;
  payment_reference: string;
  created_at: string;
};

class TrialService {
  private toLocalSubscription(row: TrialRpcRow | SubscriptionStatusRpcRow): Subscription {
    return {
      planType: row.plan_type,
      startDate: row.start_date,
      expiryDate: row.expiry_date,
      status: row.status,
      paymentReference: row.payment_reference,
      createdAt: row.created_at,
    };
  }

  private async getRemoteSubscriptionForCurrentDevice(deviceId: string) {
    const client = await supabaseClientService.getClient();
    const {data, error} = await client.rpc('get_device_subscription_status', {
      p_device_id: deviceId,
    });

    if (error) {
      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object' || !('plan_type' in row)) {
      return undefined;
    }

    return this.toLocalSubscription(row as SubscriptionStatusRpcRow);
  }

  async createTrialForCurrentUser(profile: TrialProfile) {
    const client = await supabaseClientService.getClient();
    const deviceId = await securityService.getDeviceId();
    const {data, error} = await client.rpc('create_trial_subscription', {
      p_device_id: deviceId,
      p_device_name: 'SarifPro Android device',
      p_full_name: profile.fullName.trim(),
      p_phone: profile.phone.trim(),
    });

    if (error) {
      if (error.message.toLowerCase().includes('trial already used')) {
        throw new Error('Trial already used on this device.');
      }
      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error('Trial could not be created.');
    }

    const subscription = this.toLocalSubscription(row as TrialRpcRow);
    await subscriptionRepository.saveCurrent(subscription);
    useAppStore.getState().setSubscription(subscription);
    await loggingService.log('subscription_checked', `Trial subscription created until ${subscription.expiryDate}`);
    return subscription;
  }

  async ensureTrialForCurrentDevice(profile: Partial<TrialProfile> = {}) {
    const deviceId = await securityService.getDeviceId();
    const existing = await this.getRemoteSubscriptionForCurrentDevice(deviceId);
    if (existing) {
      await subscriptionRepository.saveCurrent(existing);
      useAppStore.getState().setSubscription(existing);
      return existing;
    }

    return this.createTrialForCurrentUser({
      fullName: profile.fullName ?? '',
      phone: profile.phone ?? '',
    });
  }
}

export const trialService = new TrialService();
