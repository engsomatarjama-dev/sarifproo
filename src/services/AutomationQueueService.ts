import {AutomationJobDescriptor, automationLockService} from './AutomationLockService';
import {loggingService} from './LoggingService';
import {isSmsAutomationJob, isUssdAutomationJob, shouldSkipJobWhenBusy} from './AutomationQueuePolicy';
import {duplicateTransferGuardService} from './DuplicateTransferGuardService';
import {ussdSessionLockService} from './UssdSessionLockService';

type AutomationJob = AutomationJobDescriptor & {
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  run: () => Promise<void>;
  onDuplicate?: (reason: 'duplicate_key' | 'duplicate_transfer') => Promise<void> | void;
};

class AutomationQueueService {
  private queue: AutomationJob[] = [];
  private queuedKeys = new Set<string>();
  private waitingForSafeUssdRelease = false;

  constructor() {
    automationLockService.setIdleCallback(() => {
      void this.processNext();
    });
  }

  hasQueuedOrActive(dedupeKey: string) {
    return this.queuedKeys.has(dedupeKey) || automationLockService.getActiveJob()?.dedupeKey === dedupeKey;
  }

  async enqueue(job: Omit<AutomationJob, 'status' | 'createdAt'>) {
    if (this.hasQueuedOrActive(job.dedupeKey)) {
      await loggingService.log('system', 'Duplicate queued job ignored');
      await job.onDuplicate?.('duplicate_key');
      return {status: 'duplicate' as const};
    }

    if (shouldSkipJobWhenBusy(job.type, automationLockService.getState())) {
      await loggingService.log('system', 'Balance check skipped because automation is busy');
      return {status: 'skipped' as const};
    }

    const queuedJob: AutomationJob = {
      ...job,
      status: 'queued',
      createdAt: Date.now(),
    };

    const ussdBusy = await ussdSessionLockService.isUssdBusy();
    if (isUssdAutomationJob(queuedJob.type) && ussdBusy) {
      this.queue.push(queuedJob);
      this.queuedKeys.add(queuedJob.dedupeKey);
      this.sortQueue();
      this.waitingForSafeUssdRelease = true;
      await loggingService.log(
        'system',
        isSmsAutomationJob(queuedJob.type) ? 'SMS queued due to active session' : 'USSD job queued due to active session',
      );
      await loggingService.log('system', isSmsAutomationJob(queuedJob.type) ? 'SMS automation queued' : 'Automation queued');
      return {status: 'queued' as const};
    }

    if (automationLockService.isIdle() && this.queue.length === 0) {
      void this.startJob(queuedJob);
      return {status: 'started' as const};
    }

    this.queue.push(queuedJob);
    this.queuedKeys.add(queuedJob.dedupeKey);
    this.sortQueue();
    if (isUssdAutomationJob(queuedJob.type) && ussdBusy) {
      this.waitingForSafeUssdRelease = true;
      await loggingService.log(
        'system',
        isSmsAutomationJob(queuedJob.type) ? 'SMS queued due to active session' : 'USSD job queued due to active session',
      );
    }
    await loggingService.log('system', isSmsAutomationJob(queuedJob.type) ? 'SMS automation queued' : 'Automation queued');
    return {status: 'queued' as const};
  }

  async processNext() {
    if (!automationLockService.isIdle() || this.queue.length === 0) {
      return;
    }
    const next = this.queue[0];
    if (!next) {
      return;
    }
    if (isUssdAutomationJob(next.type) && (await ussdSessionLockService.isUssdBusy())) {
      this.waitingForSafeUssdRelease = true;
      await loggingService.log('system', 'USSD lock prevented duplicate session');
      setTimeout(() => {
        void this.processNext();
      }, 1000);
      return;
    }
    this.queue.shift();
    this.queuedKeys.delete(next.dedupeKey);
    if (this.waitingForSafeUssdRelease && isUssdAutomationJob(next.type)) {
      this.waitingForSafeUssdRelease = false;
      await loggingService.log('system', 'Next queued job started after safe release');
    }
    await this.startJob(next);
  }

  private async startJob(job: AutomationJob) {
    if (await duplicateTransferGuardService.shouldSkipJob(job)) {
      job.status = 'completed';
      job.completedAt = Date.now();
      await job.onDuplicate?.('duplicate_transfer');
      return;
    }

    const acquired = await automationLockService.acquire(job);
    if (!acquired) {
      this.queue.push(job);
      this.queuedKeys.add(job.dedupeKey);
      this.sortQueue();
      return;
    }

    job.status = 'running';
    job.startedAt = Date.now();
    await loggingService.log('system', 'Queued job started');

    try {
      await job.run();
      job.status = 'completed';
      job.completedAt = Date.now();
    } catch (error) {
      job.status = 'failed';
      job.completedAt = Date.now();
      await loggingService.log('transaction_failed', `Automation job failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!automationLockService.isExternalRelease(job.id)) {
        await automationLockService.release(job.id);
      }
    }
  }

  private sortQueue() {
    this.queue.sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.createdAt - right.createdAt;
    });
  }
}

export const automationQueueService = new AutomationQueueService();
