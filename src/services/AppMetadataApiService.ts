import {useAppStore} from '../store/useAppStore';
import {AnonymousAppMetadata} from '../types';
import {securityService} from './SecurityService';
import {supabaseConfigService} from '../core/config/SupabaseConfig';
import {supabaseAuthService} from './SupabaseAuthService';
import {supabaseClientService} from './SupabaseClientService';

class AppMetadataApiService {
  async buildMetadata(): Promise<AnonymousAppMetadata> {
    const config = await supabaseConfigService.getConfig();
    const settings = useAppStore.getState().settings;
    return {
      appVersion: config.appVersion,
      automationEnabled: settings.automationEnabled,
      monitoring898Enabled: settings.monitoring898Enabled,
      lastActiveAt: Date.now(),
    };
  }

  async recordHeartbeat() {
    try {
      if (!(await supabaseConfigService.isConfigured())) {
        return {
          ok: false as const,
          reason: 'Supabase is not configured',
        };
      }

      const authResult = await supabaseAuthService.ensureSession();
      if (!authResult.ok) {
        return authResult;
      }

      const client = await supabaseClientService.getClient();
      const deviceId = await securityService.getDeviceId();
      const metadata = await this.buildMetadata();

      const {error} = await client.from('app_metadata_events').insert({
        auth_user_id: authResult.session.user.id,
        device_id: deviceId,
        app_version: metadata.appVersion,
        automation_enabled: metadata.automationEnabled,
        monitoring_898_enabled: metadata.monitoring898Enabled,
        last_active_at: new Date(metadata.lastActiveAt).toISOString(),
      });

      if (error) {
        return {
          ok: false as const,
          reason: error.message,
        };
      }

      return {
        ok: true as const,
      };
    } catch (error) {
      return {
        ok: false as const,
        reason: error instanceof Error ? error.message : 'Metadata heartbeat failed',
      };
    }
  }
}

export const appMetadataApiService = new AppMetadataApiService();
