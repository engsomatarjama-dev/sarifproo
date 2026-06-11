import {accessibilityNative} from '../native/SarifNative';
import {AppSettings} from '../types';
import {useAppStore} from '../store/useAppStore';

class AccessibilityAutomationService {
  async syncPin2(pin2: string) {
    await accessibilityNative.updatePin2(pin2);
  }

  async syncBankPin(bankPin: string) {
    await accessibilityNative.updateBankPin(bankPin);
  }

  async syncAutomationSecrets(pin2: string, bankPin: string) {
    await Promise.all([this.syncPin2(pin2), this.syncBankPin(bankPin)]);
  }

  async syncAutomationSpeed(speed: AppSettings['ussdAutomationSpeed']) {
    await accessibilityNative.setAutomationSpeed(speed);
  }

  async syncAutomationSettings(settings: AppSettings) {
    await Promise.all([
      this.syncPin2(settings.pin2),
      this.syncBankPin(settings.bankPin),
      this.syncAutomationSpeed(settings.ussdAutomationSpeed),
    ]);
  }

  async refreshStatus() {
    const enabled = await accessibilityNative.isEnabled();
    useAppStore.getState().setAccessibilityEnabled(enabled);
    return enabled;
  }
}

export const accessibilityAutomationService = new AccessibilityAutomationService();
