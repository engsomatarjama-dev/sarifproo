import {logRepository} from '../repositories/LogRepository';
import {useAppStore} from '../store/useAppStore';
import {LogEntry, LogType} from '../types';
import {redactLogMessage} from '../utils/redaction';

class LoggingService {
  async log(type: LogType, message: string) {
    const entry: LogEntry = {
      type,
      message: redactLogMessage(message),
      timestamp: Date.now(),
    };
    await logRepository.create(entry);
    const latest = await logRepository.list();
    useAppStore.getState().setLogs(latest);
  }
}

export const loggingService = new LoggingService();
