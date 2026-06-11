import {AutomationJobType, AutomationLockState} from './AutomationLockService';

export const AUTOMATION_JOB_PRIORITIES: Record<AutomationJobType, number> = {
  confirmation_898: 1,
  sms_direct_transfer: 2,
  sms_bank_deposit: 2,
  balance_direct_transfer: 3,
  balance_bank_deposit: 3,
  balance_check: 4,
};

export const shouldSkipJobWhenBusy = (type: AutomationJobType, lockState: AutomationLockState) =>
  type === 'balance_check' && lockState !== 'IDLE';

export const isSmsAutomationJob = (type: AutomationJobType) => type === 'sms_direct_transfer' || type === 'sms_bank_deposit';

export const isUssdAutomationJob = (type: AutomationJobType) => type !== 'confirmation_898';
