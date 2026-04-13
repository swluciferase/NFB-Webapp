import type { GameChannel, GameChannelMessage } from '../../services/gameChannel';
import type { RunResult } from '../Game';
import type { SessionConfig, SessionReport } from '../SessionConfig';
import { nfbSettingsStore } from '../../services/nfbSettingsStore';

export type ControllerState =
  | 'idle'
  | 'connecting'
  | 'preview'
  | 'runActive'
  | 'runRest'
  | 'paused'
  | 'subjectLost'
  | 'sessionReport';

export interface GameSessionControllerOptions {
  channel: GameChannel;
  clock?: () => number;
  heartbeatTimeoutMs?: number;
}

type Listener = () => void;

const DEFAULT_HEARTBEAT_TIMEOUT = 5000;
const RUN_DURATION_SEC = 90;

function uid(): string {
  return `gs_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class GameSessionController {
  state: ControllerState = 'idle';
  runs: RunResult[] = [];
  config: SessionConfig | null = null;

  private channel: GameChannel;
  private clock: () => number;
  private heartbeatTimeoutMs: number;
  private lastSubjectHeartbeat = 0;
  private heartbeatWatch: number | null = null;
  private previousState: ControllerState = 'idle';
  private sessionStartedAt = 0;
  private sessionPausedMs = 0;
  private pausedAt = 0;
  private runStartedAt = 0;
  private runIndex = 0;
  private listeners = new Set<Listener>();
  private sessionId: string = uid();

  constructor(opts: GameSessionControllerOptions) {
    this.channel = opts.channel;
    this.clock = opts.clock ?? (() => Date.now());
    this.heartbeatTimeoutMs = opts.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT;
    this.channel.subscribe((m) => this.onMessage(m));
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  private transition(next: ControllerState) {
    if (next !== this.state) {
      this.previousState = this.state;
      this.state = next;
      this.notify();
    }
  }

  openSubjectWindow(): void {
    this.transition('connecting');
    this.lastSubjectHeartbeat = this.clock();
    this.startHeartbeatWatch();
  }

  configure(cfg: SessionConfig): void {
    this.config = cfg;
    this.sessionId = uid();
    this.channel.post({
      kind: 'loadGame',
      gameId: cfg.gameId,
      modeId: cfg.modeId,
      themeId: cfg.themeId,
      lang: cfg.lang,
    });
  }

  start(): void {
    if (!this.config) throw new Error('start(): no config');
    if (this.state !== 'preview' && this.state !== 'runRest') {
      throw new Error(`start(): invalid state ${this.state}`);
    }
    if (this.state === 'preview') {
      this.sessionStartedAt = this.clock();
      this.sessionPausedMs = 0;
      this.runIndex = 0;
      this.runs = [];
    } else {
      this.runIndex += 1;
    }
    this.runStartedAt = this.clock();
    this.channel.post({
      kind: 'runStart',
      runIndex: this.runIndex,
      runDurationSec: RUN_DURATION_SEC,
      startedAt: this.runStartedAt,
    });
    this.transition('runActive');
  }

  pause(): void {
    if (this.state !== 'runActive' && this.state !== 'runRest') return;
    this.previousState = this.state;
    this.pausedAt = this.clock();
    this.channel.post({ kind: 'pause' });
    this.transition('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.sessionPausedMs += this.clock() - this.pausedAt;
    this.channel.post({ kind: 'resume' });
    this.transition(this.previousState);
  }

  abort(): void {
    this.channel.post({ kind: 'sessionEnd' });
    this.transition('sessionReport');
  }

  buildReport(): SessionReport {
    const endedAt = this.clock();
    const actual = Math.floor((endedAt - this.sessionStartedAt - this.sessionPausedMs) / 1000);
    const validRuns = this.runs.filter((r) => r.isValid);
    const avgOO = validRuns.length === 0
      ? 0
      : validRuns.reduce((sum, r) => {
          const mean = r.ooSeries.length === 0
            ? 0
            : r.ooSeries.reduce((a, b) => a + b, 0) / r.ooSeries.length;
          return sum + mean;
        }, 0) / validRuns.length;
    return {
      sessionId: this.sessionId,
      gameId: this.config!.gameId,
      gameMode: this.config!.modeId,
      themeId: this.config!.themeId,
      startedAt: this.sessionStartedAt,
      endedAt,
      plannedDurationSec: this.config!.plannedDurationSec,
      actualDurationSec: actual,
      runs: this.runs,
      validRunsCount: validRuns.length,
      avgOO,
      nfbSettingsSnapshot: nfbSettingsStore.read(),
    };
  }

  private onMessage(m: GameChannelMessage) {
    if (m.kind === 'subjectReady') {
      if (this.config) {
        this.channel.post({
          kind: 'loadGame',
          gameId: this.config.gameId,
          modeId: this.config.modeId,
          themeId: this.config.themeId,
          lang: this.config.lang,
        });
      }
      if (this.state === 'connecting') this.transition('preview');
      this.lastSubjectHeartbeat = this.clock();
      return;
    }
    if (m.kind === 'heartbeatSubject') {
      this.lastSubjectHeartbeat = this.clock();
      if (this.state === 'subjectLost') this.transition(this.previousState);
      return;
    }
    if (m.kind === 'runResult') {
      this.runs.push(m.result);
      const elapsed = Math.floor((this.clock() - this.sessionStartedAt - this.sessionPausedMs) / 1000);
      if (this.config && elapsed >= this.config.plannedDurationSec) {
        this.channel.post({ kind: 'sessionEnd' });
        this.transition('sessionReport');
      } else {
        this.transition('runRest');
      }
      return;
    }
    if (m.kind === 'subjectClosing') {
      this.transition('subjectLost');
      return;
    }
  }

  private startHeartbeatWatch() {
    if (this.heartbeatWatch != null) return;
    this.heartbeatWatch = window.setInterval(() => {
      if (this.state === 'idle' || this.state === 'sessionReport') return;
      if (this.clock() - this.lastSubjectHeartbeat > this.heartbeatTimeoutMs) {
        if (this.state !== 'subjectLost') {
          this.previousState = this.state;
          this.transition('subjectLost');
        }
      }
    }, 1000);
  }

  dispose(): void {
    if (this.heartbeatWatch != null) {
      window.clearInterval(this.heartbeatWatch);
      this.heartbeatWatch = null;
    }
    this.listeners.clear();
  }
}
