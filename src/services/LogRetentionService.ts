import {logRepository} from '../repositories/LogRepository';
import {delay} from '../utils/retry';
import {loggingService} from './LoggingService';

// Most recent diagnostic rows to keep (~10+ hours at current verbosity).
export const LOG_RETENTION_KEEP_ROWS = 50_000;
// Small rowid-range deletes with a pause between them: the SQLite plugin runs
// every query for the database on one serial thread, so a single huge DELETE
// would block balance-check / transaction writes queued behind it. Short
// batches let those interleave.
export const LOG_PRUNE_BATCH_ROWS = 2_000;
export const LOG_PRUNE_PAUSE_MS = 250;
const FIRST_RUN_DELAY_MS = 30_000;
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class LogRetentionService {
  private running = false;
  private startTimer?: ReturnType<typeof setTimeout>;
  private intervalTimer?: ReturnType<typeof setInterval>;

  /**
   * Deletes the oldest log rows, always keeping the newest `keepRows` ids.
   * Touches only the `logs` table; never transactions or balance history.
   * Single-flight and never throws.
   */
  async prune(keepRows = LOG_RETENTION_KEEP_ROWS) {
    if (this.running) {
      return 0;
    }
    this.running = true;
    let deleted = 0;
    try {
      const bounds = await logRepository.getIdBounds();
      if (!bounds) {
        return 0;
      }
      // ids <= cutoff are eligible; the newest `keepRows` ids are never touched.
      const cutoff = bounds.maxId - keepRows;
      let from = bounds.minId;
      while (from <= cutoff) {
        const to = Math.min(from + LOG_PRUNE_BATCH_ROWS, cutoff + 1);
        deleted += await logRepository.deleteIdRange(from, to);
        from = to;
        if (from <= cutoff) {
          await delay(LOG_PRUNE_PAUSE_MS);
        }
      }
      if (deleted > 0) {
        void loggingService.log('system', `LOG_RETENTION_PRUNED rows=${deleted}`);
      }
    } catch {
      // Housekeeping must never affect automation; the next run retries.
    } finally {
      this.running = false;
    }
    return deleted;
  }

  start() {
    if (this.startTimer || this.intervalTimer) {
      return;
    }
    this.startTimer = setTimeout(() => {
      this.startTimer = undefined;
      void this.prune();
      this.intervalTimer = setInterval(() => {
        void this.prune();
      }, RUN_INTERVAL_MS);
    }, FIRST_RUN_DELAY_MS);
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = undefined;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
  }
}

export const logRetentionService = new LogRetentionService();
