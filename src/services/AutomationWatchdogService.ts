import {periodicBalanceCheckerService} from '../automation/PeriodicBalanceCheckerService';
import {accessibilityNative} from '../native/SarifNative';
import {useAppStore} from '../store/useAppStore';
import {automationLockService} from './AutomationLockService';
import {automationQueueService} from './AutomationQueueService';
import {loggingService} from './LoggingService';
import {ussdSessionLockService} from './UssdSessionLockService';

export const WATCHDOG_INTERVAL_MS = 15_000;
export const BALANCE_CYCLE_STALE_MS = 150_000;
export const DIRECT_TRANSFER_STALE_MS = 120_000;
export const BANK_DEPOSIT_STALE_MS = 180_000;
export const USSD_SESSION_LOCK_STALE_MS = 180_000;
export const AUTOMATION_LOCK_STALE_MS = 120_000;
export const BACKGROUND_HEARTBEAT_STALE_MS = 30_000;
export const QUEUE_ITEM_STALE_MS = 180_000;
export const ACCESSIBILITY_EVENT_STALE_MS = 30_000;

type WorkerRestartHandler = () => Promise<void> | void;

export class AutomationWatchdogService {
  private timer?: ReturnType<typeof setInterval>;
  private lastWorkerHeartbeatAt?: number;
  private restartWorker?: WorkerRestartHandler;
  private lastWorkerRestartAt = 0;
  private lastLogAt = new Map<string, number>();

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.check();
    }, WATCHDOG_INTERVAL_MS);
    void loggingService.log('system', 'Watchdog started');
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }

  setWorkerRestartHandler(handler: WorkerRestartHandler) {
    this.restartWorker = handler;
  }

  recordWorkerHeartbeat() {
    this.lastWorkerHeartbeatAt = Date.now();
  }

  getSnapshot() {
    return {
      running: Boolean(this.timer),
      lastWorkerHeartbeatAt: this.lastWorkerHeartbeatAt,
      workerHeartbeatAgeMs: this.lastWorkerHeartbeatAt ? Date.now() - this.lastWorkerHeartbeatAt : undefined,
    };
  }

  async check() {
    const settings = useAppStore.getState().settings;
    const automationExpected =
      settings.automationEnabled &&
      (settings.periodicBalanceCheckerEnabled || settings.monitoring898Enabled);

    if (!automationExpected) {
      return;
    }

    await this.checkBalanceCycle();
    await this.checkAutomationLock();
    await this.checkUssdSession();
    await this.checkQueue();
    await this.checkWorkerHeartbeat();
    await this.checkAccessibility();
  }

  private async checkBalanceCycle() {
    const snapshot = periodicBalanceCheckerService.getSnapshot();
    if (!snapshot.running || !snapshot.currentCycleStartedAt) {
      return;
    }
    if (Date.now() - snapshot.currentCycleStartedAt <= BALANCE_CYCLE_STALE_MS) {
      return;
    }
    await this.logOnce('stale-balance-cycle', 'Stale balance cycle detected');
    periodicBalanceCheckerService.resetStaleCycle('watchdog_balance_cycle_stale');
  }

  private async checkAutomationLock() {
    const snapshot = automationLockService.getSnapshot();
    if (!snapshot.locked || !snapshot.startedAt) {
      return;
    }

    const threshold = this.thresholdForAutomationLock(snapshot.activeJobType);
    if (snapshot.ageMs <= threshold) {
      return;
    }

    await automationLockService.releaseIfStale('watchdog_automation_lock_stale', threshold);
  }

  private thresholdForAutomationLock(activeJobType?: string) {
    if (activeJobType?.includes('bank_deposit')) {
      return BANK_DEPOSIT_STALE_MS;
    }
    if (activeJobType?.includes('direct_transfer')) {
      return DIRECT_TRANSFER_STALE_MS;
    }
    return AUTOMATION_LOCK_STALE_MS;
  }

  private async checkUssdSession() {
    const snapshot = ussdSessionLockService.getSnapshot();
    if (!snapshot.active || !snapshot.startedAt || snapshot.ageMs <= USSD_SESSION_LOCK_STALE_MS) {
      return;
    }
    await ussdSessionLockService.releaseIfStaleAndNoWindowVisible(
      'watchdog_ussd_session_stale',
      USSD_SESSION_LOCK_STALE_MS,
    );
  }

  private async checkQueue() {
    const snapshot = automationQueueService.getSnapshot();
    if (snapshot.queueLength === 0 || snapshot.oldestQueuedItemAgeMs <= QUEUE_ITEM_STALE_MS) {
      return;
    }
    await this.logOnce('stale-queue', 'Queue stale detected');
    automationQueueService.triggerRecoveryChecks();
  }

  private async checkWorkerHeartbeat() {
    if (!this.lastWorkerHeartbeatAt || Date.now() - this.lastWorkerHeartbeatAt <= BACKGROUND_HEARTBEAT_STALE_MS) {
      return;
    }
    await this.logOnce('stale-worker-heartbeat', 'Worker heartbeat stale');
    if (!this.restartWorker || Date.now() - this.lastWorkerRestartAt < BACKGROUND_HEARTBEAT_STALE_MS) {
      return;
    }
    this.lastWorkerRestartAt = Date.now();
    await Promise.resolve(this.restartWorker());
    await loggingService.log('system', 'Worker restarted');
  }

  private async checkAccessibility() {
    let health: Awaited<ReturnType<typeof accessibilityNative.getAutomationHealth>>;
    try {
      health = await accessibilityNative.getAutomationHealth();
    } catch {
      return;
    }
    if (!health.active) {
      return;
    }

    const lastProgressAt = Math.max(health.lastAccessibilityEventAt || 0, health.lastScreenProcessedAt || 0);
    if (!lastProgressAt || Date.now() - lastProgressAt > ACCESSIBILITY_EVENT_STALE_MS) {
      await this.logOnce('stale-accessibility', 'Accessibility stale detected');
      automationQueueService.triggerRecoveryChecks();
    }
  }

  private async logOnce(key: string, message: string, windowMs = 60_000) {
    const last = this.lastLogAt.get(key) ?? 0;
    if (Date.now() - last < windowMs) {
      return;
    }
    this.lastLogAt.set(key, Date.now());
    await loggingService.log('system', message);
  }
}

export const automationWatchdogService = new AutomationWatchdogService();
