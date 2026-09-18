import {describe, expect, it} from '@jest/globals';
import {
  buildAccountTransferUssd,
  buildPeriodicBalanceTransferUssd,
  formatTransferAmountForInput,
  normalizeUssdAmount,
  parseMoneyToMinorUnits,
  splitTransferAmount,
  truncateToTwoDecimals,
} from '../ussd';
import {AppSettings} from '../../types';

const settings = (overrides: Partial<AppSettings> = {}): AppSettings =>
  ({
    accountNumber: '1234567',
    shortcode: '828',
    pin1: '1234',
    maxTransferAmount: 100000,
    minimumBalanceThreshold: 1,
    transferMethod: 'DIRECT_TRANSFER',
    pin2: '',
    bankPin: '',
    ussdAutomationSpeed: 'SAFE',
    ...overrides,
  }) as AppSettings;

describe('truncateToTwoDecimals -- required vectors', () => {
  it.each([
    [50.6555, 50.65],
    [10.5699, 10.56],
    [0.109, 0.1],
    [0.101, 0.1],
    [0.1, 0.1],
    [10, 10],
  ])('truncates %p to %p', (input, expected) => {
    expect(truncateToTwoDecimals(input)).toBe(expected);
  });
});

describe('truncateToTwoDecimals -- additional vectors', () => {
  it.each([
    [0, 0],
    [0.001, 0],
    [0.009, 0],
    [0.999, 0.99],
    [1.999, 1.99],
    [99.9999, 99.99],
    [999.9999, 999.99],
    [10000.5555, 10000.55],
  ])('truncates %p to %p', (input, expected) => {
    expect(truncateToTwoDecimals(input)).toBe(expected);
  });
});

describe('truncateToTwoDecimals -- verified v1.0.44 float-multiplication defect (regression)', () => {
  // These are real, exact two-decimal values -- nothing should be truncated at
  // all -- where Math.floor(value * 100) / 100 silently lands one cent low
  // because value * 100 does not land on the exact integer in IEEE-754
  // double arithmetic. Verified empirically: 587,200 of 10,000,001 exact
  // two-decimal values from 0.00 to 100000.00 are wrongly truncated by the
  // old implementation, always low, never high.
  it.each([
    [0.29, 0.29],
    [0.57, 0.57],
    [0.58, 0.58],
    [1.13, 1.13],
    [1.14, 1.14],
    [1.15, 1.15],
    [1.16, 1.16],
    [2.01, 2.01],
    [2.03, 2.03],
    [2.05, 2.05],
    [2.07, 2.07],
    [2.26, 2.26],
    [2.28, 2.28],
    [2.3, 2.3],
    [2.32, 2.32],
  ])('an exact two-decimal value %p must round-trip unchanged, not one cent low, to %p', (input, expected) => {
    expect(truncateToTwoDecimals(input)).toBe(expected);
    // Sanity: confirm this vector actually demonstrates the old defect,
    // so this test would have failed against the pre-Sprint-3 implementation.
    expect(Math.floor(input * 100) / 100).not.toBe(expected);
  });
});

describe('truncateToTwoDecimals -- invalid/non-finite input fails closed exactly as before', () => {
  it.each([NaN, Infinity, -Infinity])('returns NaN for %p (unchanged fail-closed contract)', input => {
    expect(Number.isNaN(truncateToTwoDecimals(input))).toBe(true);
  });
});

describe('truncateToTwoDecimals -- negative input (unreachable in production, documented for completeness)', () => {
  it('truncates toward zero, preserving sign', () => {
    // No production caller ever passes a negative amount here (SMS/USSD
    // amount regexes never capture a leading '-', and validateTransferSettings
    // rejects amount <= 0 downstream regardless of this function's output),
    // but the string-based implementation happens to truncate-toward-zero
    // rather than the old Math.floor's floor-toward-negative-infinity, which
    // is the more correct interpretation of "truncate" for a signed value.
    expect(truncateToTwoDecimals(-5.6555)).toBe(-5.65);
  });
});

describe('parseMoneyToMinorUnits', () => {
  it('converts to integer cents', () => {
    expect(parseMoneyToMinorUnits(50.65)).toBe(5065);
    expect(parseMoneyToMinorUnits(10)).toBe(1000);
    expect(parseMoneyToMinorUnits(0)).toBe(0);
  });

  it('returns undefined for non-finite input', () => {
    expect(parseMoneyToMinorUnits(NaN)).toBeUndefined();
    expect(parseMoneyToMinorUnits(Infinity)).toBeUndefined();
  });
});

describe('splitTransferAmount', () => {
  it.each([
    [10.56, 10, 56],
    [2.5, 2, 50],
    [50.65, 50, 65],
    [100, 100, 0],
    [0.5, 0, 50],
  ])('splits %p into whole=%p decimal=%p', (input, wholePart, decimalPart) => {
    expect(splitTransferAmount(input)).toEqual({wholePart, decimalPart});
  });

  it('falls back to zero for invalid input rather than throwing or guessing', () => {
    expect(splitTransferAmount(NaN)).toEqual({wholePart: 0, decimalPart: 0});
  });
});

describe('normalizeUssdAmount / formatTransferAmountForInput -- USSD string formatting stays stable', () => {
  it.each([
    [2.5, '2*50', '2.50'],
    [10.56, '10*56', '10.56'],
    [50.65, '50*65', '50.65'],
    [100, '100', '100'],
  ])('formats %p identically to the pre-Sprint-3 implementation', (input, ussdStyle, dottedStyle) => {
    expect(normalizeUssdAmount(input)).toBe(ussdStyle);
    expect(formatTransferAmountForInput(input)).toBe(dottedStyle);
  });
});

describe('buildAccountTransferUssd / buildPeriodicBalanceTransferUssd -- end-to-end dial-string generation', () => {
  // Fake, non-production account/shortcode/PIN values -- exercising string
  // generation only, never a real transfer.
  it.each([2.5, 10.56, 50.65, 100])('direct transfer USSD for amount %p matches the expected format', amount => {
    const s = settings();
    const ussd = buildAccountTransferUssd(s, amount);
    expect(ussd).toBe(`*828*1234567*${normalizeUssdAmount(amount)}*1234#`);
  });

  it.each([2.5, 10.56, 50.65, 100])('periodic balance transfer USSD for amount %p matches the expected format', amount => {
    const s = settings();
    const ussd = buildPeriodicBalanceTransferUssd(s, amount);
    const {wholePart, decimalPart} = splitTransferAmount(amount);
    const expected =
      decimalPart > 0
        ? `*828*1234567*${wholePart}*${String(decimalPart).padStart(2, '0')}*1234#`
        : `*828*1234567*${wholePart}*1234#`;
    expect(ussd).toBe(expected);
  });

  it('rejects a settings/amount combination that fails validation rather than silently building a bad dial string', () => {
    const s = settings({accountNumber: ''});
    expect(() => buildAccountTransferUssd(s, 10.56)).toThrow('Account number is invalid.');
  });
});
