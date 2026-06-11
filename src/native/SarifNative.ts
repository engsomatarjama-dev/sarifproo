import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {SmsPayload, UssdFinalResult} from '../types';

type SmsNativeModule = {
  getPendingMessages: () => Promise<SmsPayload[]>;
};

type UssdNativeModule = {
  dialUssd: (ussd: string) => Promise<void>;
};

type AccessibilityNativeModule = {
  updatePin2: (pin2: string) => Promise<void>;
  updateBankPin: (bankPin: string) => Promise<void>;
  setAutomationSpeed: (speed: 'FAST' | 'SAFE') => Promise<void>;
  isEnabled: () => Promise<boolean>;
  armPinAutomation: (durationMs?: number) => Promise<void>;
  armDaraSalaamAutomation: (amount: string, durationMs?: number) => Promise<void>;
  getDaraSalaamAutomationState: () => Promise<string>;
  armBalanceCheckAutomation: (durationMs?: number) => Promise<void>;
  getBalanceCheckAutomationState: () => Promise<string>;
  getBalanceCheckResult: () => Promise<string>;
  getBalanceCheckResultMessage: () => Promise<string>;
  getFinalUssdResult: () => Promise<
    UssdFinalResult & {
      state: string;
      classification?: UssdFinalResult['classification'];
    }
  >;
  isAutomationActive: () => Promise<boolean>;
  isUssdWindowVisible: () => Promise<boolean>;
  dismissVisibleUssdWindow: () => Promise<boolean>;
  extendAutomation: (durationMs?: number) => Promise<void>;
  resetAutomation: () => Promise<void>;
};

type NotificationNativeModule = {
  showNotification: (title: string, message: string, channel?: string) => Promise<void>;
};

type SecurityNativeModule = {
  getAndroidId: () => Promise<string>;
  sha256: (value: string) => Promise<string>;
};

type AppConfigNativeModule = {
  getConfig: () => Promise<{
    supabaseUrl: string;
    supabasePublishableKey: string;
    authRedirectBaseUrl: string;
    supabaseUseAnonymousAuth: boolean;
    appVersion: string;
  }>;
};

export const smsNative = NativeModules.SarifSmsModule as SmsNativeModule;
export const ussdNative = NativeModules.SarifUssdModule as UssdNativeModule;
export const accessibilityNative = NativeModules.SarifAccessibilityModule as AccessibilityNativeModule;
export const notificationNative = NativeModules.SarifNotificationModule as NotificationNativeModule;
export const securityNative = NativeModules.SarifSecurityModule as SecurityNativeModule;
export const appConfigNative = NativeModules.SarifAppConfigModule as AppConfigNativeModule;

export const smsEventEmitter =
  Platform.OS === 'android' && NativeModules.SarifSmsModule
    ? new NativeEventEmitter(NativeModules.SarifSmsModule)
    : undefined;
