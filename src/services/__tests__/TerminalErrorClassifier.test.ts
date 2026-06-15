import {describe, expect, it} from '@jest/globals';
import {terminalErrorClassifier} from '../TerminalErrorClassifier';

describe('TerminalErrorClassifier', () => {
  it.each([
    ['Hadhaagaagu kuguma filna', 'insufficient_balance', 'insufficient balance', 'insufficient_balance'],
    ['Lacagta kuguma filna', 'insufficient_balance', 'insufficient balance', 'insufficient_balance'],
    ['Insufficient funds. Not enough balance.', 'insufficient_balance', 'insufficient balance', 'insufficient_balance'],
    ['Balance insufficient.', 'insufficient_balance', 'insufficient balance', 'insufficient_balance'],
    ['Invalid PIN.', 'invalid_pin', 'invalid pin', 'invalid_pin'],
    ['Invalid menu, please select valid option.', 'invalid_menu', 'invalid menu', 'invalid_menu'],
    ['Connection problem or invalid MMI code.', 'invalid_mmi', 'invalid mmi code', 'invalid_mmi'],
    ['Network error. Try again.', 'network_error', 'network error', 'network_error'],
    ['Session expired.', 'session_expired', 'session expired', 'session_expired'],
    ['Request timed out.', 'timeout', 'timeout', 'timeout'],
  ])('classifies %s', (message, code, reason, matchedPatternName) => {
    expect(terminalErrorClassifier.classify(message)).toMatchObject({
      code,
      reason,
      matchedPatternName,
      normalizedMessage: expect.any(String),
      matchedText: expect.any(String),
    });
  });

  it('normalizes multiline and hyphen-variant USSD text before matching', () => {
    const result = terminalErrorClassifier.classify('Connection\u2011problem\nor invalid MMI code.');

    expect(result).toMatchObject({
      code: 'invalid_mmi',
      reason: 'invalid mmi code',
      matchedPatternName: 'invalid_mmi',
    });
  });

  it('does not classify unknown final shells as terminal errors', () => {
    expect(terminalErrorClassifier.classify('<-ADEEGA SARIFKA-> Fariin aan la garanayn. OK')).toBeUndefined();
  });
});
