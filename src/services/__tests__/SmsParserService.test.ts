import {describe, expect, it} from '@jest/globals';
import {smsParserService} from '../SmsParserService';
import {AppSettings} from '../../types';
import {buildAccountTransferUssd, resolveTransferDestination} from '../../utils/ussd';

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

describe('SmsParserService classification', () => {
  it('classifies received USD messages as automation triggers', () => {
    const sms =
      '[-ADEEGA SARIFKA-] Tix: 14809804625, Waxaad $100 ka heshay SARRIFLAHA GOBSOOR (252638724820) Tar: 17/05/26 11:05:00, Hadhaagaaga:$223.06';

    const parsed = smsParserService.parseExchange(sms);

    expect(parsed).toMatchObject({
      classification: 'RECEIVED_USD',
      amount: 223.06,
      receivedAmount: 100,
      balanceAmount: 223.06,
      amountSource: 'balance',
      phone: '252638724820',
      reference: '14809804625',
    });
    expect(resolveTransferDestination(settings)).toBe(settings.accountNumber);
    expect(resolveTransferDestination(settings)).not.toBe(parsed?.phone);
    expect(buildAccountTransferUssd(settings, parsed?.amount ?? 0)).toBe('*806*4636240*223*06*1122#');
    expect(smsParserService.parseBalance(sms)).toBeNull();
  });

  it('classifies u sariftay messages as automation triggers to the configured account', () => {
    const sms =
      '[-[-ADEEGA SARIFKA-]-] Tixraac: 14807170160, Waxaad $2.5 u sariftay SLSH25,000 NUUX AXMED MAXAMUUD NUUX(252634422749).';

    const parsed = smsParserService.parseExchange(sms);

    expect(parsed).toMatchObject({
      classification: 'EXCHANGED_USD',
      amount: 2.5,
      phone: '252634422749',
      reference: '14807170160',
    });
    expect(resolveTransferDestination(settings)).toBe(settings.accountNumber);
    expect(resolveTransferDestination(settings)).not.toBe(parsed?.phone);
    expect(buildAccountTransferUssd(settings, parsed?.amount ?? 0)).toBe('*806*4636240*2*50*1122#');
    expect(smsParserService.parseBalance(sms)).toBeNull();
  });

  it('truncates transfer decimals without rounding for direct USSD', () => {
    expect(buildAccountTransferUssd(settings, 2.567)).toBe('*806*4636240*2*56*1122#');
    expect(buildAccountTransferUssd(settings, 10.999)).toBe('*806*4636240*10*99*1122#');
    expect(buildAccountTransferUssd(settings, 100.129)).toBe('*806*4636240*100*12*1122#');
  });

  it('parses balance result screens before dismissal', () => {
    const sms = '[-ADEEGA SARIFKA-] Xisaabtaada(2072429-25263872480) Hadhaageedu waa $10.56 OK';

    const parsed = smsParserService.parseBalance(sms);

    expect(parsed?.balance).toBe(10.56);
  });
});
