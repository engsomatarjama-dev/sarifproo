import {AppSettings} from '../types';

export const parseMoneyToMinorUnits = (value: number | string) => {
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  const match = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return undefined;
  }

  const whole = Number(match[1]);
  if (!Number.isSafeInteger(whole)) {
    return undefined;
  }

  const decimal = (match[2] ?? '').padEnd(2, '0').slice(0, 2);
  const cents = Number(decimal || '0');
  return whole * 100 + cents;
};

export const normalizeUssdAmount = (amount: number) => {
  const minorUnits = parseMoneyToMinorUnits(amount);
  if (minorUnits === undefined) {
    return '';
  }
  const {wholePart, decimalPart} = splitMinorUnits(minorUnits);
  return decimalPart > 0 ? `${wholePart}*${String(decimalPart).padStart(2, '0')}` : String(wholePart);
};

export const truncateToTwoDecimals = (value: number): number => {
  const minorUnits = parseMoneyToMinorUnits(value);
  return minorUnits === undefined ? NaN : minorUnits / 100;
};

const splitMinorUnits = (minorUnits: number) => ({
  wholePart: Math.floor(minorUnits / 100),
  decimalPart: minorUnits % 100,
});

export const splitTransferAmount = (value: number) => {
  const minorUnits = parseMoneyToMinorUnits(value);
  if (minorUnits === undefined) {
    return {wholePart: 0, decimalPart: 0};
  }
  return splitMinorUnits(minorUnits);
};

export const formatTransferAmountForInput = (value: number) => {
  const {wholePart, decimalPart} = splitTransferAmount(value);
  return decimalPart > 0 ? `${wholePart}.${String(decimalPart).padStart(2, '0')}` : String(wholePart);
};

export const resolveTransferDestination = (settings: AppSettings) => settings.accountNumber;

const ACCOUNT_PATTERN = /^\d{5,15}$/;
const SHORTCODE_PATTERN = /^\d{2,6}$/;
const PIN_PATTERN = /^\d{4,8}$/;
const BANK_PIN_PATTERN = /^\d{6}$/;

export const validateTransferSettings = (settings: AppSettings, amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Transfer amount must be positive.';
  }
  if (amount > settings.maxTransferAmount) {
    return 'Transfer amount exceeds the configured maximum limit.';
  }
  if (!ACCOUNT_PATTERN.test(settings.accountNumber)) {
    return 'Account number is invalid.';
  }
  if (!SHORTCODE_PATTERN.test(settings.shortcode)) {
    return 'Shortcode is invalid.';
  }
  if (!PIN_PATTERN.test(settings.pin1)) {
    return 'PIN1 is invalid.';
  }
  return undefined;
};

export const validateBankDepositSettings = (settings: AppSettings, amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Dara-Salaam amount must be positive.';
  }
  if (amount > settings.maxTransferAmount) {
    return 'Transfer amount exceeds the configured maximum limit.';
  }
  if (!settings.pin2) {
    return 'PIN2 is required for Dara-Salaam Bank automation.';
  }
  if (!BANK_PIN_PATTERN.test(settings.bankPin)) {
    return 'Bank PIN must be exactly 6 digits.';
  }
  return undefined;
};

export const buildAccountTransferUssd = (settings: AppSettings, amount: number) => {
  const transferAmount = truncateToTwoDecimals(amount);
  const validationError = validateTransferSettings(settings, transferAmount);
  if (validationError) {
    throw new Error(validationError);
  }
  return `*${settings.shortcode}*${resolveTransferDestination(settings)}*${normalizeUssdAmount(transferAmount)}*${settings.pin1}#`;
};

export const buildPeriodicBalanceTransferUssd = (settings: AppSettings, balance: number) => {
  const transferBalance = truncateToTwoDecimals(balance);
  const validationError = validateTransferSettings(settings, transferBalance);
  if (validationError) {
    throw new Error(validationError);
  }

  const {wholePart, decimalPart} = splitTransferAmount(transferBalance);
  if (decimalPart > 0) {
    return `*${settings.shortcode}*${resolveTransferDestination(settings)}*${wholePart}*${String(decimalPart).padStart(2, '0')}*${settings.pin1}#`;
  }
  return `*${settings.shortcode}*${resolveTransferDestination(settings)}*${wholePart}*${settings.pin1}#`;
};
