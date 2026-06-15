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
  normalizedMessage: string;
  matchedPatternName: string;
  matchedText?: string;
}

type TerminalPattern = Pick<TerminalUssdErrorMatch, 'code' | 'reason' | 'matchedPatternName'> & {
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
  {code: 'invalid_pin', reason: 'invalid pin', matchedPatternName: 'invalid_pin', pattern: /invalid\s+pin/i},
  {code: 'pin_incorrect', reason: 'pin incorrect', matchedPatternName: 'pin_incorrect', pattern: /pin\s+incorrect/i},
  {code: 'invalid_mmi', reason: 'invalid mmi code', matchedPatternName: 'invalid_mmi', pattern: /connection\s+problem\s+or\s+invalid\s+mmi\s+code|invalid\s+mmi(?:\s+code)?|mmi\s+code/i},
  {code: 'network_error', reason: 'network error', matchedPatternName: 'network_error', pattern: /network\s+error/i},
  {code: 'connection_problem', reason: 'connection problem', matchedPatternName: 'connection_problem', pattern: /connection\s+problem/i},
  {code: 'service_unavailable', reason: 'service unavailable', matchedPatternName: 'service_unavailable', pattern: /service\s+unavailable/i},
  {code: 'timeout', reason: 'timeout', matchedPatternName: 'timeout', pattern: /request\s+timed\s+out|timed\s+out|time\s+out|timeout/i},
  {code: 'try_again', reason: 'try again', matchedPatternName: 'try_again', pattern: /try\s+again/i},
  {code: 'session_expired', reason: 'session expired', matchedPatternName: 'session_expired', pattern: /session\s+expired/i},
  {code: 'invalid_input', reason: 'invalid input', matchedPatternName: 'invalid_input', pattern: /invalid\s+input/i},
  {code: 'invalid_menu', reason: 'invalid menu', matchedPatternName: 'invalid_menu', pattern: /invalid\s+menu|please\s+select\s+valid\s+option/i},
  {code: 'transaction_failed', reason: 'transaction failed', matchedPatternName: 'transaction_failed', pattern: /transaction\s+failed/i},
  {code: 'transfer_failed', reason: 'transfer failed', matchedPatternName: 'transfer_failed', pattern: /transfer\s+failed/i},
  {code: 'insufficient_balance', reason: 'insufficient balance', matchedPatternName: 'insufficient_balance', pattern: /hadhaagaagu\s+kuguma\s+filna|lacagta\s+kuguma\s+filna|kuguma\s+filna|kuma\s+filna|insufficient\s+funds|balance\s+insufficient|not\s+enough\s+balance|insufficient/i},
  {code: 'generic_failed', reason: 'failed', matchedPatternName: 'generic_failed', pattern: /failed/i},
  {code: 'generic_error', reason: 'error', matchedPatternName: 'generic_error', pattern: /error/i},
  {code: 'somali_error', reason: 'qalad', matchedPatternName: 'somali_error', pattern: /qalad|khalad/i},
  {code: 'not_completed', reason: 'not completed', matchedPatternName: 'not_completed', pattern: /ma\s+dhicin|lama\s+fulin/i},
  {code: 'try_again', reason: 'try again', matchedPatternName: 'somali_try_again', pattern: /isku\s+day\s+mar\s+kale/i},
];

class TerminalErrorClassifier {
  normalize(message: string) {
    return normalizeTerminalUssdText(message);
  }

  classify(message: string): TerminalUssdErrorMatch | undefined {
    const normalized = normalizeTerminalUssdText(message);
    for (const item of terminalUssdErrorPatterns) {
      const match = normalized.match(item.pattern);
      if (match) {
        return {
          code: item.code,
          reason: item.reason,
          normalizedMessage: normalized,
          matchedPatternName: item.matchedPatternName,
          matchedText: match[0],
        };
      }
    }
    return undefined;
  }

  isTerminalError(message: string) {
    return Boolean(this.classify(message));
  }
}

export const terminalErrorClassifier = new TerminalErrorClassifier();
