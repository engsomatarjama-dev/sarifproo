import {LogType} from '../types';
import {loggingService} from './LoggingService';

export const DEBUG_TIMING_LOGS = false;

class TimingLogService {
  log(type: LogType, message: string) {
    if (!DEBUG_TIMING_LOGS) {
      return;
    }
    void loggingService.log(type, message);
  }
}

export const timingLogService = new TimingLogService();
