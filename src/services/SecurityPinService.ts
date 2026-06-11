import * as Keychain from 'react-native-keychain';
import {appStorage} from './StorageService';
import {securityNative} from '../native/SarifNative';
import {supabaseAuthService} from './SupabaseAuthService';
import {useAppStore} from '../store/useAppStore';

const SECURE_SERVICE = 'sarifpro.security.pin';
const ATTEMPTS_KEY = 'securityPin.failedAttempts';
const LOCKED_UNTIL_KEY = 'securityPin.lockedUntil';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const UNLOCK_TTL_MS = 5 * 60 * 1000;

type PinRecord = {
  salt: string;
  hash: string;
  createdAt: number;
  updatedAt: number;
};

type VerifyResult =
  | {ok: true}
  | {ok: false; reason: 'locked'; lockedUntil: number}
  | {ok: false; reason: 'incorrect'; attemptsRemaining: number}
  | {ok: false; reason: 'missing_pin'};

const normalizePin = (pin: string) => pin.replace(/\D/g, '').slice(0, 6);

class SecurityPinService {
  private unlockedUntil = 0;

  normalize(pin: string) {
    return normalizePin(pin);
  }

  isValidPin(pin: string) {
    return /^\d{4,6}$/.test(pin);
  }

  async hasPin() {
    const record = await this.getRecord();
    return Boolean(record?.hash && record.salt);
  }

  isUnlocked() {
    return Date.now() < this.unlockedUntil;
  }

  lock() {
    this.unlockedUntil = 0;
  }

  async createPin(pin: string) {
    const normalized = normalizePin(pin);
    if (!this.isValidPin(normalized)) {
      throw new Error('Security PIN must be 4 to 6 digits.');
    }
    const now = Date.now();
    const salt = `${now}.${Math.random().toString(36).slice(2)}.${Math.random().toString(36).slice(2)}`;
    const record: PinRecord = {
      salt,
      hash: await this.hashPin(normalized, salt),
      createdAt: now,
      updatedAt: now,
    };
    await this.saveRecord(record);
    this.clearFailedAttempts();
    this.markUnlocked();
  }

  async verifyPin(pin: string): Promise<VerifyResult> {
    const lockedUntil = this.getLockedUntil();
    if (lockedUntil > Date.now()) {
      return {ok: false, reason: 'locked', lockedUntil};
    }

    const record = await this.getRecord();
    if (!record) {
      return {ok: false, reason: 'missing_pin'};
    }

    const hash = await this.hashPin(normalizePin(pin), record.salt);
    if (hash === record.hash) {
      this.clearFailedAttempts();
      this.markUnlocked();
      return {ok: true};
    }

    const attempts = this.getFailedAttempts() + 1;
    appStorage.set(ATTEMPTS_KEY, attempts);
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attempts);
    if (attempts >= MAX_ATTEMPTS) {
      const nextLockedUntil = Date.now() + LOCKOUT_MS;
      appStorage.set(LOCKED_UNTIL_KEY, nextLockedUntil);
      return {ok: false, reason: 'locked', lockedUntil: nextLockedUntil};
    }
    return {ok: false, reason: 'incorrect', attemptsRemaining};
  }

  async changePin(currentPin: string, newPin: string) {
    const verified = await this.verifyPin(currentPin);
    if (!verified.ok) {
      return verified;
    }
    await this.createPin(newPin);
    return {ok: true as const};
  }

  async resetAfterPassword(password: string, newPin: string) {
    const email = useAppStore.getState().auth.userEmail;
    if (!email) {
      throw new Error('Login is required before resetting the security PIN.');
    }
    const result = await supabaseAuthService.verifyPassword(email, password);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    await this.createPin(newPin);
  }

  getAttemptsRemaining() {
    return Math.max(0, MAX_ATTEMPTS - this.getFailedAttempts());
  }

  getLockRemainingMs() {
    return Math.max(0, this.getLockedUntil() - Date.now());
  }

  private markUnlocked() {
    this.unlockedUntil = Date.now() + UNLOCK_TTL_MS;
  }

  private clearFailedAttempts() {
    appStorage.delete(ATTEMPTS_KEY);
    appStorage.delete(LOCKED_UNTIL_KEY);
  }

  private getFailedAttempts() {
    return appStorage.getNumber(ATTEMPTS_KEY) ?? 0;
  }

  private getLockedUntil() {
    return appStorage.getNumber(LOCKED_UNTIL_KEY) ?? 0;
  }

  private async getRecord() {
    const secure = await Keychain.getGenericPassword({service: SECURE_SERVICE});
    if (!secure || typeof secure.password !== 'string') {
      return undefined;
    }
    try {
      return JSON.parse(secure.password) as PinRecord;
    } catch {
      return undefined;
    }
  }

  private async saveRecord(record: PinRecord) {
    await Keychain.setGenericPassword('sarifpro-security-pin', JSON.stringify(record), {
      service: SECURE_SERVICE,
    });
  }

  private async hashPin(pin: string, salt: string) {
    return securityNative.sha256(`${salt}:${pin}`);
  }
}

export const securityPinService = new SecurityPinService();
