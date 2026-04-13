import type { NfbIndicatorSetting } from '../services/nfbSettingsStore';

export type Lang = 'zh' | 'en';

export interface Theme {
  id: 'papercut' | 'ghibli' | 'geometric';
  name: Record<Lang, string>;
  previewUrl: string;
  palette: Record<string, string>;
  bgmUrl: string;
  sfx: Record<string, string>;
  sprites: {
    plane: { body: string; trail: string; cloud: string[]; bird: string };
    golf:  { ball: string; club: string; terrain: string[]; flag: string };
    maze:  { rabbit: string[]; carrot: string; wall: string[]; goal: string };
  };
}

export interface GameMode {
  id: string;
  name: Record<Lang, string>;
  taskLoad: 'single' | 'dual';
}

export type GameId = 'plane' | 'golf' | 'maze';

export interface RunResult {
  runIndex: number;
  startedAt: number;
  durationMs: number;
  ooSeries: number[];             // full sub-second OO stream from the subject window
  qualityPercent: number;         // filled in by the main window at run end
  isValid: boolean;
  gameSpecific: Record<string, number | boolean>;
}

export type GameInputEvent =
  | { type: 'primary' }
  | { type: 'secondary' }
  | { type: 'pause' }
  | { type: 'direction'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

export interface GameFactoryArgs {
  container: HTMLDivElement;
  theme: Theme;
  lang: Lang;
  modeId: string;
}

export type GameFactory = (args: GameFactoryArgs) => GameInstance;

export interface GameInstance {
  startRun(runIndex: number, onFinish: (r: RunResult) => void): void;
  setOO(oo: number): void;
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
