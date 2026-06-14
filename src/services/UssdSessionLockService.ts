import {accessibilityNative} from '../native/SarifNative';
import {delay} from '../utils/retry';
import {loggingService} from './LoggingService';
import {timingLogService} from './TimingLogService';

export type UssdFlow = 'BALANCE_CHECK' | 'DIRECT_TRANSFER' | 'BANK_DEPOSIT';
export type UssdSessionState =
  | 'IDLE'
  | 'DIALING'
  | 'WAITING_SCREEN_VISIBLE'
  | 'NETWORK_SETTLING'
  | 'RESPONSE_RECEIVED'
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMEOUT';

export interface ActiveUssdSession {
  isActive: boolean;
  sessionId?: string;
  startedAt?: number;
  currentFlow?: UssdFlow;
  state: UssdSessionState;
  settlingStartedAt?: number;
}

const STALE_SESSION_MS = 3 * 60 * 1000;
const NETWORK_SETTLING_MS = 30_000;
const CLEAN_IDLE_MS = 10_000;
const CLEAN_IDLE_TIMEOUT_MS = 60_000;
const CLEAN_RELEASE_CONFIRM_TIMEOUT_MS = 2_000;
const BALANCE_CLEAN_RELEASE_CONFIRM_TIMEOUT_MS = 8_000;
const CLEAN_RELEASE_CONFIRM_STEP_MS = 250;
const WAIT_STEP_MS = 300;

export class UssdSessionLockService {
  private session: ActiveUssdSession = {isActive: false, state: 'IDLE'};
  private lastReleaseSafeForImmediateDial = false;
  private releaseCallback?: () => void;

  setReleaseCallback(callback: () => void) {
    this.releaseCallback = callback;
  }

  getActiveSession() {
    return {...this.session};
  }

  isActive() {
    this.clearStaleIfNeeded();
    return this.session.isActive;
  }

  async isUssdBusy() {
    if (this.isActive()) {
      return true;
    }
    try {
      return (await accessibilityNative.isAutomationActive()) || (await accessibilityNative.isUssdWindowVisible());
    } catch {
      return false;
    }
  }

  async acquire(flow: UssdFlow, options: {wait?: boolean; timeoutMs?: number} = {}) {
    const wait = options.wait ?? true;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const startedWaitingAt = Date.now();

    while (await this.isUssdBusy()) {
      await loggingService.log('system', 'USSD lock prevented duplicate session');
      await this.tryDismissStuckUssdWindow();
      if (!wait || Date.now() - startedWaitingAt >= timeoutMs) {
        return undefined;
      }
      await delay(WAIT_STEP_MS);
    }

    const clean = this.lastReleaseSafeForImmediateDial
      ? await this.confirmCleanForImmediateDial()
      : await this.waitForCleanDialerState();
    if (!clean) {
      await loggingService.log('system', 'USSD lock prevented duplicate session');
      return undefined;
    }

    const sessionId = `${flow}-${Date.now()}`;
    this.session = {
      isActive: true,
      sessionId,
      startedAt: Date.now(),
      currentFlow: flow,
      state: 'DIALING',
    };
    await loggingService.log('system', 'USSD session started');
    return sessionId;
  }

  markWaitingScreenVisible(sessionId?: string) {
    if (!this.canMutate(sessionId)) {
      return;
    }
    this.session = {...this.session, state: 'WAITING_SCREEN_VISIBLE'};
  }

  markResponseReceived(status: 'completed' | 'failed' | 'timeout' = 'completed', sessionId?: string) {
    if (!this.canMutate(sessionId)) {
      return;
    }
    const state: UssdSessionState = status === 'completed' ? 'SUCCESS' : status === 'failed' ? 'FAILED' : 'TIMEOUT';
    this.session = {...this.session, state};
  }

  async release(
    sessionId?: string,
    options: {
      waitForDelayedResponse?: () => Promise<boolean>;
      extendNativeWatcher?: () => Promise<void>;
    } = {},
  ) {
    if (!this.session.isActive) {
      return;
    }
    if (sessionId && this.session.sessionId !== sessionId) {
      return;
    }
    if (!this.hasTerminalState()) {
      await loggingService.log('system', 'Network settling used because session unsafe');
      timingLogService.log('system', `network_settling_entered_at=${Date.now()}`);
      timingLogService.log('system', 'network_settling_reason=non_terminal_session_state');
      await this.networkSettle(sessionId, options);
    }

    if (this.canReleaseImmediatelyAfterCleanResult()) {
      const dismissed = await this.confirmPopupDismissedAfterResult(sessionId);
      if (dismissed) {
        if (sessionId && this.session.sessionId !== sessionId) {
          return;
        }
        await loggingService.log('system', 'Clean session ended');
        await loggingService.log('system', 'Post-result 10s wait skipped');
        await this.releaseSession(true);
        return;
      }

      await loggingService.log('system', 'USSD window still visible after OK');
      await loggingService.log('system', 'Network settling used because session unsafe');
      timingLogService.log('system', `network_settling_entered_at=${Date.now()}`);
      timingLogService.log('system', 'network_settling_reason=terminal_popup_still_visible_after_ok');
      await this.networkSettle(sessionId, options);
    }

    const clean = await this.waitForCleanDialerState();
    if (sessionId && this.session.sessionId !== sessionId) {
      return;
    }
    await this.releaseSession(clean);
  }

  private async networkSettle(
    sessionId?: string,
    options: {
      waitForDelayedResponse?: () => Promise<boolean>;
      extendNativeWatcher?: () => Promise<void>;
    } = {},
  ) {
    this.session = {
      ...this.session,
      state: 'NETWORK_SETTLING',
      settlingStartedAt: Date.now(),
    };
    await loggingService.log('system', 'USSD waiting screen disappeared');
    await loggingService.log('system', 'Entering NETWORK_SETTLING');
    try {
      await options.extendNativeWatcher?.();
    } catch {
      // Settling still protects the network even if the native watcher cannot be extended.
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < NETWORK_SETTLING_MS) {
      if (sessionId && this.session.sessionId !== sessionId) {
        return;
      }
      try {
        if (await options.waitForDelayedResponse?.()) {
          this.session = {...this.session, state: 'RESPONSE_RECEIVED'};
          await loggingService.log('system', 'Delayed response received during settling');
          return;
        }
      } catch {
        // Continue settling until timeout; delayed response polling is best effort.
      }
      await delay(1000);
    }

    if (this.canMutate(sessionId)) {
      this.session = {...this.session, state: 'TIMEOUT'};
    }
    await loggingService.log('system', 'Settling timeout completed');
    await this.tryDismissStuckUssdWindow();
  }

  private async waitForCleanDialerState() {
    const startedAt = Date.now();
    let cleanSince: number | undefined;

    while (Date.now() - startedAt < CLEAN_IDLE_TIMEOUT_MS) {
      let visible = false;
      try {
        visible = await accessibilityNative.isUssdWindowVisible();
      } catch {
        visible = false;
      }

      if (!visible) {
        cleanSince = cleanSince ?? Date.now();
        if (Date.now() - cleanSince >= CLEAN_IDLE_MS) {
          return true;
        }
      } else {
        cleanSince = undefined;
        await this.tryDismissStuckUssdWindow();
      }

      await delay(1000);
    }

    await loggingService.log('system', 'Clean USSD idle state not confirmed');
    return false;
  }

  private async confirmCleanForImmediateDial() {
    try {
      const visible = await accessibilityNative.isUssdWindowVisible();
      if (!visible) {
        await loggingService.log('system', 'Pre-dial clean idle wait skipped');
        return true;
      }
      await loggingService.log('system', 'USSD window still visible after OK');
      await this.tryDismissStuckUssdWindow();
      return false;
    } catch {
      await loggingService.log('system', 'Network settling used because session unsafe');
      return false;
    }
  }

  private async confirmPopupDismissedAfterResult(sessionId?: string) {
    const startedAt = Date.now();
    const timeoutMs =
      this.session.currentFlow === 'BALANCE_CHECK'
        ? BALANCE_CLEAN_RELEASE_CONFIRM_TIMEOUT_MS
        : CLEAN_RELEASE_CONFIRM_TIMEOUT_MS;

    while (Date.now() - startedAt < timeoutMs) {
      if (sessionId && this.session.sessionId !== sessionId) {
        return false;
      }
      let visible = true;
      try {
        visible = await accessibilityNative.isUssdWindowVisible();
      } catch {
        return false;
      }

      if (!visible) {
        await loggingService.log('system', 'USSD popup dismissed');
        timingLogService.log('system', `ussd_popup_disappeared_at=${Date.now()}`);
        return true;
      }

      await this.tryDismissStuckUssdWindow();
      await delay(CLEAN_RELEASE_CONFIRM_STEP_MS);
    }

    return false;
  }

  private async tryDismissStuckUssdWindow() {
    try {
      if (await accessibilityNative.isUssdWindowVisible()) {
        const dismissed = await accessibilityNative.dismissVisibleUssdWindow();
        if (dismissed) {
          await loggingService.log('system', 'Stuck USSD dialog dismissed before next dial');
        }
      }
    } catch {
      // Visibility cleanup is best effort; the lock still protects the next dial.
    }
  }

  private hasTerminalState() {
    return ['RESPONSE_RECEIVED', 'SUCCESS', 'FAILED', 'TIMEOUT'].includes(this.session.state);
  }

  private canReleaseImmediatelyAfterCleanResult() {
    return ['RESPONSE_RECEIVED', 'SUCCESS', 'FAILED'].includes(this.session.state);
  }

  private async releaseSession(safeForImmediateDial: boolean) {
    this.session = {isActive: false, state: 'IDLE'};
    this.lastReleaseSafeForImmediateDial = safeForImmediateDial;
    if (safeForImmediateDial) {
      await loggingService.log('system', 'Session lock released immediately');
    }
    timingLogService.log('system', `session_lock_released_at=${Date.now()}`);
    await loggingService.log('system', 'USSD session released');
    this.releaseCallback?.();
  }

  private canMutate(sessionId?: string) {
    return this.session.isActive && (!sessionId || this.session.sessionId === sessionId);
  }

  private clearStaleIfNeeded() {
    if (!this.session.isActive || !this.session.startedAt) {
      return;
    }
    if (Date.now() - this.session.startedAt > STALE_SESSION_MS) {
      this.session = {isActive: false, state: 'IDLE'};
      this.lastReleaseSafeForImmediateDial = false;
      void loggingService.log('system', 'Stale USSD session lock cleared');
    }
  }
}

export const ussdSessionLockService = new UssdSessionLockService();
