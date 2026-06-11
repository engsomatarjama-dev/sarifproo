import * as Keychain from 'react-native-keychain';
import {securityNative} from '../native/SarifNative';

const INTEGRITY_SERVICE = 'sarifpro.integrity';

export const securityService = {
  async getDeviceId() {
    return securityNative.getAndroidId();
  },

  async getIntegritySalt() {
    const existing = await Keychain.getGenericPassword({service: INTEGRITY_SERVICE});
    if (existing && existing.password) {
      return existing.password;
    }
    const generated = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await Keychain.setGenericPassword('sarifpro', generated, {service: INTEGRITY_SERVICE});
    return generated;
  },

  async hash(value: string) {
    return securityNative.sha256(value);
  },
};
