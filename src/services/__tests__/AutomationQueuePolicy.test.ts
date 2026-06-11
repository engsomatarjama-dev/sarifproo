import {describe, expect, it} from '@jest/globals';
import {AUTOMATION_JOB_PRIORITIES, isSmsAutomationJob, isUssdAutomationJob, shouldSkipJobWhenBusy} from '../AutomationQueuePolicy';

describe('AutomationQueuePolicy', () => {
  it('prioritizes confirmation SMS before transfers and balance checks', () => {
    expect(AUTOMATION_JOB_PRIORITIES.confirmation_898).toBeLessThan(AUTOMATION_JOB_PRIORITIES.sms_direct_transfer);
    expect(AUTOMATION_JOB_PRIORITIES.sms_direct_transfer).toBeLessThan(AUTOMATION_JOB_PRIORITIES.balance_direct_transfer);
    expect(AUTOMATION_JOB_PRIORITIES.balance_direct_transfer).toBeLessThan(AUTOMATION_JOB_PRIORITIES.balance_check);
  });

  it('skips periodic balance checks while automation is busy or recovering', () => {
    expect(shouldSkipJobWhenBusy('balance_check', 'BUSY')).toBe(true);
    expect(shouldSkipJobWhenBusy('balance_check', 'RECOVERING')).toBe(true);
    expect(shouldSkipJobWhenBusy('balance_check', 'IDLE')).toBe(false);
  });

  it('does not skip SMS transfer jobs just because automation is busy', () => {
    expect(shouldSkipJobWhenBusy('sms_direct_transfer', 'BUSY')).toBe(false);
    expect(shouldSkipJobWhenBusy('sms_bank_deposit', 'RECOVERING')).toBe(false);
    expect(isSmsAutomationJob('sms_direct_transfer')).toBe(true);
    expect(isSmsAutomationJob('balance_check')).toBe(false);
  });

  it('treats transfer and balance jobs as USSD-producing but not 898 confirmation', () => {
    expect(isUssdAutomationJob('sms_direct_transfer')).toBe(true);
    expect(isUssdAutomationJob('sms_bank_deposit')).toBe(true);
    expect(isUssdAutomationJob('balance_check')).toBe(true);
    expect(isUssdAutomationJob('balance_direct_transfer')).toBe(true);
    expect(isUssdAutomationJob('balance_bank_deposit')).toBe(true);
    expect(isUssdAutomationJob('confirmation_898')).toBe(false);
  });
});
