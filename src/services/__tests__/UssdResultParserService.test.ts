import {describe, expect, it} from '@jest/globals';
import {ussdResultParserService} from '../UssdResultParserService';

describe('UssdResultParserService', () => {
  it('classifies direct transfer success screens', () => {
    const result = ussdResultParserService.parse(
      '<-ADEEGA SARIFKA-> $100 ayaad u dirtay CABDIKARIIM CALI CABDILLAHI XUSEEN(252634736240) Tar:03/06/26 11:50:48 Hadhaagaaga:$0.0',
    );

    expect(result.status).toBe('completed');
    expect(result.classification).toBe('DIRECT_TRANSFER_SUCCESS');
    expect(result.transactionType).toBe('direct_transfer');
    expect(result.amount).toBe(100);
    expect(result.receiverName).toBe('CABDIKARIIM CALI CABDILLAHI XUSEEN');
    expect(result.receiverPhone).toBe('252634736240');
    expect(result.bankAccount).toBeUndefined();
    expect(result.message).not.toContain('Hadhaagaaga');
    expect(result.message).not.toContain('$0.0');
    expect(result).not.toHaveProperty('remainingBalance');
  });

  it('classifies bank deposit success screens', () => {
    const result = ussdResultParserService.parse(
      '<-ADEEGA SARIFKA-> $100 ayaad ku shubtay bank account-kaaga :639XXX97 Hadhaagaagu waa $0.0',
    );

    expect(result.status).toBe('completed');
    expect(result.classification).toBe('BANK_DEPOSIT_SUCCESS');
    expect(result.transactionType).toBe('bank_deposit');
    expect(result.amount).toBe(100);
    expect(result.bankAccount).toBe('639XXX97');
    expect(result.receiverPhone).toBeUndefined();
    expect(result.message).not.toContain('Hadhaagaagu');
    expect(result.message).not.toContain('$0.0');
    expect(result).not.toHaveProperty('remainingBalance');
  });

  it('classifies production direct transfer success with header spacing and line breaks', () => {
    const result = ussdResultParserService.parse(
      '<-ADEEGA SARIFKA- >\n$100 ayaad u dirtay CABDIKARIIM CALI CABDILLAHI XUSEEN(252634736240) Tar:03/06/26 11:50:48, Hadhaagaaga:$0.0',
    );

    expect(result.status).toBe('completed');
    expect(result.classification).toBe('DIRECT_TRANSFER_SUCCESS');
    expect(result.transactionType).toBe('direct_transfer');
    expect(result.amount).toBe(100);
    expect(result.receiverName).toBe('CABDIKARIIM CALI CABDILLAHI XUSEEN');
    expect(result.receiverPhone).toBe('252634736240');
  });

  it('classifies production bank deposit success with header spacing and line breaks', () => {
    const result = ussdResultParserService.parse(
      '<-ADEEGA SARIFKA- >\n$100 ayaad ku shubtay bank account-kaaga :639XXX97, Hadhaagaagu waa $0.0.',
    );

    expect(result.status).toBe('completed');
    expect(result.classification).toBe('BANK_DEPOSIT_SUCCESS');
    expect(result.transactionType).toBe('bank_deposit');
    expect(result.amount).toBe(100);
    expect(result.bankAccount).toBe('639XXX97');
  });

  it('classifies Dara-Salaam shubtey bank deposit success and ignores remaining balance', () => {
    const result = ussdResultParserService.parse(
      '<-ADEEGA SARIFKA- > Waxaad $25.50 ku shubtey bank account-kaaga :639XXX97, Hadhaagaaga waa $0.00.',
    );

    expect(result.status).toBe('completed');
    expect(result.classification).toBe('BANK_DEPOSIT_SUCCESS');
    expect(result.transactionType).toBe('bank_deposit');
    expect(result.amount).toBe(25.5);
    expect(result.bankAccount).toBe('639XXX97');
    expect(result.receiverPhone).toBeUndefined();
    expect(result.message).not.toContain('Hadhaagaaga');
    expect(result.message).not.toContain('$0.00');
    expect(result).not.toHaveProperty('remainingBalance');
  });

  it('classifies error screens', () => {
    const result = ussdResultParserService.parse('Transaction failed. Invalid PIN. Isku day mar kale.');

    expect(result.status).toBe('failed');
    expect(result.classification).toBe('FAILED_RESULT');
    expect(result.failureReason).toBe('invalid pin');
  });

  it('classifies network error screens as failed', () => {
    const result = ussdResultParserService.parse('Network error. Connection problem. Try again.');

    expect(result.status).toBe('failed');
    expect(result.classification).toBe('FAILED_RESULT');
    expect(result.failureReason).toBe('network error');
  });

  it('classifies invalid menu screens as failed terminal USSD results', () => {
    const result = ussdResultParserService.parse('Invalid menu, please select valid option.');

    expect(result.status).toBe('failed');
    expect(result.classification).toBe('FAILED_RESULT');
    expect(result.failureReason).toBe('invalid menu');
  });

  it('classifies invalid MMI code screens as failed terminal USSD results', () => {
    const result = ussdResultParserService.parse('Connection problem or invalid MMI code.');

    expect(result.status).toBe('failed');
    expect(result.classification).toBe('FAILED_RESULT');
    expect(result.failureReason).toBe('connection problem');
  });

  it('treats unexpected final USSD screens as failed', () => {
    const result = ussdResultParserService.parse('<-ADEEGA SARIFKA-> Fariin aan la garanayn. OK');

    expect(result.status).toBe('failed');
    expect(result.classification).toBe('FAILED_RESULT');
    expect(result.failureReason).toBe('unknown_or_unexpected_ussd_result');
  });
});
