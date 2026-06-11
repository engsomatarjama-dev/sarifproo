import {appStorage} from './StorageService';

const REF_KEY = 'processed.references';
const HASH_KEY = 'processed.smsHashes';
const LAST_TRANSFER_KEY = 'processed.lastTransferTimestamp';
const LAST_BALANCE_CHECK_KEY = 'periodicBalance.lastCheckTimestamp';
const LAST_BALANCE_TRANSFER_AMOUNT_KEY = 'periodicBalance.lastTransferAmount';
const LAST_BALANCE_TRANSFER_KEY = 'periodicBalance.lastTransferTimestamp';

const readStringArray = (key: string) => {
  const raw = appStorage.getString(key);
  return raw ? (JSON.parse(raw) as string[]) : [];
};

const writeStringArray = (key: string, values: string[]) => {
  const deduped = Array.from(new Set(values)).slice(-500);
  appStorage.set(key, JSON.stringify(deduped));
};

export const duplicateGuardService = {
  hasReference(reference: string) {
    return readStringArray(REF_KEY).includes(reference);
  },

  rememberReference(reference: string) {
    writeStringArray(REF_KEY, [...readStringArray(REF_KEY), reference]);
  },

  hasSmsHash(hash: string) {
    return readStringArray(HASH_KEY).includes(hash);
  },

  rememberSmsHash(hash: string) {
    writeStringArray(HASH_KEY, [...readStringArray(HASH_KEY), hash]);
  },

  canTransferNow(cooldownMs = 30_000) {
    const last = appStorage.getNumber(LAST_TRANSFER_KEY) ?? 0;
    return Date.now() - Number(last) > cooldownMs;
  },

  rememberTransferNow() {
    appStorage.set(LAST_TRANSFER_KEY, Date.now());
  },

  getLastBalanceCheckTimestamp() {
    return appStorage.getNumber(LAST_BALANCE_CHECK_KEY) ?? 0;
  },

  rememberBalanceCheckNow() {
    appStorage.set(LAST_BALANCE_CHECK_KEY, Date.now());
  },

  canTransferPeriodicBalance(amount: number, cooldownMs = 5 * 60 * 1000) {
    const lastAmount = appStorage.getNumber(LAST_BALANCE_TRANSFER_AMOUNT_KEY);
    const lastTimestamp = appStorage.getNumber(LAST_BALANCE_TRANSFER_KEY) ?? 0;
    return !(Number(lastAmount) === amount && Date.now() - Number(lastTimestamp) < cooldownMs);
  },

  rememberPeriodicBalanceTransfer(amount: number) {
    appStorage.set(LAST_BALANCE_TRANSFER_AMOUNT_KEY, amount);
    appStorage.set(LAST_BALANCE_TRANSFER_KEY, Date.now());
  },
};
