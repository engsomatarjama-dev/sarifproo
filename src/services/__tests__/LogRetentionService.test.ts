import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {LogRetentionService, LOG_PRUNE_BATCH_ROWS} from '../LogRetentionService';
import {logRepository} from '../../repositories/LogRepository';
import {loggingService} from '../LoggingService';

jest.mock('../../repositories/LogRepository', () => ({
  logRepository: {
    getIdBounds: jest.fn(),
    deleteIdRange: jest.fn(),
  },
}));

jest.mock('../LoggingService', () => ({
  loggingService: {
    log: jest.fn(),
  },
}));

// Pauses between batches are real timers in production; resolve instantly here.
jest.mock('../../utils/retry', () => ({
  delay: jest.fn(() => Promise.resolve()),
}));

const mockedRepo = logRepository as jest.Mocked<typeof logRepository>;
const mockedLogging = loggingService as jest.Mocked<typeof loggingService>;

describe('LogRetentionService.prune', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLogging.log.mockResolvedValue(undefined);
    mockedRepo.deleteIdRange.mockImplementation(async (from, to) => to - from);
  });

  it('does nothing for an empty table', async () => {
    mockedRepo.getIdBounds.mockResolvedValue(undefined);

    await expect(new LogRetentionService().prune(100)).resolves.toBe(0);
    expect(mockedRepo.deleteIdRange).not.toHaveBeenCalled();
  });

  it('does nothing when the table is within the retention window', async () => {
    mockedRepo.getIdBounds.mockResolvedValue({minId: 1, maxId: 100});

    await expect(new LogRetentionService().prune(100)).resolves.toBe(0);
    expect(mockedRepo.deleteIdRange).not.toHaveBeenCalled();
  });

  it('deletes the oldest ids in bounded batches and never touches the newest keepRows ids', async () => {
    const keep = 1_000;
    const maxId = 10_000;
    mockedRepo.getIdBounds.mockResolvedValue({minId: 1, maxId});

    const deleted = await new LogRetentionService().prune(keep);

    const cutoff = maxId - keep; // ids <= 9000 are eligible
    const ranges = mockedRepo.deleteIdRange.mock.calls.map(([from, to]) => [from, to]);
    expect(ranges[0]?.[0]).toBe(1);
    for (const [from, to] of ranges) {
      expect((to as number) - (from as number)).toBeLessThanOrEqual(LOG_PRUNE_BATCH_ROWS);
      // exclusive upper bound must never exceed cutoff + 1 (i.e. id > cutoff is safe)
      expect(to as number).toBeLessThanOrEqual(cutoff + 1);
    }
    // contiguous, gap-free coverage of [minId, cutoff]
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i]?.[0]).toBe(ranges[i - 1]?.[1]);
    }
    expect(ranges[ranges.length - 1]?.[1]).toBe(cutoff + 1);
    expect(deleted).toBe(cutoff);
    expect(mockedLogging.log).toHaveBeenCalledWith('system', `LOG_RETENTION_PRUNED rows=${cutoff}`);
  });

  it('is single-flight: an overlapping call does not start a second prune', async () => {
    mockedRepo.getIdBounds.mockResolvedValue({minId: 1, maxId: 10_000});
    const service = new LogRetentionService();

    const first = service.prune(1_000);
    const second = await service.prune(1_000);
    await first;

    expect(second).toBe(0);
    expect(mockedRepo.getIdBounds).toHaveBeenCalledTimes(1);
  });

  it('swallows database errors so housekeeping can never affect automation, then allows a retry', async () => {
    mockedRepo.getIdBounds.mockRejectedValueOnce(new Error('database is locked'));
    const service = new LogRetentionService();

    await expect(service.prune(100)).resolves.toBe(0);

    mockedRepo.getIdBounds.mockResolvedValue({minId: 1, maxId: 500});
    await expect(service.prune(100)).resolves.toBe(400);
  });
});
