import type { GameId, Lang, RunResult, Theme } from './Game';
import type { NfbSettings } from '../services/nfbSettingsStore';

export type SessionDurationSec = 300 | 600 | 900 | 1200;

/** Baseball sessions run for a fixed number of innings (1, 3, 5, 7, or 9). */
export type SessionInningCount = 1 | 3 | 5 | 7 | 9;

/**
 * ZenTangle sessions have no time limit. The therapist picks a target coverage
 * percentage; the run ends the moment the trace hits that threshold.
 * Karesanzui uses 100 (full bloom) as its fixed target.
 */
export type SessionCoveragePct = 50 | 66 | 80 | 95 | 100;

export interface SessionConfig {
  gameId: GameId;
  modeId: string;
  themeId: Theme['id'];
  lang: Lang;
  // Time-based termination (plane). Not used when plannedInnings or
  // plannedCoveragePct is set — those sessions are event-driven.
  plannedDurationSec?: SessionDurationSec;
  // Set when gameId === 'baseball'. Each run in the controller represents one
  // inning; the session terminates on run-count, not elapsed time.
  plannedInnings?: SessionInningCount;
  // Set when gameId === 'zentangle'. The run ends when template coverage
  // reaches this percent (0–100); no wall-clock cap.
  // Set to 100 when gameId === 'karesansui' (full bloom = session complete).
  plannedCoveragePct?: SessionCoveragePct;
  // Set when gameId === 'karesansui'. Which rake pattern to draw.
  patternId?: string;
  // Set when gameId === 'zentangle'. When true, RL does not affect template
  // visibility — the pattern is shown at a fixed opacity for pure art practice.
  noFeedback?: boolean;
  // Set when gameId === 'zentangle' && modeId === 'freeform'.
  // Palette ID for RL-driven color interpolation.
  paletteId?: string;
  // Set when gameId === 'baseball' && modeId === 'dual'.
  dualTeamA?: string;  // Team A display name (defaults to 'Team A')
  dualTeamB?: string;  // Team B display name (defaults to 'Team B')
  dualSerialA?: string; // EEG device serial for Team A (informational)
  dualSerialB?: string; // EEG device serial for Team B (informational)
}

export interface SessionReport {
  sessionId: string;
  gameId: GameId;
  gameMode: string;
  themeId: Theme['id'];
  startedAt: number;
  endedAt: number;
  plannedDurationSec?: SessionDurationSec;
  plannedInnings?: SessionInningCount;
  plannedCoveragePct?: SessionCoveragePct;
  actualDurationSec: number;
  runs: RunResult[];
  validRunsCount: number;
  avgRL: number;
  /** Last known TA (threshold) value broadcast during the session. */
  lastTa?: number;
  nfbSettingsSnapshot: NfbSettings;
}
