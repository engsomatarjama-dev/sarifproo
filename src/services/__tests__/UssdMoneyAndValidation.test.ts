import {describe, expect, it} from '@jest/globals';
import {AppSettings} from '../../types';
import {
  buildAccountTransferUssd,
  formatTransferAmountForInput,
  parseMoneyToMinorUnits,
  truncateToTwoDecimals,
  validateBankDepositSettings,
  validateTransferSettings,
} from '../../utils/ussd';

const settings: AppSettings = {
  accountNumber: '4636240',
  pin1: '1122',
  pin2: '3344',
  bankPin: '123456',
  shortcode: '806',
  transferMethod: 'DIRECT_TRANSFER',
  ussdAutomationSpeed: 'FAST',
  automationEnabled: true,
  monitoring898Enabled: true,
  periodicBalanceCheckerEnabled: false,
  balanceCheckIntervalMinutes: 5,
  minimumBalanceThreshold: 0,
  maxTransferAmount: 1000,
};

describe('USSD money parsing and validation', () => {
  it.each([
    [50.6555, 5065, 50.65, '50.65'],
    [10.5699, 1056, 10.56, '10.56'],
    [0.109, 10, 0.1, '0.10'],
    [0.101, 10, 0.1, '0.10'],
    [0.1, 10, 0.1, '0.10'],
    [10, 1000, 10, '10'],
  ])('truncates %s deterministically without rounding', (input, minorUnits, truncated, inputText) => {
    expect(parseMoneyToMinorUnits(input)).toBe(minorUnits);
    expect(truncateToTwoDecimals(input)).toBe(truncated);
    expect(formatTransferAmountForInput(input)).toBe(inputText);
  });

  it('rejects malformed monetary input', () => {
    expect(parseMoneyToMinorUnits('10.5.1')).toBeUndefined();
    expect(parseMoneyToMinorUnits('abc')).toBeUndefined();
    expect(parseMoneyToMinorUnits('')).toBeUndefined();
  });

  it('keeps direct transfer USSD formatting deterministic at money boundaries', () => {
    expect(buildAccountTransferUssd(settings, 50.6555)).toBe('*806*4636240*50*65*1122#');
    expect(buildAccountTransferUssd(settings, 0.109)).toBe('*806*4636240*0*10*1122#');
    expect(buildAccountTransferUssd(settings, 10)).toBe('*806*4636240*10*1122#');
  });

  it('rejects missing and invalid direct transfer destination settings before dialing', () => {
    expect(validateTransferSettings({...settings, accountNumber: ''}, 10)).toBe('Account number is invalid.');
    expect(validateTransferSettings({...settings, accountNumber: '12'}, 10)).toBe('Account number is invalid.');
    expect(validateTransferSettings({...settings, shortcode: 'abc'}, 10)).toBe('Shortcode is invalid.');
    expect(validateTransferSettings({...settings, pin1: ''}, 10)).toBe('PIN1 is invalid.');
  });

  it('rejects invalid bank deposit settings before dialing', () => {
    expect(validateBankDepositSettings({...settings, pin2: ''}, 10)).toBe('PIN2 is required for Dara-Salaam Bank automation.');
    expect(validateBankDepositSettings({...settings, bankPin: '12345'}, 10)).toBe('Bank PIN must be exactly 6 digits.');
    expect(validateBankDepositSettings(settings, 0)).toBe('Dara-Salaam amount must be positive.');
  });
});
