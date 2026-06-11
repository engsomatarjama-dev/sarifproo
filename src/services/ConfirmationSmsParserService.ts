import {ConfirmationParseResult} from '../types';
import {normalizePhone, normalizeSms} from '../utils/sms';

const normalizeForMatch = (value: string) =>
  normalizeSms(value)
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const moneyPattern = String.raw`\$\s*(\d+(?:\.\d+)?)`;

class ConfirmationSmsParserService {
  parse(rawSms: string): ConfirmationParseResult | null {
    const body = normalizeForMatch(rawSms);
    return this.parseDirectTransfer(body, rawSms) ?? this.parseBankDeposit(body, rawSms);
  }

  private parseDirectTransfer(body: string, rawSms: string): ConfirmationParseResult | null {
    const pattern = new RegExp(
      String.raw`Tix\s*:\s*(\d+)\s*,\s*${moneyPattern}\s+ayaad\s+u\s+dirtay\s+(.+?)\s*\((\d{6,15})\)\s+Tar\s*:\s*([^,]+?)(?:\s*,|\s*$)`,
      'i',
    );
    const match = body.match(pattern);
    if (match) {
      const amount = Number(match[2]);
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return {
        transactionType: 'direct_transfer',
        reference: match[1],
        amount,
        receiverName: match[3].replace(/\s+/g, ' ').trim(),
        receiverPhone: normalizePhone(match[4]),
        transactionDate: match[5].replace(/\s+/g, ' ').trim(),
        raw: rawSms,
      };
    }

    const normalized = body.toLowerCase();
    if (!normalized.includes('ayaad u dirtay')) {
      return null;
    }

    const amountMatch = body.match(/\$\s*(\d+(?:\.\d+)?)/);
    const receiverMatch = body.match(/ayaad\s+u\s+dirtay\s+(.+?)\s*\((\d{6,15})\)/i);
    if (!amountMatch || !receiverMatch) {
      return null;
    }

    const amount = Number(amountMatch[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const referenceMatch = body.match(/(?:Tix|Tixraac)\s*:\s*(\d+)/i);
    const dateMatch = body.match(/Tar\s*:\s*([^,]+?)(?:,|\s*$)/i);
    return {
      transactionType: 'direct_transfer',
      reference: referenceMatch?.[1],
      amount,
      receiverName: receiverMatch[1].replace(/\s+/g, ' ').trim(),
      receiverPhone: normalizePhone(receiverMatch[2]),
      transactionDate: dateMatch?.[1]?.replace(/\s+/g, ' ').trim(),
      raw: rawSms,
    };
  }

  private parseBankDeposit(body: string, rawSms: string): ConfirmationParseResult | null {
    const pattern = new RegExp(
      String.raw`Waxaad\s+${moneyPattern}\s+ku\s+shubt[ae]y\s+bank\s+account[-\s]?kaaga\s*:\s*([A-Z0-9*X]+)`,
      'i',
    );
    const match = body.match(pattern);
    if (match) {
      return this.buildBankDepositResult(match[1], match[2], rawSms);
    }

    const normalized = body.toLowerCase();
    const hasBankDepositSuccess =
      /bank\s+account[-\s]?kaaga/i.test(body) &&
      (normalized.includes('ku shubtey') || normalized.includes('ku shubtay'));
    if (!hasBankDepositSuccess) {
      return null;
    }

    const amountMatch = body.match(/\$\s*(\d+(?:\.\d+)?)/);
    const bankMatch = body.match(/bank\s+account[-\s]?kaaga\s*:?\s*([A-Z0-9*X]+)/i);
    if (!amountMatch || !bankMatch) {
      return null;
    }
    return this.buildBankDepositResult(amountMatch[1], bankMatch[1], rawSms);
  }

  private buildBankDepositResult(amountValue: string, bankAccountValue: string, rawSms: string): ConfirmationParseResult | null {
    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    return {
      transactionType: 'bank_deposit',
      amount,
      bankAccount: bankAccountValue.replace(/\s+/g, '').trim(),
      raw: rawSms,
    };
  }
}

export const confirmationSmsParserService = new ConfirmationSmsParserService();
