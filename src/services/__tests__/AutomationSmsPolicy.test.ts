import {describe, expect, it} from '@jest/globals';
import {
  is898Sender,
  looksLikeBalanceMessage,
  looksLikeIncomingBalanceTrigger,
  looksLikeOutgoingTransferConfirmation,
} from '../AutomationSmsPolicy';

describe('AutomationSmsPolicy', () => {
  it('recognizes sender 898 variants', () => {
    expect(is898Sender('898')).toBe(true);
    expect(is898Sender('+252898')).toBe(true);
    expect(is898Sender('Telesom')).toBe(false);
  });

  it('treats outgoing 898 confirmations as passive confirmation messages', () => {
    expect(
      looksLikeOutgoingTransferConfirmation(
        '<-ADEEGA SARIFKA-> $100 ayaad u dirtay CABDIKARIIM(252634736240) Tar:03/06/26',
      ),
    ).toBe(true);
    expect(
      looksLikeOutgoingTransferConfirmation(
        'Waxaad $2.5 u sariftay SLSH25,000 NUUX AXMED(252634422749).',
      ),
    ).toBe(true);
  });

  it('recognizes 898 balance-style messages that can enter the existing balance automation path', () => {
    const balance = '[-ADEEGA SARIFKA-] Xisaabtaada(2072429-25263872480) Hadhaageedu waa $10.56';

    expect(looksLikeIncomingBalanceTrigger(balance)).toBe(true);
    expect(looksLikeBalanceMessage(balance)).toBe(true);
    expect(looksLikeOutgoingTransferConfirmation(balance)).toBe(false);
  });

  it('does not classify unrelated 898 text as a balance transfer trigger', () => {
    const message = 'Adeeggaagu wuu shaqaynayaa. Fadlan isku day mar kale.';

    expect(looksLikeIncomingBalanceTrigger(message)).toBe(false);
    expect(looksLikeBalanceMessage(message)).toBe(false);
  });
});
