import {SmsPayload} from '../types';
import {databaseService} from '../database';
import {settingsService} from '../services/SettingsService';
import {useAppStore} from '../store/useAppStore';
import {accessibilityAutomationService} from '../services/AccessibilityAutomationService';
import {subscriptionGuardService} from '../services/SubscriptionGuardService';
import {automationService} from '../services/AutomationService';
import {loggingService} from '../services/LoggingService';

const isSmsPayload = (value: Partial<SmsPayload>): value is SmsPayload =>
  typeof value.sender === 'string' && typeof value.body === 'string' && typeof value.timestamp === 'number';

export const sarifSmsHeadlessTask = async (payload: Partial<SmsPayload>) => {
  try {
    if (!isSmsPayload(payload)) {
      return;
    }

    await databaseService.init();
    const settings = await settingsService.load();
    useAppStore.getState().setSettings(settings);
    await accessibilityAutomationService.syncAutomationSettings(settings);
    await subscriptionGuardService.validateSubscription('startup');
    await automationService.processSms(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown headless SMS processing error';
    try {
      await loggingService.log('system', `Headless SMS task failed: ${message}`);
    } catch {
      // Logging can fail if the database is unavailable during Android process startup.
    }
  }
};
