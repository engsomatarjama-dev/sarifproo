import {AppSettings} from '../types';

export const normalizeUssdAmount = (amount: number) => {
  if (!Number.isFinite(amount)) {
    return '';
  }
  const normalized = truncateToTwoDecimals(amount);
  const {wholePart, decimalPart} = splitTransferAmount(normalized);
  return decimalPart > 0 ? `${wholePart}*${String(decimalPart).padStart(2, '0')}` : String(wholePart);
};

/**
 * Converts a finite number to integer minor units (cents) by truncating --
 * never rounding -- to two decimal places, without going through a
 * `value * 100` floating-point multiplication. `Math.floor(value * 100)`
 * is not safe for money: binary floating-point cannot represent most
 * decimal fractions exactly, so multiplying by 100 can land a hair below
 * the intended integer (e.g. 2.01 * 100 === 200.99999999999997), silently
 * truncating an already-exact two-decimal value one cent low. Parsing the
 * number's own decimal string instead only ever does exact integer
 * arithmetic (whole * 100 + fractional cents), which has no such failure
 * mode for realistic money magnitudes. Returns undefined for non-finite
 * input or a value whose decimal string can't be parsed as a plain
 * (optionally negative) decimal -- e.g. anything JS renders in
 * exponential notation -- so callers fail closed exactly as before.
 */
export const parseMoneyToMinorUnits = (value: number): number | undefined => {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const negative = value < 0;
  const match = Math.abs(value).toString().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return undefined;
  }
  const wholeUnits = Number(match[1]);
  const fractionalDigits = (match[2] ?? '').padEnd(2, '0').slice(0, 2);
  const minorUnits = wholeUnits * 100 + Number(fractionalDigits);
  return negative ? -minorUnits : minorUnits;
};

export const truncateToTwoDecimals = (value: number): number => {
  const minorUnits = parseMoneyToMinorUnits(value);
  return minorUnits === undefined ? NaN : minorUnits / 100;
};

export const splitTransferAmount = (value: number) => {
  const minorUnits = parseMoneyToMinorUnits(value);
  if (minorUnits === undefined) {
    return {wholePart: 0, decimalPart: 0};
  }
  const absoluteMinorUnits = Math.abs(minorUnits);
  return {
    wholePart: Math.floor(absoluteMinorUnits / 100),
    decimalPart: absoluteMinorUnits % 100,
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
