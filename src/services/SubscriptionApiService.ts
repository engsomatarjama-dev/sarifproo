import {PlanType, RemoteSubscriptionSnapshot} from '../types';
import {securityService} from './SecurityService';
import {supabaseAuthService} from './SupabaseAuthService';
import {supabaseConfigService} from '../core/config/SupabaseConfig';
import {supabaseClientService} from './SupabaseClientService';

type SubscriptionStatusRpcRow = {
  user_id?: string;
  account_status: 'active' | 'blocked' | 'pending';
  created_at: string;
  device_bound: boolean;
  expiry_date: string;
  payment_reference: string;
  plan_type: PlanType;
  start_date: string;
  status: RemoteSubscriptionSnapshot['status'];
};

const isOfflineReason = (reason?: string) => {
  const normalized = reason?.toLowerCase() ?? '';
  return (
    normalized.includes('network') ||
    normalized.includes('fetch failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('connection') ||
    normalized.includes('socket') ||
    normalized.includes('dns') ||
    normalized.includes('econn') ||
    normalized.includes('enotfound') ||
    normalized.includes('unreachable') ||
    normalized.includes('unable to resolve') ||
    normalized.includes('offline') ||
    normalized.includes('internet')
  );
};

export class SubscriptionApiService {
  async validateDeviceBoundSubscription(deviceId: string) {
    try {
      if (!(await supabaseConfigService.isConfigured())) {
        return {
          ok: false as const,
          reason: 'Supabase is not configured',
        };
      }

      const authResult = await supabaseAuthService.ensureSession();
      if (!authResult.ok) {
        return {
          ok: false as const,
          reason: authResult.reason,
          offline: isOfflineReason(authResult.reason),
        };
      }

      const client = await supabaseClientService.getClient();
      const {data, error} = await client.rpc('get_device_subscription_status', {
        p_device_id: deviceId,
      });

      if (error) {
        return {
          ok: false as const,
          reason: error.message,
          offline: isOfflineReason(error.message),
        };
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== 'object' || !('plan_type' in row)) {
        return {
          ok: false as const,
          reason: 'No subscription record found for this device',
          offline: false,
        };
      }

      const subscriptionRow = row as SubscriptionStatusRpcRow;

      return {
        ok: true as const,
        subscription: {
          accountStatus: subscriptionRow.account_status,
          createdAt: subscriptionRow.created_at,
          deviceBound: subscriptionRow.device_bound,
          expiryDate: subscriptionRow.expiry_date,
          paymentReference: subscriptionRow.payment_reference,
          planType: subscriptionRow.plan_type,
          startDate: subscriptionRow.start_date,
          status: subscriptionRow.status,
          userId: subscriptionRow.user_id ?? authResult.session.user.id,
          serverVerifiedAt: Date.now(),
        } satisfies RemoteSubscriptionSnapshot,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Network request failed';
      return {
        ok: false as const,
        reason,
        offline: isOfflineReason(reason),
      };
    }
  }

  async submitRenewalRequest(reference: string, planType: PlanType, expectedAmount?: number) {
    if (!(await supabaseConfigService.isConfigured())) {
      return {
        ok: false as const,
        status: 'local_only',
        reason: 'Supabase is not configured',
      };
    }

    const authResult = await supabaseAuthService.ensureSession();
    if (!authResult.ok) {
      return {
        ok: false as const,
        status: 'auth_required',
        reason: authResult.reason,
      };
    }

    const client = await supabaseClientService.getClient();
    const deviceId = await securityService.getDeviceId();
    const {error} = await client.from('payment_verification_requests').insert({
      auth_user_id: authResult.session.user.id,
      device_id: deviceId,
      plan_type: planType,
      expected_amount: expectedAmount ?? null,
      payment_reference: reference,
      status: 'pending',
    });

    if (error) {
      return {
        ok: false as const,
        status: 'failed',
        reason: error.message,
      };
    }

    return {
      ok: true as const,
      status: 'queued',
    };
  }

  async fetchClientAccountStatus() {
    if (!(await supabaseConfigService.isConfigured())) {
      return {
        ok: false as const,
        reason: 'Supabase is not configured',
      };
    }

    const authResult = await supabaseAuthService.ensureSession();
    if (!authResult.ok) {
      return {
        ok: false as const,
        reason: authResult.reason,
      };
    }

    const client = await supabaseClientService.getClient();
    const deviceId = await securityService.getDeviceId();
    const {data, error} = await client.rpc('get_client_account_status', {
      p_device_id: deviceId,
    });

    if (error) {
      return {
        ok: false as const,
        reason: error.message,
      };
    }

    return {
      ok: true as const,
      status: (data?.[0] ?? data)?.account_status ?? 'pending',
    };
  }
}

export const subscriptionApiService = new SubscriptionApiService();
