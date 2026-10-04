import {logRepository} from '../repositories/LogRepository';
import {useAppStore} from '../store/useAppStore';
import {LogEntry, LogType} from '../types';
import {redactLogMessage} from '../utils/redaction';

class LoggingService {
  private writeQueue: Promise<void> = Promise.resolve();

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
    // Deliberately no automatic store refresh here. The only consumer of the
    // in-memory log list is the Logs screen, which refreshes itself while
    // focused. Re-querying after every write ran on a single serial SQLite
    // worker thread and, together with an unindexed ORDER BY, kept it
    // saturated for most of every balance-check cycle (see
    // SARIFPRO_POST_TRANSFER_RESUME_AUDIT.md).
    return Promise.resolve();
  }

  async refreshLogs() {
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
