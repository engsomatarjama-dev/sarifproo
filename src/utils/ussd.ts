import {AppSettings} from '../types';

export const normalizeUssdAmount = (amount: number) => {
  if (!Number.isFinite(amount)) {
    return '';
  }
  const normalized = truncateToTwoDecimals(amount);
  const {wholePart, decimalPart} = splitTransferAmount(normalized);
  return decimalPart > 0 ? `${wholePart}*${String(decimalPart).padStart(2, '0')}` : String(wholePart);
};

export const truncateToTwoDecimals = (value: number): number => Math.floor(value * 100) / 100;

export const splitTransferAmount = (value: number) => {
  const normalized = truncateToTwoDecimals(value);
  const cents = Math.floor(normalized * 100 + 0.000001);
  return {
    wholePart: Math.floor(cents / 100),
    decimalPart: cents % 100,
  };
};

export const formatTransferAmountForInput = (value: number) => {
  const {wholePart, decimalPart} = splitTransferAmount(value);
  return decimalPart > 0 ? `${wholePart}.${String(decimalPart).padStart(2, '0')}` : String(wholePart);
};

export const resolveTransferDestination = (settings: AppSettings) => settings.accountNumber;

const ACCOUNT_PATTERN = /^\d{5,15}$/;
const SHORTCODE_PATTERN = /^\d{2,6}$/;
const PIN_PATTERN = /^\d{4,8}$/;

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
