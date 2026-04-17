import type { NfbIndicatorSetting } from '../services/nfbSettingsStore';

export type Lang = 'zh' | 'en';

export type ThemeId = 'day' | 'dusk' | 'sunset' | 'night';

export interface ThemeVisual {
  // Sky gradient (top → bottom) — painted as horizontal bands.
  skyTop: string;
  skyBottom: string;
  // Sun core + outer glow (blurred) + ray stroke color.
  sun: string;
  sunGlow: string;
  // Three painted bezier ridge ranges (back → front).
  mtnFar: string;
  mtnMid: string;
  mtnNear: string;
  // Grass foreground + brighter tip color.
  grass: string;
  grassTip: string;
  // Cloud body + underside shade (highlight is always white).
  cloudBright: string;
  cloudShade: string;
  // Warm haze overlay covering the whole screen.
  hazeTint: string;
  hazeAlpha: number;
  // Ambient multiplier for trail/sparkle brightness (0.7..1.0).
  ambient: number;
}

export interface Theme {
  id: ThemeId;
  name: Record<Lang, string>;
  previewUrl: string;
  palette: Record<string, string>;
  visual: ThemeVisual;
  bgmUrl: string;
  sfx: Record<string, string>;
  sprites: {
    plane: { body: string; trail: string; cloud: string[]; bird: string };
  };
}

export interface GameMode {
  id: string;
  name: Record<Lang, string>;
  taskLoad: 'single' | 'dual';
}

export type GameId = 'plane' | 'baseball' | 'zentangle' | 'karesansui';

export interface RunResult {
  runIndex: number;
  startedAt: number;
  durationMs: number;
  rlSeries: number[];             // full sub-second Reward Level stream from the subject window
  qualityPercent: number;         // filled in by the main window at run end
  isValid: boolean;
  gameSpecific: Record<string, number | boolean>;
}

export type GameInputEvent =
  | { type: 'primary' }
  | { type: 'secondary' }
  | { type: 'pause' }
  | { type: 'direction'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

export interface GameStats {
  rl: number;  // Reward Level (0–100)
  // Plane-specific
  altitudeM?: number;
  distanceM?: number;
  // Baseball-specific. inning 1..N, pitch 1..9, charge 0..100 (live during
  // the charge phase), runs = cumulative runs scored this inning, lastResult
  // = the most recently resolved pitch (for subject HUD flash), ballparkM =
  // wall distance for the selected ballpark (constant per session).
  inning?: number;
  pitch?: number;
  charge?: number;
  runs?: number;
  homeRuns?: number;
  lastResult?: BaseballHitKind | null;
  ballparkM?: number;
  // Baseball dual-mode. When present, SubjectWindowRoot shows a two-team scoreboard.
  dualTeamAName?: string;
  dualTeamBName?: string;
  dualTeamARuns?: number[];   // runs per inning for Team A (−1 = not yet played)
  dualTeamBRuns?: number[];   // runs per inning for Team B
  dualIsBottomHalf?: boolean; // true while Team B is batting
  dualCurrentInning?: number; // 1-based inning number
  dualInningTotal?: number;
  // Zentangle-specific. coveragePct 0..100 tracks how much of the
  // zentangle template has been traced within the coverage radius.
  coveragePct?: number;
  // Karesanzui-specific. bloomPct 0..100 tracks tree bloom progress.
  // Phase 1: pattern drawing in progress (bloomPct stays 0).
  // Phase 2: bloom grows when rl > threshold after pattern completes.
  bloomPct?: number;
}

export type BaseballHitKind =
  | 'whiff'
  | 'groundOut'
  | 'popFly'
  | 'deepFlyOut'
  | 'single'
  | 'double'
  | 'triple'
  | 'homeRun';

export type GameStatsListener = (stats: GameStats) => void;

export interface GameFactoryArgs {
  container: HTMLDivElement;
  theme: Theme;
  lang: Lang;
  modeId: string;
  onStats?: GameStatsListener;
}

export type GameFactory = (args: GameFactoryArgs) => GameInstance;

export interface GameInstance {
  startRun(runIndex: number, onFinish: (r: RunResult) => void): void;
  /** rl: 0–100 Reward Level score. ta: threshold from NFB settings (default 50). */
  setRL(rl: number, ta?: number): void;
  onInput?(event: GameInputEvent): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface GameManifest {
  id: GameId;
  name: Record<Lang, string>;
  tagline: Record<Lang, string>;
  runDurationSec: number;
  modes: GameMode[];
  load(): Promise<GameFactory>;
}

export type { NfbIndicatorSetting };
