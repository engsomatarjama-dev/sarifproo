import {UssdFinalResult} from '../types';
import {terminalErrorClassifier} from './TerminalErrorClassifier';

const successPatterns = [
  /ayaad\s+u\s+dirtay/i,
  /waad\s+dirtay/i,
  /waa\s+la\s+diray/i,
  /lacagta\s+waa\s+la\s+diray/i,
  /transfer\s+completed/i,
  /transaction\s+completed/i,
  /successfully\s+sent/i,
  /successful/i,
  /completed/i,
];

const bankSuccessPatterns = [
  /ayaad\s+ku\s+shubt[ae]y\s+bank\s+account[-\s]?kaaga/i,
  /waxaad\s+\$?\s*[\d,.]+\s+ku\s+shubt[ae]y\s+bank\s+account[-\s]?kaaga/i,
  /ku\s+shubt[ae]y\s+bank\s+account[-\s]?kaaga/i,
];

const firstMatch = (message: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
};

const toAmount = (value?: string) => (value ? Number(value.replace(/,/g, '')) : undefined);

const stripTransferBalanceFragments = (message: string) =>
  message
    .replace(/Hadhaagaag(?:a|u)?(?:\s+waa)?\s*[:=]?\s*\$?\s*[\d,.]+\.?/gi, '')
    .replace(/balance\s*(?:is|=|waa)?\s*\$?\s*[\d,.]+\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

class UssdResultParserService {
  parse(message: string): UssdFinalResult {
    const normalized = terminalErrorClassifier.normalize(message);
    const isBank = bankSuccessPatterns.some(pattern => pattern.test(normalized));
    const isSuccess = isBank || successPatterns.some(pattern => pattern.test(normalized));
    const terminalError = terminalErrorClassifier.classify(normalized);
    const status: UssdFinalResult['status'] = terminalError ? 'failed' : isSuccess ? 'completed' : 'unknown_result';
    const transactionType = isBank ? 'bank_deposit' : isSuccess ? 'direct_transfer' : 'unknown';
    const classification: UssdFinalResult['classification'] =
      status === 'completed' && transactionType === 'direct_transfer'
        ? 'DIRECT_TRANSFER_SUCCESS'
        : status === 'completed' && transactionType === 'bank_deposit'
          ? 'BANK_DEPOSIT_SUCCESS'
          : status === 'failed'
            ? 'FAILED_RESULT'
            : 'UNKNOWN_RESULT';
    const storedMessage =
      transactionType === 'direct_transfer' || transactionType === 'bank_deposit'
        ? stripTransferBalanceFragments(message)
        : message;

    return {
      status,
      classification,
      transactionType,
      message: storedMessage,
      amount: toAmount(firstMatch(message, [/\$\s*([\d,.]+)/])),
      receiverName: firstMatch(message, [/u\s+dirtay\s+(.+?)\(\d{7,15}\)/i]),
      receiverPhone: firstMatch(message, [/\((\d{7,15})\)/]),
      bankAccount: firstMatch(message, [/bank\s+account-kaaga\s*:?\s*([0-9xX*]+)/i]),
      failureReason: terminalError?.reason ?? (!isSuccess ? 'unknown_or_unexpected_ussd_result' : undefined),
      dismissed: false,
      timestamp: Date.now(),
    };
  }
}

export const ussdResultParserService = new UssdResultParserService();
