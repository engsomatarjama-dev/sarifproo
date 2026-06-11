import {describe, expect, it} from '@jest/globals';
import {confirmationSmsParserService} from '../ConfirmationSmsParserService';

describe('ConfirmationSmsParserService', () => {
  it('parses direct transfer confirmations from 898 without using remaining balance', () => {
    const sms =
      '[-ADEEGA SARIFKA-] Tix:14771078211, $ 100.95 ayaad u dirtay CABDIKARIIM CALI CABDILAAHI XUSEEN(252634736240) Tar:12/05/26 16:13:24, Hadhaagaaga:$ 0';

    const result = confirmationSmsParserService.parse(sms);

    expect(result).toEqual({
      transactionType: 'direct_transfer',
      reference: '14771078211',
      amount: 100.95,
      receiverName: 'CABDIKARIIM CALI CABDILAAHI XUSEEN',
      receiverPhone: '252634736240',
      transactionDate: '12/05/26 16:13:24',
      raw: sms,
    });
  });

  it('parses direct transfer confirmations even when Tix is missing from visible text', () => {
    const sms =
      '<-ADEEGA SARIFKA-> $100 ayaad u dirtay CABDIKARIIM CALI CABDILLAHI XUSEEN(252634736240) Tar:03/06/26 11:50:48, Hadhaagaaga:$0.0';

    const result = confirmationSmsParserService.parse(sms);

    expect(result).toEqual({
      transactionType: 'direct_transfer',
      reference: undefined,
      amount: 100,
      receiverName: 'CABDIKARIIM CALI CABDILLAHI XUSEEN',
      receiverPhone: '252634736240',
      transactionDate: '03/06/26 11:50:48',
      raw: sms,
    });
  });

  it('parses bank deposit confirmations with shubtey spelling', () => {
    const sms = '[-ADEEGA SARIFKA-] Waxaad $8 ku shubtey bank account-kaaga: 639XXX97, Hadhaagaaga waa $0.';

    const result = confirmationSmsParserService.parse(sms);

    expect(result).toEqual({
      transactionType: 'bank_deposit',
      amount: 8,
      bankAccount: '639XXX97',
      raw: sms,
    });
  });

  it('parses real 898 bank deposit confirmation with 0.1 amount and ignores remaining balance', () => {
    const sms = '[-ADEEGA SARIFKA-] Waxaad $0.1 ku shubtey bank account-kaaga: 639XXX97, Hadhaagaaga waa $0.';

    const result = confirmationSmsParserService.parse(sms);

    expect(result).toEqual({
      transactionType: 'bank_deposit',
      amount: 0.1,
      bankAccount: '639XXX97',
      raw: sms,
    });
  });

  it('parses bank deposit confirmations with shubtay spelling and spaced dollars', () => {
    const sms = '[-ADEEGA SARIFKA-] Waxaad $ 10.50 ku shubtay bank account kaaga: 639XXX97, Hadhaagaagu waa $0.00.';

    const result = confirmationSmsParserService.parse(sms);

    expect(result?.transactionType).toBe('bank_deposit');
    expect(result?.amount).toBe(10.5);
    expect(result?.bankAccount).toBe('639XXX97');
  });

  it('rejects non-confirmation balance messages', () => {
    const sms = '[-ADEEGA SARIFKA-] Xisaabtaada(2072429-25263872480) Hadhaageedu waa $10.56';

    expect(confirmationSmsParserService.parse(sms)).toBeNull();
  });
});
