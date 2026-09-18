import {accessibilityNative} from '../native/SarifNative';
import {loggingService} from './LoggingService';
import {transactionRepository} from '../repositories/TransactionRepository';
import {AUTOMATION_LOCK_TIMEOUT_MS} from './DuplicateTransferPolicy';
import {ussdSessionLockService} from './UssdSessionLockService';

export type AutomationLockState = 'IDLE' | 'BUSY' | 'RECOVERING';

export type AutomationJobType =
  | 'sms_direct_transfer'
  | 'sms_bank_deposit'
  | 'balance_check'
  | 'balance_direct_transfer'
  | 'balance_bank_deposit'
  | 'confirmation_898';

export interface AutomationJobDescriptor {
  id: string;
  type: AutomationJobType;
  priority: number;
  source: string;
  amount?: number;
  reference?: string;
  dedupeKey: string;
  transferMethod?: string;
  destinationAccount?: string;
}

export class AutomationLockService {
  private state: AutomationLockState = 'IDLE';
  private activeJob?: AutomationJobDescriptor & {startedAt: number; externalRelease: boolean};
  private timeout?: ReturnType<typeof setTimeout>;
  private onIdle?: () => void;

  getState() {
    return this.state;
  }

  getActiveJob() {
    return this.activeJob;
  }

  getSnapshot() {
    return {
      locked: this.state !== 'IDLE',
      activeJobId: this.activeJob?.id,
      activeJobType: this.activeJob?.type,
      startedAt: this.activeJob?.startedAt,
      ageMs: this.activeJob ? Date.now() - this.activeJob.startedAt : 0,
      state: this.state,
    };
  }

  isIdle() {
    return this.state === 'IDLE';
  }

  setIdleCallback(callback: () => void) {
    this.onIdle = callback;
  }

  async acquire(job: AutomationJobDescriptor) {
    if (this.state !== 'IDLE') {
      if (this.isStale()) {
        await loggingService.log('system', 'Stale lock detected');
        const recovered = await this.recover('stale_lock_cleared');
        if (recovered) {
          await loggingService.log('system', 'Stale lock cleared');
        }
      }
    }

    if (this.state !== 'IDLE') {
      await loggingService.log('system', 'Automation lock busy');
      return false;
    }

    this.state = 'BUSY';
    this.activeJob = {...job, startedAt: Date.now(), externalRelease: false};
    await loggingService.log('system', 'Automation lock acquired');
    this.armTimeout(job.id);
    return true;
  }

  markExternalRelease(jobReference?: string) {
    if (!this.activeJob) {
      return;
    }
    if (!jobReference || this.activeJob.reference === jobReference || this.activeJob.id === jobReference) {
      this.activeJob.externalRelease = true;
    }
  }

  isExternalRelease(jobId: string) {
    return this.activeJob?.id === jobId && this.activeJob.externalRelease;
  }

  async release(jobId?: string) {
    if (!this.activeJob) {
      return;
    }
    if (jobId && this.activeJob.id !== jobId && this.activeJob.reference !== jobId) {
      return;
    }
    this.clearTimeout();
    this.activeJob = undefined;
    this.state = 'IDLE';
    await loggingService.log('system', 'Automation lock released');
    this.onIdle?.();
  }

  /**
   * Returns true only once the automation lock has actually been released
   * (native state reset and the job cleared). Returns false when recovery
   * was deferred because the USSD session this job owns is still active or
   * a USSD/phone window is still on screen -- a bare age threshold is not
   * proof that the underlying USSD interaction has ended.
   */
  async recover(reason = 'automation_timeout') {
    if (!this.activeJob) {
      this.state = 'IDLE';
      return false;
    }

    if (await this.hasUnresolvedUssdInteraction()) {
      this.state = 'RECOVERING';
      await loggingService.log(
        'system',
        'Automation lock stale recovery deferred: USSD session still active or window visible',
      );
      return false;
    }

    this.state = 'RECOVERING';
    await loggingService.log('transaction_failed', `Automation timeout recovery started: ${reason}`);
    if (this.activeJob.reference && this.activeJob.type !== 'balance_check') {
      await transactionRepository.updateResult(this.activeJob.reference, {
        status: 'failed',
        transactionType: this.activeJob.type.includes('bank_deposit') ? 'bank_deposit' : 'direct_transfer',
        resultMessage: 'automation_timeout_recovery',
        failureReason: 'automation_timeout_recovery',
        completedAt: Date.now(),
      });
    }
    try {
      await accessibilityNative.resetAutomation();
    } catch {
      // Native reset is best effort; lock release must still continue.
    }
    this.clearTimeout();
    this.activeJob = undefined;
    this.state = 'IDLE';
    await loggingService.log('system', 'Automation state reset');
    await loggingService.log('system', 'Automation lock released');
    this.onIdle?.();
    return true;
  }

  async releaseIfStale(reason: string, thresholdMs: number) {
    if (!this.activeJob || Date.now() - this.activeJob.startedAt <= thresholdMs) {
      return false;
    }
    await loggingService.log('system', 'Stale automation lock detected');
    const recovered = await this.recover(reason);
    if (recovered) {
      await loggingService.log('system', 'Automation lock released');
    }
    return recovered;
  }

  /**
   * A bare automation-lock age threshold is stale bookkeeping evidence only.
   * Before destroying native USSD ownership (resetAutomation) we must also
   * prove the USSD session this job started has actually ended: the JS
   * session lock is idle AND no USSD/phone window is currently visible.
   * Reuses UssdSessionLockService's own state and the same native
   * window-visibility signal it already relies on for its own stale
   * recovery, rather than introducing a second source of truth.
   */
  private async hasUnresolvedUssdInteraction() {
    if (ussdSessionLockService.isActive()) {
      return true;
    }
    try {
      return await accessibilityNative.isUssdWindowVisible();
    } catch {
      // If visibility cannot be determined, do not assume it is safe to reset.
      return true;
    }
  }

  private armTimeout(jobId: string) {
    this.clearTimeout();
    this.timeout = setTimeout(() => {
      if (this.activeJob?.id === jobId) {
        void this.recover('max_duration_exceeded');
      }
    }, AUTOMATION_LOCK_TIMEOUT_MS);
  }

  private isStale() {
    return Boolean(this.activeJob && Date.now() - this.activeJob.startedAt > AUTOMATION_LOCK_TIMEOUT_MS);
  }

  private clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }
}

export const automationLockService = new AutomationLockService();
