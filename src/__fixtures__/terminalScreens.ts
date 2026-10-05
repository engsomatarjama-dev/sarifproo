// REAL physical terminal-screen shapes, transcribed from phone screenshots taken
// on 2026-10-04/05 on the production device (Samsung SM-A065F, Zaad
// "ADEEGA SARIFKA" USSD). Recipient name, phone number, Tix reference, masked
// bank account and timestamp are replaced with placeholders on purpose: only
// the SHAPE and the money values are kept. Do not paste real identifiers here.
//
// `target` is the semantic interpretation a future parser must produce. It is a
// specification for the shadow/validation phase, not current production
// behavior (see TerminalScreenFixtures.test.ts for what production does today).

export type FixtureKind = 'SUCCESS_DIRECT' | 'SUCCESS_BANK' | 'FAILED_INSUFFICIENT_BALANCE';

export interface TerminalScreenFixture {
  id: string;
  kind: FixtureKind;
  // Text as it appears on screen (button label "OK" excluded).
  text: string;
  target: {
    status: 'SUCCESS' | 'FAILED';
    failureReason?: 'INSUFFICIENT_BALANCE';
    transferredAmount?: string;
    // Literal substring the remaining balance was read from (preserves decimals).
    remainingBalanceRaw: string;
    remainingLabel: 'Hadhaagaaga' | 'Hadhaagaagu';
    decimalsShown: number;
    remainingBalanceConfidence: 'HIGH';
  };
  note: string;
}

export const PHYSICAL_TERMINAL_SCREENS: TerminalScreenFixture[] = [
  {
    id: 'insufficient-0.009',
    kind: 'FAILED_INSUFFICIENT_BALANCE',
    text: 'Hadhaagaagu kuguma filna. Hadhaagaagu waa 0.009',
    target: {
      status: 'FAILED',
      failureReason: 'INSUFFICIENT_BALANCE',
      remainingBalanceRaw: '0.009',
      remainingLabel: 'Hadhaagaagu',
      decimalsShown: 3,
      remainingBalanceConfidence: 'HIGH',
    },
    note: 'No $ sign, no <-ADEEGA SARIFKA-> header, 3 decimals. The residual is sub-cent dust.',
  },
  {
    id: 'insufficient-2.109',
    kind: 'FAILED_INSUFFICIENT_BALANCE',
    text: 'Hadhaagaagu kuguma filna. Hadhaagaagu waa 2.109',
    target: {
      status: 'FAILED',
      failureReason: 'INSUFFICIENT_BALANCE',
      remainingBalanceRaw: '2.109',
      remainingLabel: 'Hadhaagaagu',
      decimalsShown: 3,
      remainingBalanceConfidence: 'HIGH',
    },
    note: '3 decimals. A 2-decimal success display of the same balance would read 2.11.',
  },
  {
    id: 'success-direct-1.01',
    kind: 'SUCCESS_DIRECT',
    text:
      '<-ADEEGA SARIFKA- > Tix:10000000000, $ 106 ayaad u dirtay TEST RECEIVER NAME(252000000000) ' +
      'Tar:01/01/26 00:00:00, Hadhaagaaga:$ 1.01',
    target: {
      status: 'SUCCESS',
      transferredAmount: '106',
      remainingBalanceRaw: '1.01',
      remainingLabel: 'Hadhaagaaga',
      decimalsShown: 2,
      remainingBalanceConfidence: 'HIGH',
    },
    note: 'Has a Tix: reference, a 12-digit phone and a date/time besides the two money values; space after $.',
  },
  {
    id: 'success-bank-2.11',
    kind: 'SUCCESS_BANK',
    text:
      '<-ADEEGA SARIFKA- > Waxaad $3 ku shubtey bank account-kaaga: 000XXX00, Hadhaagaaga waa $2.11.',
    target: {
      status: 'SUCCESS',
      transferredAmount: '3',
      remainingBalanceRaw: '2.11',
      remainingLabel: 'Hadhaagaaga',
      decimalsShown: 2,
      remainingBalanceConfidence: 'HIGH',
    },
    note: 'Dara-Salaam bank deposit shape (the one this device uses). 2 decimals, trailing period.',
  },
];
