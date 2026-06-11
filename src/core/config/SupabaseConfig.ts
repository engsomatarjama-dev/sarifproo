import {appConfigNative} from '../../native/SarifNative';

export interface SupabaseRuntimeConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  authRedirectBaseUrl: string;
  supabaseUseAnonymousAuth: boolean;
  appVersion: string;
}

class SupabaseConfigService {
  private cached?: SupabaseRuntimeConfig;

  async getConfig() {
    if (this.cached) {
      return this.cached;
    }

    const nativeConfig = await appConfigNative.getConfig();
    this.cached = {
      supabaseUrl: nativeConfig.supabaseUrl?.trim() ?? '',
      supabasePublishableKey: nativeConfig.supabasePublishableKey?.trim() ?? '',
      authRedirectBaseUrl: nativeConfig.authRedirectBaseUrl?.trim().replace(/\/+$/, '') ?? '',
      supabaseUseAnonymousAuth: Boolean(nativeConfig.supabaseUseAnonymousAuth),
      appVersion: nativeConfig.appVersion?.trim() ?? '0.0.0',
    };
    return this.cached;
  }

  async isConfigured() {
    const config = await this.getConfig();
    return Boolean(config.supabaseUrl && config.supabasePublishableKey);
  }
}

export const supabaseConfigService = new SupabaseConfigService();
