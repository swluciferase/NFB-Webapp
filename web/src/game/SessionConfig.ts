import type { GameId, Lang, RunResult, Theme } from './Game';
import type { NfbSettings } from '../services/nfbSettingsStore';

export type SessionDurationSec = 300 | 600 | 900 | 1200;

export interface SessionConfig {
  gameId: GameId;
  modeId: string;
  themeId: Theme['id'];
  lang: Lang;
  plannedDurationSec: SessionDurationSec;
}

export interface SessionReport {
  sessionId: string;
  gameId: GameId;
  gameMode: string;
  themeId: Theme['id'];
  startedAt: number;
  endedAt: number;
  plannedDurationSec: SessionDurationSec;
  actualDurationSec: number;
  runs: RunResult[];
  validRunsCount: number;
  avgOO: number;
  nfbSettingsSnapshot: NfbSettings;
}
