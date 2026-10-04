import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {loggingService} from '../LoggingService';
import {logRepository} from '../../repositories/LogRepository';
import {useAppStore} from '../../store/useAppStore';

jest.mock('../../repositories/LogRepository', () => ({
  logRepository: {
    create: jest.fn(),
    list: jest.fn(),
  },
}));

const setLogs = jest.fn();
jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

const mockedRepo = logRepository as jest.Mocked<typeof logRepository>;
const mockedStore = useAppStore as jest.Mocked<typeof useAppStore>;

describe('LoggingService (post-transfer resume audit fix)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockedRepo.create.mockResolvedValue(undefined as never);
    mockedRepo.list.mockResolvedValue([{type: 'system', message: 'x', timestamp: 1}] as never);
    mockedStore.getState.mockReturnValue({setLogs} as unknown as ReturnType<typeof useAppStore.getState>);
  });

  it('persists a log entry but does NOT re-query the log list after the write', async () => {
    await loggingService.log('system', 'again');
    // Advance well past the old 1.5 s throttle: nothing must trigger a list().
    await jest.advanceTimersByTimeAsync(10_000);

    expect(mockedRepo.create).toHaveBeenCalledTimes(1);
    expect(mockedRepo.list).not.toHaveBeenCalled();
    expect(setLogs).not.toHaveBeenCalled();
  });

  it('captures the timestamp at call time, not when the delayed insert runs', async () => {
    jest.setSystemTime(1_000);
    await loggingService.log('system', 'stamp me');
    jest.setSystemTime(99_000);
    await jest.advanceTimersByTimeAsync(0);

    const written = mockedRepo.create.mock.calls.at(-1)?.[0] as {timestamp: number};
    expect(written.timestamp).toBe(1_000);
  });

  it('refreshLogs waits for pending writes, then loads and publishes the list on demand', async () => {
    await loggingService.log('system', 'pending write');

    await loggingService.refreshLogs();

    expect(mockedRepo.list).toHaveBeenCalledTimes(1);
    expect(setLogs).toHaveBeenCalledWith([{type: 'system', message: 'x', timestamp: 1}]);
  });

  it('refreshLogs never throws when the database fails', async () => {
    mockedRepo.list.mockRejectedValueOnce(new Error('db down'));

    await expect(loggingService.refreshLogs()).resolves.toBeUndefined();
  });
});
