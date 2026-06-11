import type {Session} from '@supabase/supabase-js';
import {supabaseConfigService} from '../core/config/SupabaseConfig';
import {useAppStore} from '../store/useAppStore';
import {trialService} from './TrialService';
import {supabaseClientService} from './SupabaseClientService';
import {appStorage} from './StorageService';
import {subscriptionRepository} from '../repositories/SubscriptionRepository';
import {subscriptionCacheRepository} from '../repositories/SubscriptionCacheRepository';

type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
};

const toAuthState = (session: Session | null) => ({
  initialized: true,
  session: session ?? undefined,
  userEmail: session?.user.email ?? undefined,
});

const OFFLINE_AUTH_CACHE_KEY = 'auth.offline_cache_enabled';
const SUBSCRIPTION_INTEGRITY_KEY = 'subscription.integrity';
const CONFIRMATION_REQUIRED_MESSAGE =
  'Registration successful. Please check your email and click the confirmation link to activate your account. After confirming, return to the app and login using your email and password.';

class SupabaseAuthService {
  private listening = false;

  private async getAuthRedirectUrl(path: '/auth/confirmed' | '/auth/reset-password') {
    const config = await supabaseConfigService.getConfig();
    return config.authRedirectBaseUrl ? `${config.authRedirectBaseUrl}${path}` : undefined;
  }

  isEmailNotConfirmedError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /email.*not.*confirm|confirm.*email|email.*confirm/i.test(message);
  }

  async initialize() {
    const client = await supabaseClientService.getClient();
    const {data, error} = await client.auth.getSession();

    if (error) {
      useAppStore.getState().setAuth({initialized: true});
      return {
        ok: false as const,
        reason: error.message,
      };
    }

    if (data.session) {
      appStorage.set(OFFLINE_AUTH_CACHE_KEY, true);
    }
    useAppStore.getState().setAuth(toAuthState(data.session));
    this.listenToAuthChanges();
    return {
      ok: true as const,
      session: data.session,
    };
  }

  async getCurrentSession() {
    try {
      const client = await supabaseClientService.getClient();
      const {
        data: {session},
        error,
      } = await client.auth.getSession();

      if (error) {
        return undefined;
      }

      if (session) {
        appStorage.set(OFFLINE_AUTH_CACHE_KEY, true);
      }
      return session ?? undefined;
    } catch {
      return undefined;
    }
  }

  hasOfflineAuthCache() {
    return appStorage.getBoolean(OFFLINE_AUTH_CACHE_KEY) === true;
  }

  listenToAuthChanges() {
    if (this.listening) {
      return;
    }
    this.listening = true;
    void supabaseClientService.getClient().then(client => {
      client.auth.onAuthStateChange((_event, session) => {
        useAppStore.getState().setAuth(toAuthState(session));
      });
    });
  }

  async ensureSession() {
    try {
      if (!(await supabaseConfigService.isConfigured())) {
        return {
          ok: false as const,
          reason: 'Supabase is not configured',
        };
      }

      const client = await supabaseClientService.getClient();
      const {
        data: {session},
        error: sessionError,
      } = await client.auth.getSession();

      if (sessionError) {
        return {
          ok: false as const,
          reason: sessionError.message,
        };
      }

      if (session) {
        appStorage.set(OFFLINE_AUTH_CACHE_KEY, true);
        return {
          ok: true as const,
          session,
        };
      }

      return {
        ok: false as const,
        reason: 'Login is required',
      };
    } catch (error) {
      return {
        ok: false as const,
        reason: error instanceof Error ? error.message : 'Network request failed',
      };
    }
  }

  async signInWithPassword(email: string, password: string) {
    const client = await supabaseClientService.getClient();
    const result = await client.auth.signInWithPassword({email: email.trim(), password});
    if (result.data.session) {
      appStorage.set(OFFLINE_AUTH_CACHE_KEY, true);
      useAppStore.getState().setAuth(toAuthState(result.data.session));
      const metadata = result.data.session.user.user_metadata ?? {};
      await trialService.ensureTrialForCurrentDevice({
        fullName: typeof metadata.full_name === 'string' ? metadata.full_name : '',
        phone: typeof metadata.phone === 'string' ? metadata.phone : '',
      });
    }
    return result;
  }

  async registerWithPassword(input: RegisterInput) {
    const client = await supabaseClientService.getClient();
    const email = input.email.trim();
    const emailRedirectTo = await this.getAuthRedirectUrl('/auth/confirmed');
    const {data, error} = await client.auth.signUp({
      email,
      password: input.password,
      options: {
        emailRedirectTo,
        data: {
          full_name: input.fullName.trim(),
          phone: input.phone.trim(),
          trial_requested: true,
        },
      },
    });

    if (error) {
      return {
        data,
        error,
      };
    }

    let session = data.session;
    if (!session) {
      return {
        data,
        error: null,
        requiresEmailConfirmation: true,
        message: CONFIRMATION_REQUIRED_MESSAGE,
      };
    }

    useAppStore.getState().setAuth(toAuthState(session));
    appStorage.set(OFFLINE_AUTH_CACHE_KEY, true);
    await trialService.createTrialForCurrentUser({
      fullName: input.fullName,
      phone: input.phone,
    });

    return {
      data: {
        ...data,
        session,
      },
      error: null,
    };
  }

  async resetPasswordForEmail(email: string) {
    const client = await supabaseClientService.getClient();
    const redirectTo = await this.getAuthRedirectUrl('/auth/reset-password');
    return client.auth.resetPasswordForEmail(email.trim(), redirectTo ? {redirectTo} : undefined);
  }

  async verifyPassword(email: string, password: string) {
    const client = await supabaseClientService.getClient();
    const {error} = await client.auth.signInWithPassword({email: email.trim(), password});
    if (error) {
      return {
        ok: false as const,
        reason: 'Account password verification failed.',
      };
    }
    return {ok: true as const};
  }

  async signOut() {
    const client = await supabaseClientService.getClient();
    const result = await client.auth.signOut();
    appStorage.delete(OFFLINE_AUTH_CACHE_KEY);
    appStorage.delete(SUBSCRIPTION_INTEGRITY_KEY);
    await subscriptionRepository.clearAll();
    await subscriptionCacheRepository.clear();
    useAppStore.getState().setAuth({initialized: true});
    useAppStore.getState().setSubscription(undefined);
    return result;
  }
}

export const supabaseAuthService = new SupabaseAuthService();
