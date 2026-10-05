import {describe, expect, it} from '@jest/globals';
import {PHYSICAL_TERMINAL_SCREENS} from '../../__fixtures__/terminalScreens';
import {terminalErrorClassifier} from '../TerminalErrorClassifier';
import {ussdResultParserService} from '../UssdResultParserService';
import {formatTransferAmountForInput, truncateToTwoDecimals} from '../../utils/ussd';

// Characterization of EXISTING behavior against REAL physical terminal screens,
// plus the arithmetic a future residual-balance policy would need. Nothing here
// changes production code or money-moving behavior.

// Test-local mirror of SarifAccessibilityService.extractFirstAmount (Kotlin):
// first "$N", otherwise the first bare number anywhere in the text.
const mirrorOfNativeExtractFirstAmount = (text: string) => {
  const dollar = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/)?.[1];
  if (dollar) {
    return dollar;
  }
  return text.match(/\b([0-9]+(?:\.[0-9]+)?)\b/)?.[1] ?? '';
};

// Test-local REFERENCE policy (specification, not production code).
// A displayed balance with N decimals may be a ROUNDED value, so the true
// balance is only guaranteed >= displayed - 0.5 * 10^-N. The safe sweep amount
// is that floor truncated (never rounded) to whole cents.
const referenceSafeSweepCents = (displayed: string) => {
  const match = displayed.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return 0;
  }
  const decimals = (match[2] ?? '').length;
  const scaled = Number(match[1] + (match[2] ?? ''));
  const worstCase = scaled * 10 - 5; // units of 10^-(decimals+1)
  if (worstCase <= 0) {
    return 0;
  }
  return decimals >= 1 ? Math.floor(worstCase / 10 ** (decimals - 1)) : worstCase * 10;
};

const insufficient = PHYSICAL_TERMINAL_SCREENS.filter(f => f.kind === 'FAILED_INSUFFICIENT_BALANCE');
const successes = PHYSICAL_TERMINAL_SCREENS.filter(f => f.kind !== 'FAILED_INSUFFICIENT_BALANCE');

describe('real physical terminal screens: fixtures are self-consistent', () => {
  it.each(PHYSICAL_TERMINAL_SCREENS.map(f => [f.id, f] as const))('%s: remaining balance is the number directly after its label', (_id, fixture) => {
    const {remainingLabel, remainingBalanceRaw, decimalsShown} = fixture.target;
    const labelled = new RegExp(`${remainingLabel}(?:\\s+waa)?\\s*[:=]?\\s*\\$?\\s*(\\d+(?:\\.\\d+)?)`, 'i');
    expect(fixture.text.match(labelled)?.[1]).toBe(remainingBalanceRaw);
    expect((remainingBalanceRaw.split('.')[1] ?? '').length).toBe(decimalsShown);
  });

  it('contains no real identifiers (placeholders only)', () => {
    for (const fixture of PHYSICAL_TERMINAL_SCREENS) {
      expect(fixture.text).not.toMatch(/\b2526\d{8}\b/);
      expect(fixture.text).not.toMatch(/639XXX97/);
    }
  });
});

describe('what production does today with the real insufficient-balance screens (Case 2)', () => {
  it.each(insufficient.map(f => [f.id, f] as const))('%s: classified as an insufficient-balance failure', (_id, fixture) => {
    expect(terminalErrorClassifier.classify(fixture.text)).toMatchObject({
      code: 'insufficient_balance',
      matchedPatternName: 'insufficient_balance',
    });
    const parsed = ussdResultParserService.parse(fixture.text);
    expect(parsed.status).toBe('failed');
    expect(parsed.errorCode).toBe('insufficient_balance');
  });

  it.each(insufficient.map(f => [f.id, f] as const))(
    '%s: generic first-number extraction returns the REMAINING balance, which production would mislabel as the transfer amount',
    (_id, fixture) => {
      // This is the semantic collision: for a failure there is no transferred
      // amount, so the first number IS the residual -- but the bridge calls it `amount`.
      expect(mirrorOfNativeExtractFirstAmount(fixture.text)).toBe(fixture.target.remainingBalanceRaw);
    },
  );
});

describe('what production does today with the real success screens (Case 3)', () => {
  it.each(successes.map(f => [f.id, f] as const))('%s: classified as success; remaining balance is not exposed', (_id, fixture) => {
    const parsed = ussdResultParserService.parse(fixture.text);
    expect(parsed.status).toBe('completed');
    expect(parsed.amount).toBe(Number(fixture.target.transferredAmount));
    expect(parsed).not.toHaveProperty('remainingBalance');
    expect(parsed.message).not.toContain(fixture.target.remainingBalanceRaw);
  });

  it.each(successes.map(f => [f.id, f] as const))('%s: first-$ extraction yields the transferred amount, not the residual', (_id, fixture) => {
    expect(mirrorOfNativeExtractFirstAmount(fixture.text)).toBe(fixture.target.transferredAmount);
  });
});

describe('existing production truncation rule applied to the real residuals', () => {
  it('truncates (never rounds) 3-decimal insufficient-balance residuals', () => {
    expect(truncateToTwoDecimals(2.109)).toBe(2.1);
    expect(truncateToTwoDecimals(0.009)).toBe(0);
    expect(formatTransferAmountForInput(2.109)).toBe('2.10');
    expect(formatTransferAmountForInput(0.009)).toBe('0');
  });

  it('is a no-op on the 2-decimal success residuals, so it cannot protect against display rounding', () => {
    expect(truncateToTwoDecimals(2.11)).toBe(2.11);
    expect(truncateToTwoDecimals(1.01)).toBe(1.01);
    // 2.11 shown on a success screen vs 2.109 revealed by the insufficient screen:
    // sweeping the displayed 2.11 would exceed the real balance by 0.001.
    expect(truncateToTwoDecimals(2.11)).toBeGreaterThan(2.109);
  });
});

describe('reference residual sweep policy (specification for the shadow phase)', () => {
  it.each([
    ['2.109', 210],
    ['0.009', 0],
    ['2.11', 210],
    ['1.01', 100],
    ['0.01', 0],
    ['0.0', 0],
    ['0', 0],
    ['0.00', 0],
    ['2.1', 205],
    ['5', 450],
    ['429.9868', 42998],
  ])('displayed %s -> %i cents', (displayed, cents) => {
    expect(referenceSafeSweepCents(displayed)).toBe(cents);
  });

  it('never exceeds the real balance for any true balance, under both display models (rounded or truncated)', () => {
    // Work in integer ten-thousandths of a dollar to avoid float noise.
    const display = (trueTenThousandths: number, decimals: number, mode: 'round' | 'truncate') => {
      const unit = 10 ** (4 - decimals); // ten-thousandths per displayed unit
      const units = mode === 'round' ? Math.floor((trueTenThousandths + unit / 2) / unit) : Math.floor(trueTenThousandths / unit);
      const text = (units / 10 ** decimals).toFixed(decimals);
      return text;
    };
    let violations = 0;
    let checked = 0;
    for (let t = 0; t <= 60000; t += 1) {
      const trueCentsFloor = Math.floor(t / 100);
      for (const decimals of [1, 2, 3]) {
        for (const mode of ['round', 'truncate'] as const) {
          checked += 1;
          if (referenceSafeSweepCents(display(t, decimals, mode)) > trueCentsFloor) {
            violations += 1;
          }
        }
      }
    }
    expect(checked).toBe(60001 * 6);
    expect(violations).toBe(0);
  });

  it('the naive rule (truncate the displayed value) DOES overshoot under display rounding', () => {
    // true balance 2.109 displayed as 2.11 at two decimals -> naive 211 cents > 210 available
    const naiveCents = Math.floor(Number('2.11') * 100 + 1e-9);
    expect(naiveCents).toBeGreaterThan(Math.floor(2.109 * 100));
    expect(referenceSafeSweepCents('2.11')).toBe(210);
  });
});
