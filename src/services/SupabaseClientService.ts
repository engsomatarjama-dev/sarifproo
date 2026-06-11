import {createClient, SupabaseClient} from '@supabase/supabase-js';
import * as Keychain from 'react-native-keychain';
import {supabaseConfigService} from '../core/config/SupabaseConfig';

const SUPABASE_AUTH_PREFIX = 'supabase.auth.';

type StringStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const authStorage: StringStorageAdapter = {
  async getItem(key) {
    const credential = await Keychain.getGenericPassword({service: `${SUPABASE_AUTH_PREFIX}${key}`});
    return credential ? credential.password : null;
  },
  async setItem(key, value) {
    await Keychain.setGenericPassword(key, value, {service: `${SUPABASE_AUTH_PREFIX}${key}`});
  },
  async removeItem(key) {
    await Keychain.resetGenericPassword({service: `${SUPABASE_AUTH_PREFIX}${key}`});
  },
};

class SupabaseClientService {
  private client?: SupabaseClient;

  async getClient() {
    if (this.client) {
      return this.client;
    }

    const config = await supabaseConfigService.getConfig();
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error('Supabase is not configured. Set SARIFPRO_SUPABASE_URL and SARIFPRO_SUPABASE_PUBLISHABLE_KEY in android/gradle.properties or your Gradle environment.');
    }

    this.client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });

    return this.client;
  }
}

export const supabaseClientService = new SupabaseClientService();
