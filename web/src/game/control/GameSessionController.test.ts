import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameSessionController, type ControllerState } from './GameSessionController';
import type { GameChannelMessage } from '../../services/gameChannel';
import type { SessionConfig } from '../SessionConfig';

class FakeChannel {
  posted: GameChannelMessage[] = [];
  listeners = new Set<(m: GameChannelMessage) => void>();
  post(m: GameChannelMessage) { this.posted.push(m); }
  subscribe(l: (m: GameChannelMessage) => void) {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
  close() {}
  // test helper
  deliver(m: GameChannelMessage) { for (const l of this.listeners) l(m); }
}

function cfg(): SessionConfig {
  return {
    gameId: 'plane',
    modeId: 'auto',
    themeId: 'papercut',
    lang: 'zh',
    plannedDurationSec: 300,
  };
}

describe('GameSessionController', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1000;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in IDLE', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock });
    expect(c.state).toBe<ControllerState>('idle');
  });

  it('transitions to CONNECTING when a subject window is opened', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock });
    c.openSubjectWindow();
    expect(c.state).toBe<ControllerState>('connecting');
  });

  it('transitions CONNECTING -> PREVIEW after subjectReady', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock });
    c.openSubjectWindow();
    ch.deliver({ kind: 'subjectReady', protocolVersion: 1 });
    expect(c.state).toBe<ControllerState>('preview');
  });

  it('loadSession posts loadGame and transitions to preview when ready', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock });
    c.openSubjectWindow();
    ch.deliver({ kind: 'subjectReady', protocolVersion: 1 });
    c.configure(cfg());
    expect(ch.posted.some((m) => m.kind === 'loadGame')).toBe(true);
  });

  it('PREVIEW -> RUN ACTIVE on start, broadcasts runStart', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock });
    c.openSubjectWindow();
    ch.deliver({ kind: 'subjectReady', protocolVersion: 1 });
    c.configure(cfg());
    c.start();
    expect(c.state).toBe<ControllerState>('runActive');
    expect(ch.posted.some((m) => m.kind === 'runStart')).toBe(true);
  });

  it('receives runResult, goes to RUN REST, stores result', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock });
    c.openSubjectWindow();
    ch.deliver({ kind: 'subjectReady', protocolVersion: 1 });
    c.configure(cfg());
    c.start();
    ch.deliver({
      kind: 'runResult',
      runIndex: 0,
      result: {
        runIndex: 0, startedAt: 0, durationMs: 60000, ooSeries: [],
        qualityPercent: 80, isValid: true, gameSpecific: {},
      },
    });
    expect(c.state).toBe<ControllerState>('runRest');
    expect(c.runs).toHaveLength(1);
  });

  it('pause stops the OO pump and resume restores the prior state', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock });
    c.openSubjectWindow();
    ch.deliver({ kind: 'subjectReady', protocolVersion: 1 });
    c.configure(cfg());
    c.start();
    c.pause();
    expect(c.state).toBe<ControllerState>('paused');
    c.resume();
    expect(c.state).toBe<ControllerState>('runActive');
  });

  it('subject heartbeat loss during RUN ACTIVE transitions to SUBJECT LOST', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock, heartbeatTimeoutMs: 5000 });
    c.openSubjectWindow();
    ch.deliver({ kind: 'subjectReady', protocolVersion: 1 });
    c.configure(cfg());
    c.start();
    // Advance time past the heartbeat timeout
    now += 6000;
    vi.advanceTimersByTime(6000);
    expect(c.state).toBe<ControllerState>('subjectLost');
  });

  it('sessionEnd transition when planned duration elapses and a run naturally ends', () => {
    const ch = new FakeChannel();
    const c = new GameSessionController({ channel: ch, clock });
    c.openSubjectWindow();
    ch.deliver({ kind: 'subjectReady', protocolVersion: 1 });
    c.configure({ ...cfg(), plannedDurationSec: 300 });
    c.start();
    now += 310_000; // 5 min 10 s
    // Current run finishes naturally
    ch.deliver({
      kind: 'runResult',
      runIndex: 0,
      result: {
        runIndex: 0, startedAt: 0, durationMs: 90000, ooSeries: [],
        qualityPercent: 80, isValid: true, gameSpecific: {},
      },
    });
    expect(c.state).toBe<ControllerState>('sessionReport');
  });
});
