import * as Keychain from 'react-native-keychain';
import {AppSettings} from '../types';
import {defaultSettings} from '../models/defaults';
import {appStorage} from './StorageService';

const SECURE_SERVICE = 'sarifpro.secure.settings';
const PLAIN_KEY = 'settings.plain';

interface PlainSettings {
  automationEnabled: boolean;
  monitoring898Enabled: boolean;
  periodicBalanceCheckerEnabled: boolean;
  balanceCheckIntervalMinutes: AppSettings['balanceCheckIntervalMinutes'];
  minimumBalanceThreshold: number;
  maxTransferAmount: number;
  shortcode?: string;
  transferMethod?: AppSettings['transferMethod'];
  ussdAutomationSpeed?: AppSettings['ussdAutomationSpeed'];
}

export const settingsService = {
  async load(): Promise<AppSettings> {
    const secure = await Keychain.getGenericPassword({service: SECURE_SERVICE});
    const plainRaw = appStorage.getString(PLAIN_KEY);
    const plainSettings: Partial<PlainSettings> = plainRaw ? JSON.parse(plainRaw) : {};
    const securePayload =
      secure && typeof secure.password === 'string'
        ? (JSON.parse(secure.password) as Partial<AppSettings>)
        : {};

    return {
      ...defaultSettings,
      ...plainSettings,
      ...securePayload,
      minimumBalanceThreshold: Number(plainSettings.minimumBalanceThreshold ?? defaultSettings.minimumBalanceThreshold),
      maxTransferAmount: Number(plainSettings.maxTransferAmount ?? defaultSettings.maxTransferAmount),
      transferMethod: plainSettings.transferMethod ?? securePayload.transferMethod ?? defaultSettings.transferMethod,
      ussdAutomationSpeed: plainSettings.ussdAutomationSpeed ?? defaultSettings.ussdAutomationSpeed,
      periodicBalanceCheckerEnabled: Boolean(
        plainSettings.periodicBalanceCheckerEnabled ?? defaultSettings.periodicBalanceCheckerEnabled,
      ),
      balanceCheckIntervalMinutes: this.normalizeBalanceInterval(plainSettings.balanceCheckIntervalMinutes),
    };
  },

  async save(settings: AppSettings) {
    await Keychain.setGenericPassword(
      'sarifpro',
      JSON.stringify({
        accountNumber: settings.accountNumber,
        pin1: settings.pin1,
        pin2: settings.pin2,
        bankPin: settings.bankPin,
        shortcode: settings.shortcode,
      }),
      {service: SECURE_SERVICE},
    );

    appStorage.set(
      PLAIN_KEY,
      JSON.stringify({
        automationEnabled: settings.automationEnabled,
        monitoring898Enabled: settings.monitoring898Enabled,
        periodicBalanceCheckerEnabled: settings.periodicBalanceCheckerEnabled,
        balanceCheckIntervalMinutes: settings.balanceCheckIntervalMinutes,
        minimumBalanceThreshold: settings.minimumBalanceThreshold,
        maxTransferAmount: settings.maxTransferAmount,
        transferMethod: settings.transferMethod,
        ussdAutomationSpeed: settings.ussdAutomationSpeed,
      }),
    );
  },

  normalizeBalanceInterval(value?: number): AppSettings['balanceCheckIntervalMinutes'] {
    return ([0, 1, 2, 5, 10] as const).includes(value as AppSettings['balanceCheckIntervalMinutes'])
      ? (value as AppSettings['balanceCheckIntervalMinutes'])
      : defaultSettings.balanceCheckIntervalMinutes;
  },
};
