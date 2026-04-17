import { describe, it, expect, beforeEach } from 'vitest';
import { gameSessionLog } from './gameSessionLog';
import type { SessionReport } from '../game/SessionConfig';

function fakeReport(id: string): SessionReport {
  return {
    sessionId: id,
    gameId: 'plane',
    gameMode: 'auto',
    themeId: 'day',
    startedAt: 0,
    endedAt: 1000,
    plannedDurationSec: 300,
    actualDurationSec: 300,
    runs: [],
    validRunsCount: 0,
    avgRL: 0,
    nfbSettingsSnapshot: {
      indicators: [],
      difficultyLevel: 3,
      persistenceLevel: 3,
      qualitySensitivity: 3,
    },
  };
}

describe('gameSessionLog', () => {
  beforeEach(async () => {
    await gameSessionLog.clearAll();
  });

  it('enqueues and lists a pending report', async () => {
    await gameSessionLog.enqueue(fakeReport('s1'));
    const list = await gameSessionLog.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.sessionId).toBe('s1');
  });

  it('dequeues by sessionId', async () => {
    await gameSessionLog.enqueue(fakeReport('s1'));
    await gameSessionLog.enqueue(fakeReport('s2'));
    await gameSessionLog.dequeue('s1');
    const list = await gameSessionLog.list();
    expect(list.map((r) => r.sessionId)).toEqual(['s2']);
  });

  it('is idempotent on repeated enqueue of the same id', async () => {
    await gameSessionLog.enqueue(fakeReport('s1'));
    await gameSessionLog.enqueue(fakeReport('s1'));
    const list = await gameSessionLog.list();
    expect(list).toHaveLength(1);
  });
});
