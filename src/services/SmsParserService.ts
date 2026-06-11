import {BalanceParseResult, ExchangeParseResult, SmsClassification} from '../types';
import {normalizePhone, normalizeSms} from '../utils/sms';

const usdAmount = String.raw`\$?\s*(\d+(?:\.\d+)?)`;

const receivedUsdPatterns = [
  new RegExp(String.raw`Tix(?:raac)?\s*:\s*(\d+)\s*,\s*Waxaad\s*${usdAmount}\s*ka\s*heshay\s+[\s\S]*?\((\d{7,15})\)`, 'i'),
];

const exchangeRecordPatterns = [
  new RegExp(String.raw`Tix(?:raac)?\s*:\s*(\d+)\s*,\s*Waxaad\s*${usdAmount}\s*u\s*sariftay\s*SLSH[\d.,]+\s*.*?\((\d{7,15})\)`, 'i'),
  new RegExp(String.raw`Ref\s*:\s*(\d+)\s*,\s*You have exchanged\s*${usdAmount}\s*to\s*SLSH[\d.,]+\s*for\s*.*?\((\d{7,15})\)`, 'i'),
];

const balancePatterns = [
  /Hadhaageedu\s*waa\s*\$?\s*([\d.,]+)/i,
  /Hadhaagaag(?:a|u)?(?:\s*waa)?\s*[:=]?\s*\$?\s*([\d.,]+)/i,
  /balance\s*(?:is|=|waa)?\s*\$?\s*([\d.,]+)/i,
];

const toNumber = (value: string) => Number(value.replace(/,/g, '').trim());

const extractBalanceAmount = (body: string) => {
  for (const pattern of balancePatterns) {
    const match = body.match(pattern);
    if (match) {
      return toNumber(match[1]);
    }
  }
  return undefined;
};

class SmsParserService {
  classify(rawSms: string): SmsClassification {
    const body = normalizeSms(rawSms);
    const normalizedBody = body.toLowerCase();

    if (normalizedBody.includes('ka heshay')) {
      return 'RECEIVED_USD';
    }

    if (normalizedBody.includes('u sariftay') || normalizedBody.includes('you have exchanged')) {
      return 'EXCHANGED_USD';
    }

    return 'UNKNOWN';
  }

  parseExchange(rawSms: string): ExchangeParseResult | null {
    const body = normalizeSms(rawSms);
    const classification = this.classify(body);
    const patterns = classification === 'RECEIVED_USD' ? receivedUsdPatterns : exchangeRecordPatterns;

    if (classification === 'UNKNOWN') {
      return null;
    }

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (!match) {
        continue;
      }

      const receivedAmount = toNumber(match[2]);
      const balanceAmount = classification === 'RECEIVED_USD' ? extractBalanceAmount(body) : undefined;
      const transferAmount = balanceAmount !== undefined ? balanceAmount : receivedAmount;

      return {
        reference: match[1],
        amount: transferAmount,
        receivedAmount,
        balanceAmount,
        amountSource: balanceAmount !== undefined ? 'balance' : 'received',
        classification,
        phone: normalizePhone(match[3]),
        raw: body,
      };
    }
    return null;
  }

  parseBalance(rawSms: string): BalanceParseResult | null {
    const body = normalizeSms(rawSms);
    const classification = this.classify(body);
    if (classification !== 'UNKNOWN') {
      return null;
    }

    for (const pattern of balancePatterns) {
      const match = body.match(pattern);
      if (match) {
        return {
          balance: toNumber(match[1]),
          raw: body,
        };
      }
    }
    return null;
  }
}

export const smsParserService = new SmsParserService();
