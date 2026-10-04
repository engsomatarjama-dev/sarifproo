import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {logRepository} from '../LogRepository';
import {balanceCheckRepository} from '../BalanceCheckRepository';
import {databaseService} from '../../database';

jest.mock('../../database', () => ({
  databaseService: {
    executeSql: jest.fn(),
  },
}));

const mockedExecute = databaseService.executeSql as jest.MockedFunction<typeof databaseService.executeSql>;

const rowsOf = (rows: unknown[], extra: Record<string, unknown> = {}) =>
  ({rows: {raw: () => rows}, ...extra}) as never;

describe('LogRepository (post-transfer resume audit fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists the newest logs by rowid, never by the un-indexed timestamp column', async () => {
    mockedExecute.mockResolvedValue(rowsOf([{id: 9, type: 'system', message: 'm', timestamp: 5}]));

    const logs = await logRepository.list();

    const sql = String(mockedExecute.mock.calls[0]?.[0]);
    expect(sql).toMatch(/ORDER BY id DESC LIMIT \?/);
    expect(sql).not.toMatch(/timestamp DESC/);
    expect(mockedExecute.mock.calls[0]?.[1]).toEqual([200]);
    expect(logs).toEqual([{id: 9, type: 'system', message: 'm', timestamp: 5}]);
  });

  it('reports id bounds, or undefined for an empty table', async () => {
    mockedExecute.mockResolvedValueOnce(rowsOf([{min_id: 3, max_id: 70}]));
    await expect(logRepository.getIdBounds()).resolves.toEqual({minId: 3, maxId: 70});

    mockedExecute.mockResolvedValueOnce(rowsOf([{min_id: null, max_id: null}]));
    await expect(logRepository.getIdBounds()).resolves.toBeUndefined();
  });

  it('deletes only the requested half-open id range and returns the affected count', async () => {
    mockedExecute.mockResolvedValue(rowsOf([], {rowsAffected: 2000}));

    const affected = await logRepository.deleteIdRange(10, 2010);

    expect(String(mockedExecute.mock.calls[0]?.[0])).toMatch(/DELETE FROM logs WHERE id >= \? AND id < \?/);
    expect(mockedExecute.mock.calls[0]?.[1]).toEqual([10, 2010]);
    expect(affected).toBe(2000);
  });
});

describe('BalanceCheckRepository ordering (post-transfer resume audit fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedExecute.mockResolvedValue(rowsOf([]));
  });

  it('reads the latest check and latest transfer by rowid, not by timestamp', async () => {
    await balanceCheckRepository.getLast();
    await balanceCheckRepository.getLastTransfer();

    const [lastSql, transferSql] = mockedExecute.mock.calls.map(call => String(call[0]));
    expect(lastSql).toMatch(/ORDER BY id DESC LIMIT 1/);
    expect(transferSql).toMatch(/status = 'triggered_transfer' ORDER BY id DESC LIMIT 1/);
    expect(lastSql + transferSql).not.toMatch(/timestamp DESC/);
  });
});
