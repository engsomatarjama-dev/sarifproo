export type TerminalUssdErrorCode =
  | 'invalid_pin'
  | 'pin_incorrect'
  | 'network_error'
  | 'connection_problem'
  | 'service_unavailable'
  | 'timeout'
  | 'try_again'
  | 'session_expired'
  | 'invalid_input'
  | 'invalid_menu'
  | 'invalid_mmi'
  | 'transaction_failed'
  | 'transfer_failed'
  | 'generic_failed'
  | 'generic_error'
  | 'somali_error'
  | 'not_completed'
  | 'insufficient_balance';

export interface TerminalUssdErrorMatch {
  code: TerminalUssdErrorCode;
  reason: string;
}

type TerminalPattern = TerminalUssdErrorMatch & {
  pattern: RegExp;
};

export const normalizeTerminalUssdText = (message: string) =>
  message
    .toLowerCase()
    .replace(/[\u2010-\u2014]/g, '-')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

export const terminalUssdErrorPatterns: TerminalPattern[] = [
  {code: 'invalid_pin', reason: 'invalid pin', pattern: /invalid\s+pin/i},
  {code: 'pin_incorrect', reason: 'pin incorrect', pattern: /pin\s+incorrect/i},
  {code: 'network_error', reason: 'network error', pattern: /network\s+error/i},
  {code: 'connection_problem', reason: 'connection problem', pattern: /connection\s+problem/i},
  {code: 'service_unavailable', reason: 'service unavailable', pattern: /service\s+unavailable/i},
  {code: 'timeout', reason: 'timeout', pattern: /timeout/i},
  {code: 'try_again', reason: 'try again', pattern: /try\s+again/i},
  {code: 'session_expired', reason: 'session expired', pattern: /session\s+expired/i},
  {code: 'invalid_input', reason: 'invalid input', pattern: /invalid\s+input/i},
  {code: 'invalid_menu', reason: 'invalid menu', pattern: /invalid\s+menu|please\s+select\s+valid\s+option/i},
  {code: 'invalid_mmi', reason: 'invalid mmi code', pattern: /invalid\s+mmi(?:\s+code)?|mmi\s+code/i},
  {code: 'transaction_failed', reason: 'transaction failed', pattern: /transaction\s+failed/i},
  {code: 'transfer_failed', reason: 'transfer failed', pattern: /transfer\s+failed/i},
  {code: 'generic_failed', reason: 'failed', pattern: /failed/i},
  {code: 'generic_error', reason: 'error', pattern: /error/i},
  {code: 'somali_error', reason: 'qalad', pattern: /qalad|khalad/i},
  {code: 'not_completed', reason: 'not completed', pattern: /ma\s+dhicin|lama\s+fulin/i},
  {code: 'insufficient_balance', reason: 'insufficient balance', pattern: /insufficient|kuma\s+filna/i},
  {code: 'try_again', reason: 'try again', pattern: /isku\s+day\s+mar\s+kale/i},
];

class TerminalErrorClassifier {
  normalize(message: string) {
    return normalizeTerminalUssdText(message);
  }

  classify(message: string): TerminalUssdErrorMatch | undefined {
    const normalized = normalizeTerminalUssdText(message);
    const match = terminalUssdErrorPatterns.find(item => item.pattern.test(normalized));
    return match ? {code: match.code, reason: match.reason} : undefined;
  }

  isTerminalError(message: string) {
    return Boolean(this.classify(message));
  }
}

export const terminalErrorClassifier = new TerminalErrorClassifier();
