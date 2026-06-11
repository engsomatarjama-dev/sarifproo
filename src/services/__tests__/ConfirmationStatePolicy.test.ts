import {describe, expect, it} from '@jest/globals';
import {canStartAwaitingConfirmation} from '../ConfirmationStatePolicy';

describe('ConfirmationStatePolicy', () => {
  it('allows pending/running transactions to enter awaiting confirmation', () => {
    expect(canStartAwaitingConfirmation('pending')).toBe(true);
    expect(canStartAwaitingConfirmation('running')).toBe(true);
    expect(canStartAwaitingConfirmation('failed')).toBe(true);
    expect(canStartAwaitingConfirmation('unknown_result')).toBe(true);
  });

  it('does not allow an 898-completed transaction to be downgraded to awaiting confirmation', () => {
    expect(canStartAwaitingConfirmation('completed')).toBe(false);
  });
});
