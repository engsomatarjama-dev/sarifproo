import {databaseService} from '../database';
import {settingsService} from './SettingsService';
import {useAppStore} from '../store/useAppStore';
import {permissionsService} from './PermissionsService';
import {subscriptionGuardService} from './SubscriptionGuardService';
import {accessibilityAutomationService} from './AccessibilityAutomationService';
import {dashboardService} from './DashboardService';
import {automationService} from './AutomationService';
import {logRepository} from '../repositories/LogRepository';
import {loggingService} from './LoggingService';
import {notificationService} from './NotificationService';
import {supabaseAuthService} from './SupabaseAuthService';
import {appMetadataApiService} from './AppMetadataApiService';

class AppStartupService {
  private initialBootstrapped = false;
  private authenticatedBootstrapped = false;

  async bootstrapInitial() {
    if (this.initialBootstrapped) {
      return;
    }
    await databaseService.init();
    const settings = await settingsService.load();
    useAppStore.getState().setSettings(settings);
    try {
      await supabaseAuthService.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown auth startup error';
      await loggingService.log('system', `Auth initialization failed during startup: ${message}`);
      useAppStore.getState().setAuth({initialized: true});
    }
    useAppStore.getState().setLogs(await logRepository.list());
    this.initialBootstrapped = true;
  }

  async bootstrapAuthenticated() {
    if (this.authenticatedBootstrapped) {
      return;
    }
    const session = await supabaseAuthService.getCurrentSession();
    const canStartFromOfflineCache = !session && supabaseAuthService.hasOfflineAuthCache();
    if (!session && !canStartFromOfflineCache) {
      return;
    }

    const settings = useAppStore.getState().settings;
    await permissionsService.ensureCriticalPermissions();
    await accessibilityAutomationService.syncAutomationSettings(settings);
    await accessibilityAutomationService.refreshStatus();
    try {
      await subscriptionGuardService.validateSubscription('startup');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown subscription validation error';
      await loggingService.log('system', `Subscription validation failed during startup: ${message}`);
    }
    subscriptionGuardService.startPeriodicValidation();
    automationService.subscribe();
    await automationService.startBackgroundMonitoring();
    await automationService.processPendingMessages();
    await dashboardService.refresh();
    useAppStore.getState().setLogs(await logRepository.list());
    await appMetadataApiService.recordHeartbeat();
    await loggingService.log('system', 'SarifPro startup completed');
    await notificationService.show('Automation started', 'SarifPro background monitoring is active.');
    this.authenticatedBootstrapped = true;
  }

  async bootstrap() {
    await this.bootstrapInitial();
    await this.bootstrapAuthenticated();
  }

  resetAuthenticatedBootstrap() {
    this.authenticatedBootstrapped = false;
  }

  async refreshAll() {
    await dashboardService.refresh();
    useAppStore.getState().setLogs(await logRepository.list());
  }
}

export const appStartupService = new AppStartupService();
