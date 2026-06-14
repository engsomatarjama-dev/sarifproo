import {logRepository} from '../repositories/LogRepository';
import {useAppStore} from '../store/useAppStore';
import {LogEntry, LogType} from '../types';
import {redactLogMessage} from '../utils/redaction';

const LOG_REFRESH_THROTTLE_MS = 1500;

class LoggingService {
  private writeQueue: Promise<void> = Promise.resolve();
  private refreshTimer?: ReturnType<typeof setTimeout>;

  log(type: LogType, message: string) {
    const entry: LogEntry = {
      type,
      message: redactLogMessage(message),
      timestamp: Date.now(),
    };
    this.writeQueue = this.writeQueue
      .then(async () => {
        await logRepository.create(entry);
      })
      .catch(() => undefined);
    this.scheduleRefresh();
    return Promise.resolve();
  }

  private scheduleRefresh() {
    if (this.refreshTimer) {
      return;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refreshLogs();
    }, LOG_REFRESH_THROTTLE_MS);
  }

  private async refreshLogs() {
    try {
      await this.writeQueue;
      const latest = await logRepository.list();
      useAppStore.getState().setLogs(latest);
    } catch {
      // Logging must never block automation.
    }
  }
}

export const loggingService = new LoggingService();
