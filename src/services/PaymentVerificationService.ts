import {securityService} from './SecurityService';
import {supabaseAuthService} from './SupabaseAuthService';
import {supabaseConfigService} from '../core/config/SupabaseConfig';
import {supabaseClientService} from './SupabaseClientService';

export class PaymentVerificationService {
  async submitPaymentReference(reference: string) {
    if (!(await supabaseConfigService.isConfigured())) {
      return {
        ok: false as const,
        reference,
        status: 'local_only',
        reason: 'Supabase is not configured',
      };
    }

    const authResult = await supabaseAuthService.ensureSession();
    if (!authResult.ok) {
      return {
        ok: false as const,
        reference,
        status: 'auth_required',
        reason: authResult.reason,
      };
    }

    const client = await supabaseClientService.getClient();
    const deviceId = await securityService.getDeviceId();
    const {error} = await client.from('payment_verification_requests').insert({
      auth_user_id: authResult.session.user.id,
      device_id: deviceId,
      payment_reference: reference,
      status: 'pending',
    });

    if (error) {
      return {
        ok: false as const,
        reference,
        status: 'failed',
        reason: error.message,
      };
    }

    return {
      ok: true as const,
      reference,
      status: 'pending_manual_verification',
    };
  }
}

export const paymentVerificationService = new PaymentVerificationService();
