import {describe, expect, it} from '@jest/globals';
import {terminalErrorClassifier} from '../TerminalErrorClassifier';

describe('TerminalErrorClassifier', () => {
  it.each([
    ['Invalid PIN.', 'invalid_pin', 'invalid pin'],
    ['Insufficient balance. Lacagtu kuma filna.', 'insufficient_balance', 'insufficient balance'],
    ['Invalid menu, please select valid option.', 'invalid_menu', 'invalid menu'],
    ['Connection problem or invalid MMI code.', 'connection_problem', 'connection problem'],
    ['Network error. Try again.', 'network_error', 'network error'],
    ['Session expired.', 'session_expired', 'session expired'],
  ])('classifies %s', (message, code, reason) => {
    expect(terminalErrorClassifier.classify(message)).toEqual({code, reason});
  });

  it('normalizes multiline and hyphen-variant USSD text before matching', () => {
    const result = terminalErrorClassifier.classify('Connection\u2011problem\nor invalid MMI code.');

    expect(result).toEqual({code: 'invalid_mmi', reason: 'invalid mmi code'});
  });

  it('does not classify unknown final shells as terminal errors', () => {
    expect(terminalErrorClassifier.classify('<-ADEEGA SARIFKA-> Fariin aan la garanayn. OK')).toBeUndefined();
  });
});
