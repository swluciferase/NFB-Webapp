# SoraMynd GamePack — M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SoraMynd v0.8.0-alpha: a Games tab with dual-window architecture (therapist control in main window + subject PlaneFlight game in a second tab), papercut theme only, with all foundation pieces in place for M2–M5.

**Architecture:** Main window owns EEG / OO compute / session state / upload. Subject window (`web/nfb-game.html`, separate Vite entry at project root — NOT in `public/`) is a pure Pixi.js v8 renderer that receives OO and run lifecycle over `BroadcastChannel('soramynd-game-v1')`. All shared NFB math is extracted into pure functions in `utils/nfbFormulas.ts` without modifying TrainingView's OO compute path. Only one additive `useEffect` in TrainingView mirrors settings into localStorage so the Games tab can read them.

**Tech Stack:** React 19 + TypeScript + Vite 8 + Bun + Pixi.js v8 + BroadcastChannel API + localStorage + IndexedDB + vitest (new). No backend changes — uploads flow through the existing artisebio-api endpoints used by `sgimacog-web`.

**Spec:** `docs/superpowers/specs/2026-04-13-soramynd-gamepack-design.md` (commit `e971e25`). M1 scope per §13 of the spec.

**Milestone boundary:** This plan covers M1 only (foundation + dual-window shell + PlaneFlight). M2 Golf, M3 Maze, M4 ghibli theme + report polish, and M5 release get their own plans after M1 ships to staging.

---

## File Structure

### New files (23)

| Path | Purpose |
|---|---|
| `web/vitest.config.ts` | Test runner config (jsdom environment) |
| `web/src/test/setup.ts` | Global test setup (BroadcastChannel polyfill if needed) |
| `web/src/utils/nfbFormulas.ts` | Pure `K_VALUES`, `W_VALUES`, `computeTickBool`, `computeTA`, `computeOO` |
| `web/src/utils/nfbFormulas.test.ts` | Formula unit tests |
| `web/src/services/nfbSettingsStore.ts` | localStorage read/write + schema validation for NFB settings |
| `web/src/services/nfbSettingsStore.test.ts` | Store unit tests |
| `web/src/services/gameChannel.ts` | Typed BroadcastChannel wrapper, heartbeat helper |
| `web/src/services/gameChannel.test.ts` | Channel schema + send/receive tests |
| `web/src/services/gameSessionApi.ts` | Upload SessionReport + CSV to artisebio-api (ported from `sgimacog-web/src/services/sessionApi.ts` shape) |
| `web/src/services/gameSessionLog.ts` | IndexedDB `pendingGameSessions` queue + localStorage fallback |
| `web/src/hooks/useGameOverlayOpacity.ts` | Main-window-only OO stream for games |
| `web/src/hooks/useGameOverlayOpacity.test.tsx` | Hook tests via `@testing-library/react` |
| `web/src/components/shared/QualityPill.tsx` | Extracted quality indicator component |
| `web/src/components/views/GameControlView.tsx` | Therapist control view (wizard + active HUD router) |
| `web/src/game/Game.ts` | `GameInstance`, `GameManifest`, `GameMode`, `RunResult`, `GameInputEvent`, `Theme` interfaces |
| `web/src/game/SessionConfig.ts` | `SessionConfig`, `SessionReport` types |
| `web/src/game/control/GameSessionController.ts` | Main-window state machine + OO pump + session timer |
| `web/src/game/control/GameSessionController.test.ts` | State machine unit tests |
| `web/src/game/control/sessionWizard/SelectGameStep.tsx` | Wizard step 1 |
| `web/src/game/control/sessionWizard/SelectDurationStep.tsx` | Wizard step 2 |
| `web/src/game/control/sessionWizard/NfbSettingsPanel.tsx` | Compact NFB settings form |
| `web/src/game/control/OpenSubjectWindowButton.tsx` | Pop-up launcher + status handling |
| `web/src/game/control/SubjectWindowStatus.tsx` | Connected/lost/reopen indicator |
| `web/src/game/control/TherapistHud.tsx` | Live OO/TA/quality/timer/controls during a run |
| `web/src/game/control/sessionReport.tsx` | Session-end report view |
| `web/src/game/subject/SubjectWindowRoot.tsx` | Subject-window React root that mounts GameEngine |
| `web/src/game/subject/GameEngine.ts` | Subject-side Pixi lifecycle + channel listener |
| `web/src/game/subject/pixiBootstrap.ts` | Pixi v8 `Application` create/resize/destroy |
| `web/src/game/subject/InputCapture.ts` | Keyboard → `gameChannel.post('gameInput')` |
| `web/src/game/themes/tokens.ts` | `Theme` data type |
| `web/src/game/themes/papercut/index.ts` | papercut theme data (palette, bgm url, sprite paths) |
| `web/src/game/themes/papercut/palette.ts` | papercut colour tokens |
| `web/src/game/games/plane/PlaneGame.ts` | Implements `GameInstance`, no React |
| `web/src/game/games/plane/terrain.ts` | Procedural parallax valley generator |
| `web/src/game/games/plane/terrain.test.ts` | Deterministic-seed terrain tests |
| `web/src/game/games/plane/scene.ts` | Pixi scene graph builder for Plane |
| `web/src/game/games/plane/manifest.ts` | Plane `GameManifest` + dynamic import factory |
| `web/src/gameWindow.tsx` | Subject-window entry React bootstrap |
| `web/nfb-game.html` | Second Vite entry HTML (at project root, **not** in `public/`) |

### Modified files (5)

| Path | Why |
|---|---|
| `web/package.json` | Add `vitest`, `@testing-library/react`, `@testing-library/dom`, `jsdom`, `pixi.js`, `fake-indexeddb` as devDeps/deps |
| `web/vite.config.ts` | Multi-entry (`index.html` + `nfb-game.html`), add obfuscator excludes for subject-window + Pixi |
| `web/src/App.tsx` | Add `games` tab routing to `GameControlView` |
| `web/src/components/layout/Sidebar.tsx` | Add `games` TabType + icon + entry |
| `web/src/components/views/TrainingView.tsx` | Add one additive `useEffect` mirroring settings into `nfbSettingsStore.write(...)` |

### Module boundaries (enforced by review)

- `game/subject/**` imports only `game/Game.ts`, `game/games/**`, `game/themes/**`, `services/gameChannel.ts`. No React hooks from `hooks/`, no EEG services, no `components/**`.
- `game/control/**` imports only hooks, services, utils, `game/Game.ts`, `game/SessionConfig.ts`, `game/control/**`. No `game/subject/**`. No Pixi.
- `game/games/plane/PlaneGame.ts` imports neither React nor `gameChannel` — only Pixi and its own submodules.

---

## Prerequisites

- [ ] **Step P1: Verify you are on a clean branch**

```bash
cd /Users/swryociao/NFB-Webapp
git status
git log -1 --oneline
```

Expected: branch `main` or feature branch, working tree clean apart from any pre-existing untracked noise.

- [ ] **Step P2: Create feature branch**

```bash
cd /Users/swryociao/NFB-Webapp
git checkout -b feat/gamepack-m1
```

Expected: Switched to a new branch.

- [ ] **Step P3: Confirm bun is on PATH**

```bash
~/.bun/bin/bun --version
```

Expected: prints a version number. All subsequent package installs use `~/.bun/bin/bun add ...`. If bun is missing, STOP and tell the human.

---

## Task 0: Test Infrastructure

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/src/test/setup.ts`
- Modify: `web/package.json`

The project has no test runner yet. Add vitest + jsdom + React Testing Library so every subsequent task can use TDD. BroadcastChannel is available in jsdom ≥ 22 (we install the latest), so no polyfill is needed.

- [ ] **Step 1: Install test dependencies**

Run from `/Users/swryociao/NFB-Webapp/web`:

```bash
~/.bun/bin/bun add -d vitest@^2 jsdom@^25 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/jest-dom@^6 @types/node
```

Expected: `bun.lock` updates, packages appear under `devDependencies` in `web/package.json`.

- [ ] **Step 2: Install runtime dependencies**

```bash
~/.bun/bin/bun add pixi.js@^8 fake-indexeddb@^6
```

Expected: `pixi.js` and `fake-indexeddb` added to `dependencies`. (planck.js is deferred to M2.)

- [ ] **Step 3: Create vitest config**

Create `web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
```

- [ ] **Step 4: Create test setup**

Create `web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

`fake-indexeddb/auto` patches `indexedDB` globally so `gameSessionLog` tests run in jsdom.

- [ ] **Step 5: Add test scripts to package.json**

Modify `web/package.json` so `scripts` becomes:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 6: Create smoke test**

Create `web/src/test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('test infrastructure smoke', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('has BroadcastChannel available in jsdom', () => {
    expect(typeof BroadcastChannel).toBe('function');
    const ch = new BroadcastChannel('test');
    ch.close();
  });

  it('has indexedDB available via fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
    expect(typeof indexedDB.open).toBe('function');
  });
});
```

- [ ] **Step 7: Run smoke test**

Run from `/Users/swryociao/NFB-Webapp/web`:

```bash
~/.bun/bin/bun run test -- smoke
```

Expected: 3 tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/package.json web/bun.lock web/vitest.config.ts web/src/test/
git commit -m "chore(gamepack): add vitest + testing-library + pixi.js"
```

---

## Task 1: `utils/nfbFormulas.ts` — pure formula module (TDD)

**Files:**
- Create: `web/src/utils/nfbFormulas.ts`
- Create: `web/src/utils/nfbFormulas.test.ts`

Pure functions, zero React/DOM imports. These will be imported by both `useGameOverlayOpacity` (new) and eventually a refactored `TrainingView` (not in M1). For M1, `TrainingView.tsx` keeps its inline `K_VALUES`/`W_VALUES` — we only add a mirror, we do not refactor.

Contract (from spec §4.2): `computeTA` returns 0–100 %; `computeOO` returns `clamp(K × √TA, 0, 100)` with K from `K_VALUES[difficultyLevel-1]`.

- [ ] **Step 1: Write failing test file**

Create `web/src/utils/nfbFormulas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  K_VALUES,
  W_VALUES,
  computeTA,
  computeOO,
  computeTickBool,
} from './nfbFormulas';

describe('K_VALUES / W_VALUES constants', () => {
  it('matches the documented TrainingView values', () => {
    expect(K_VALUES).toEqual([16.67, 14.29, 12.70, 11.55, 10.66]);
    expect(W_VALUES).toEqual([5, 8, 12, 17, 23]);
  });
});

describe('computeTA', () => {
  it('returns 0 for empty window', () => {
    expect(computeTA([])).toBe(0);
  });
  it('returns 100 when every tick is true', () => {
    expect(computeTA([true, true, true, true])).toBe(100);
  });
  it('returns 0 when every tick is false', () => {
    expect(computeTA([false, false, false])).toBe(0);
  });
  it('returns 50 for a half-met window', () => {
    expect(computeTA([true, false, true, false])).toBe(50);
  });
  it('normalises by the actual window length (pre-warmup)', () => {
    expect(computeTA([true, true])).toBe(100);
  });
});

describe('computeOO', () => {
  it('returns 0 when TA is 0', () => {
    expect(computeOO(0, 3)).toBe(0);
  });
  it('caps at 100', () => {
    expect(computeOO(100, 1)).toBe(100);
  });
  it('matches K[diff] * sqrt(TA) for diff=3, TA=50', () => {
    // K[2] = 12.70, sqrt(50) ≈ 7.0710678
    expect(computeOO(50, 3)).toBeCloseTo(12.70 * Math.sqrt(50), 5);
  });
  it('rejects invalid difficulty levels', () => {
    expect(() => computeOO(50, 0 as unknown as 1)).toThrow();
    expect(() => computeOO(50, 6 as unknown as 1)).toThrow();
  });
});

describe('computeTickBool', () => {
  it('returns false when no indicators are provided', () => {
    expect(computeTickBool([], {})).toBe(false);
  });
  it('returns true only if every indicator meets its condition (AND semantics)', () => {
    const result = computeTickBool(
      [
        { id: 'a', direction: 'up', threshold: 10, metricKey: 'Fz_Beta' },
        { id: 'b', direction: 'down', threshold: 5, metricKey: 'Fz_Theta' },
      ],
      { Fz_Beta: 15, Fz_Theta: 3 },
    );
    expect(result).toBe(true);
  });
  it('returns false when any indicator fails (direction up)', () => {
    const result = computeTickBool(
      [{ id: 'a', direction: 'up', threshold: 10, metricKey: 'Fz_Beta' }],
      { Fz_Beta: 9 },
    );
    expect(result).toBe(false);
  });
  it('returns false when the metric value is missing', () => {
    const result = computeTickBool(
      [{ id: 'a', direction: 'up', threshold: 10, metricKey: 'Fz_Beta' }],
      {},
    );
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
~/.bun/bin/bun run test -- nfbFormulas
```

Expected: FAIL with "Cannot find module './nfbFormulas'".

- [ ] **Step 3: Create the implementation**

Create `web/src/utils/nfbFormulas.ts`:

```ts
export const K_VALUES = [16.67, 14.29, 12.70, 11.55, 10.66] as const;
export const W_VALUES = [5, 8, 12, 17, 23] as const;

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;
export type PersistenceLevel = 1 | 2 | 3 | 4 | 5;

export interface NfbIndicator {
  id: string;
  direction: 'up' | 'down';
  threshold: number;
  metricKey: string;
}

export function computeTA(window: ReadonlyArray<boolean>): number {
  if (window.length === 0) return 0;
  let hits = 0;
  for (const t of window) if (t) hits++;
  return (hits / window.length) * 100;
}

export function computeOO(ta: number, difficulty: DifficultyLevel): number {
  if (difficulty < 1 || difficulty > 5) {
    throw new Error(`Invalid difficulty level: ${difficulty}`);
  }
  const k = K_VALUES[difficulty - 1];
  const raw = k * Math.sqrt(Math.max(0, ta));
  if (raw <= 0) return 0;
  if (raw >= 100) return 100;
  return raw;
}

export function computeTickBool(
  indicators: ReadonlyArray<NfbIndicator>,
  metrics: Readonly<Record<string, number>>,
): boolean {
  if (indicators.length === 0) return false;
  for (const ind of indicators) {
    const v = metrics[ind.metricKey];
    if (v === undefined || Number.isNaN(v)) return false;
    if (ind.direction === 'up' && !(v >= ind.threshold)) return false;
    if (ind.direction === 'down' && !(v < ind.threshold)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
~/.bun/bin/bun run test -- nfbFormulas
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/utils/nfbFormulas.ts web/src/utils/nfbFormulas.test.ts
git commit -m "feat(gamepack): add pure nfbFormulas utility"
```

---

## Task 2: `services/nfbSettingsStore.ts` (TDD)

**Files:**
- Create: `web/src/services/nfbSettingsStore.ts`
- Create: `web/src/services/nfbSettingsStore.test.ts`

localStorage-backed NFB settings mirror. Key design:
- **Single key:** `soramynd.nfb.settings.v1` (namespaced + versioned so a schema bump does not clobber valid data).
- **Schema-validated reads:** unknown shapes return the built-in default rather than throwing.
- **Publish/subscribe** so `useGameOverlayOpacity` can re-read on change.

- [ ] **Step 1: Write failing test**

Create `web/src/services/nfbSettingsStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  nfbSettingsStore,
  DEFAULT_NFB_SETTINGS,
  NFB_SETTINGS_STORAGE_KEY,
  type NfbSettings,
} from './nfbSettingsStore';

describe('nfbSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the default preset when storage is empty', () => {
    expect(nfbSettingsStore.read()).toEqual(DEFAULT_NFB_SETTINGS);
  });

  it('round-trips a valid settings object', () => {
    const s: NfbSettings = {
      indicators: [
        { id: 'eeg1', enabled: true, direction: 'up', threshold: 12, metricKey: 'Fz_Beta' },
      ],
      difficultyLevel: 4,
      persistenceLevel: 2,
      qualitySensitivity: 3,
    };
    nfbSettingsStore.write(s);
    expect(nfbSettingsStore.read()).toEqual(s);
  });

  it('returns default on invalid JSON', () => {
    localStorage.setItem(NFB_SETTINGS_STORAGE_KEY, '{not-json');
    expect(nfbSettingsStore.read()).toEqual(DEFAULT_NFB_SETTINGS);
  });

  it('returns default on schema mismatch', () => {
    localStorage.setItem(NFB_SETTINGS_STORAGE_KEY, JSON.stringify({ wrong: 'shape' }));
    expect(nfbSettingsStore.read()).toEqual(DEFAULT_NFB_SETTINGS);
  });

  it('notifies subscribers on write', () => {
    const listener = vi.fn();
    const unsub = nfbSettingsStore.subscribe(listener);
    nfbSettingsStore.write({ ...DEFAULT_NFB_SETTINGS, difficultyLevel: 5 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ difficultyLevel: 5 }));
    unsub();
  });

  it('unsubscribes cleanly', () => {
    const listener = vi.fn();
    const unsub = nfbSettingsStore.subscribe(listener);
    unsub();
    nfbSettingsStore.write({ ...DEFAULT_NFB_SETTINGS, difficultyLevel: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
~/.bun/bin/bun run test -- nfbSettingsStore
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the store**

Create `web/src/services/nfbSettingsStore.ts`:

```ts
export interface NfbIndicatorSetting {
  id: string;
  enabled: boolean;
  direction: 'up' | 'down';
  threshold: number;
  metricKey: string;
}

export interface NfbSettings {
  indicators: NfbIndicatorSetting[];
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  persistenceLevel: 1 | 2 | 3 | 4 | 5;
  qualitySensitivity: 1 | 2 | 3 | 4 | 5;
}

export const NFB_SETTINGS_STORAGE_KEY = 'soramynd.nfb.settings.v1';

export const DEFAULT_NFB_SETTINGS: NfbSettings = {
  indicators: [
    { id: 'eeg1', enabled: true, direction: 'up', threshold: 10, metricKey: 'Fz_Beta' },
  ],
  difficultyLevel: 3,
  persistenceLevel: 3,
  qualitySensitivity: 3,
};

function isValid(value: unknown): value is NfbSettings {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.indicators)) return false;
  for (const ind of v.indicators) {
    if (!ind || typeof ind !== 'object') return false;
    const i = ind as Record<string, unknown>;
    if (typeof i.id !== 'string') return false;
    if (typeof i.enabled !== 'boolean') return false;
    if (i.direction !== 'up' && i.direction !== 'down') return false;
    if (typeof i.threshold !== 'number') return false;
    if (typeof i.metricKey !== 'string') return false;
  }
  const isLvl = (x: unknown) => typeof x === 'number' && x >= 1 && x <= 5 && Number.isInteger(x);
  if (!isLvl(v.difficultyLevel)) return false;
  if (!isLvl(v.persistenceLevel)) return false;
  if (!isLvl(v.qualitySensitivity)) return false;
  return true;
}

type Listener = (settings: NfbSettings) => void;
const listeners = new Set<Listener>();

export const nfbSettingsStore = {
  read(): NfbSettings {
    try {
      const raw = localStorage.getItem(NFB_SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_NFB_SETTINGS;
      const parsed = JSON.parse(raw);
      if (!isValid(parsed)) return DEFAULT_NFB_SETTINGS;
      return parsed;
    } catch {
      return DEFAULT_NFB_SETTINGS;
    }
  },
  write(settings: NfbSettings): void {
    try {
      localStorage.setItem(NFB_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // quota / disabled storage — ignore in v1
    }
    for (const l of listeners) l(settings);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
~/.bun/bin/bun run test -- nfbSettingsStore
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/services/nfbSettingsStore.ts web/src/services/nfbSettingsStore.test.ts
git commit -m "feat(gamepack): add NFB settings store with schema validation"
```

---

## Task 3: `game/Game.ts` and `game/SessionConfig.ts` — type contracts

**Files:**
- Create: `web/src/game/Game.ts`
- Create: `web/src/game/SessionConfig.ts`

Types only — no runtime code, no tests. They are imported by both control and subject halves, so they must live in `game/` not under either half.

- [ ] **Step 1: Create `Game.ts`**

Create `web/src/game/Game.ts`:

```ts
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
```

- [ ] **Step 2: Create `SessionConfig.ts`**

Create `web/src/game/SessionConfig.ts`:

```ts
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build 2>&1 | tail -5
```

Expected: no type errors. (Build may still fail on missing downstream files — only the type files should compile.)

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/Game.ts web/src/game/SessionConfig.ts
git commit -m "feat(gamepack): add Game + SessionConfig type contracts"
```

---

## Task 4: `services/gameChannel.ts` — BroadcastChannel wrapper (TDD)

**Files:**
- Create: `web/src/services/gameChannel.ts`
- Create: `web/src/services/gameChannel.test.ts`

Wire contract between main and subject windows. Typed message union, typed subscribers, heartbeat helper.

- [ ] **Step 1: Write the failing test**

Create `web/src/services/gameChannel.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createGameChannel,
  GAME_CHANNEL_NAME,
  GAME_PROTOCOL_VERSION,
  type GameChannelMessage,
} from './gameChannel';

describe('gameChannel', () => {
  const closers: Array<() => void> = [];
  afterEach(() => {
    while (closers.length) closers.pop()!();
  });

  it('uses the versioned channel name', () => {
    expect(GAME_CHANNEL_NAME).toBe('soramynd-game-v1');
    expect(GAME_PROTOCOL_VERSION).toBe(1);
  });

  it('delivers messages from sender to receiver', async () => {
    const sender = createGameChannel();
    const receiver = createGameChannel();
    closers.push(() => sender.close(), () => receiver.close());

    const received: GameChannelMessage[] = [];
    receiver.subscribe((msg) => received.push(msg));

    sender.post({ kind: 'hello', sessionId: 'abc', protocolVersion: 1 });

    // BroadcastChannel in jsdom is async — wait a tick.
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toEqual([
      { kind: 'hello', sessionId: 'abc', protocolVersion: 1 },
    ]);
  });

  it('does not deliver messages to itself', async () => {
    const ch = createGameChannel();
    closers.push(() => ch.close());

    const listener = vi.fn();
    ch.subscribe(listener);
    ch.post({ kind: 'pause' });
    await new Promise((r) => setTimeout(r, 10));

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops delivering after close', async () => {
    const sender = createGameChannel();
    const receiver = createGameChannel();
    closers.push(() => sender.close());

    const listener = vi.fn();
    receiver.subscribe(listener);
    receiver.close();

    sender.post({ kind: 'pause' });
    await new Promise((r) => setTimeout(r, 10));
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
~/.bun/bin/bun run test -- gameChannel
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement the channel**

Create `web/src/services/gameChannel.ts`:

```ts
import type { GameId, GameInputEvent, RunResult, Lang, Theme } from '../game/Game';

export const GAME_CHANNEL_NAME = 'soramynd-game-v1';
export const GAME_PROTOCOL_VERSION = 1;

export type GameChannelMessage =
  // main → subject
  | { kind: 'hello';          sessionId: string; protocolVersion: number }
  | { kind: 'loadGame';       gameId: GameId; modeId: string; themeId: Theme['id']; lang: Lang }
  | { kind: 'preview' }
  | { kind: 'runStart';       runIndex: number; runDurationSec: number; startedAt: number }
  | { kind: 'oo';             t: number; oo: number; ta: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'runForceEnd' }
  | { kind: 'sessionEnd' }
  | { kind: 'themeChange';    themeId: Theme['id'] }
  | { kind: 'heartbeatMain';  t: number }
  // subject → main
  | { kind: 'subjectReady';   protocolVersion: number }
  | { kind: 'runResult';      runIndex: number; result: RunResult }
  | { kind: 'gameInput';      event: GameInputEvent }
  | { kind: 'heartbeatSubject'; t: number }
  | { kind: 'subjectClosing' };

export type GameChannelListener = (msg: GameChannelMessage) => void;

export interface GameChannel {
  post(msg: GameChannelMessage): void;
  subscribe(listener: GameChannelListener): () => void;
  close(): void;
}

export function createGameChannel(): GameChannel {
  const bc = new BroadcastChannel(GAME_CHANNEL_NAME);
  const listeners = new Set<GameChannelListener>();
  let closed = false;

  bc.addEventListener('message', (e: MessageEvent) => {
    if (closed) return;
    const msg = e.data as GameChannelMessage;
    for (const l of listeners) l(msg);
  });

  return {
    post(msg) {
      if (closed) return;
      bc.postMessage(msg);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      bc.close();
    },
  };
}
```

- [ ] **Step 4: Run the test**

```bash
~/.bun/bin/bun run test -- gameChannel
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/services/gameChannel.ts web/src/services/gameChannel.test.ts
git commit -m "feat(gamepack): add typed BroadcastChannel wrapper"
```

---

## Task 5: `hooks/useGameOverlayOpacity.ts` (TDD)

**Files:**
- Create: `web/src/hooks/useGameOverlayOpacity.ts`
- Create: `web/src/hooks/useGameOverlayOpacity.test.tsx`

Independent OO stream for the game path. Drives off of a `BandPowerMatrix` from `useBandPower` and reads NFB settings from the store.

For M1 this hook handles only EEG metrics (`Fz_Beta`, etc.) — cardiac metrics are out of scope and wired up only if a session's NFB preset uses them, which the default does not. The indicator's `metricKey` shape is intentionally open (string) so M1 can ship with the minimum set and extend later without schema changes.

- [ ] **Step 1: Write the failing test**

Create `web/src/hooks/useGameOverlayOpacity.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameOverlayOpacity } from './useGameOverlayOpacity';
import { nfbSettingsStore, DEFAULT_NFB_SETTINGS } from '../services/nfbSettingsStore';

describe('useGameOverlayOpacity', () => {
  beforeEach(() => {
    localStorage.clear();
    nfbSettingsStore.write({
      ...DEFAULT_NFB_SETTINGS,
      indicators: [
        { id: 'eeg1', enabled: true, direction: 'up', threshold: 10, metricKey: 'Fz_Beta' },
      ],
      difficultyLevel: 3,
      persistenceLevel: 1,
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function metrics(fzBeta: number): Record<string, number> {
    return { Fz_Beta: fzBeta };
  }

  it('starts at oo=0 with no data', () => {
    const { result } = renderHook(() => useGameOverlayOpacity(null));
    expect(result.current.oo).toBe(0);
    expect(result.current.ta).toBe(0);
    expect(result.current.isActive).toBe(true);
  });

  it('rises toward 100 after sustained above-threshold metrics', () => {
    const { result, rerender } = renderHook(
      ({ m }) => useGameOverlayOpacity(m),
      { initialProps: { m: metrics(20) } },
    );

    // Persistence level 1 → window size 5 seconds
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      rerender({ m: metrics(20) });
    }
    expect(result.current.ta).toBe(100);
    // K[2] = 12.70, OO = 12.70 * sqrt(100) = 127 → clamped to 100
    expect(result.current.oo).toBe(100);
  });

  it('drops to 0 when metrics fail', () => {
    const { result, rerender } = renderHook(
      ({ m }) => useGameOverlayOpacity(m),
      { initialProps: { m: metrics(5) } },
    );

    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      rerender({ m: metrics(5) });
    }
    expect(result.current.ta).toBe(0);
    expect(result.current.oo).toBe(0);
  });

  it('exposes a resetSession handle that clears accumulation', () => {
    const { result, rerender } = renderHook(
      ({ m }) => useGameOverlayOpacity(m),
      { initialProps: { m: metrics(20) } },
    );
    for (let i = 0; i < 3; i++) {
      act(() => vi.advanceTimersByTime(1000));
      rerender({ m: metrics(20) });
    }
    act(() => result.current.resetSession());
    expect(result.current.oo).toBe(0);
    expect(result.current.ta).toBe(0);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
~/.bun/bin/bun run test -- useGameOverlayOpacity
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the hook**

Create `web/src/hooks/useGameOverlayOpacity.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  K_VALUES,
  W_VALUES,
  computeTA,
  computeOO,
  computeTickBool,
} from '../utils/nfbFormulas';
import {
  nfbSettingsStore,
  type NfbSettings,
} from '../services/nfbSettingsStore';

export interface GameOverlayOpacity {
  oo: number;
  ta: number;
  tick: boolean;
  isActive: boolean;
  resetSession: () => void;
}

/**
 * Build a flat Record<string,number> of all metrics the NFB settings might
 * reference. For M1 only Fz_Beta / Fz_Theta are surfaced; extend as new
 * metrics come online.
 */
function buildMetricMap(metrics: Record<string, number> | null): Record<string, number> {
  return metrics ?? {};
}

export function useGameOverlayOpacity(
  metrics: Record<string, number> | null,
): GameOverlayOpacity {
  const [settings, setSettings] = useState<NfbSettings>(() => nfbSettingsStore.read());
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => nfbSettingsStore.subscribe(setSettings), []);

  const taWindowRef = useRef<boolean[]>([]);
  const [tick, setTick] = useState(false);
  const [ta, setTa] = useState(0);
  const [oo, setOo] = useState(0);

  const metricsRef = useRef<Record<string, number>>(buildMetricMap(metrics));
  useEffect(() => {
    metricsRef.current = buildMetricMap(metrics);
  }, [metrics]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = settingsRef.current;
      const enabled = s.indicators.filter((i) => i.enabled);
      const thisTick = computeTickBool(enabled, metricsRef.current);
      const W = W_VALUES[s.persistenceLevel - 1]!;
      const nextWindow = [...taWindowRef.current, thisTick];
      if (nextWindow.length > W) nextWindow.shift();
      taWindowRef.current = nextWindow;
      const nextTa = computeTA(nextWindow);
      const nextOo = computeOO(nextTa, s.difficultyLevel);
      setTick(thisTick);
      setTa(nextTa);
      setOo(nextOo);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const resetSession = useCallback(() => {
    taWindowRef.current = [];
    setTick(false);
    setTa(0);
    setOo(0);
  }, []);

  const isActive = useMemo(
    () => settings.indicators.some((i) => i.enabled),
    [settings],
  );

  // Silence unused-import warning (K_VALUES is used indirectly via computeOO;
  // keep a reference so future refactors notice this dependency).
  void K_VALUES;

  return { oo, ta, tick, isActive, resetSession };
}
```

- [ ] **Step 4: Run the test**

```bash
~/.bun/bin/bun run test -- useGameOverlayOpacity
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/hooks/useGameOverlayOpacity.ts web/src/hooks/useGameOverlayOpacity.test.tsx
git commit -m "feat(gamepack): add useGameOverlayOpacity hook"
```

---

## Task 6: `components/shared/QualityPill.tsx`

**Files:**
- Create: `web/src/components/shared/QualityPill.tsx`

Small presentational component. No tests — it is a dumb colour-coded pill. The existing quality logic lives in `useQualityMonitor`, which already returns a `goodPercent`.

- [ ] **Step 1: Create the component**

Create `web/src/components/shared/QualityPill.tsx`:

```tsx
import type { FC } from 'react';

export interface QualityPillProps {
  percent: number | null;     // null = not yet measured
  label?: string;
  compact?: boolean;
}

function colour(pct: number | null): string {
  if (pct == null) return 'rgba(160,170,190,0.4)';
  if (pct >= 75) return '#3fb950';
  if (pct >= 50) return '#f0a93e';
  return '#f85149';
}

export const QualityPill: FC<QualityPillProps> = ({ percent, label = 'Signal', compact }) => {
  const c = colour(percent);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
        padding: compact ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${c}`,
        color: c,
        fontSize: compact ? 11 : 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: c,
          boxShadow: `0 0 6px ${c}`,
        }}
      />
      <span>{label}</span>
      <span style={{ fontFamily: 'ui-monospace, monospace' }}>
        {percent == null ? '—' : `${percent}%`}
      </span>
    </span>
  );
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/components/shared/QualityPill.tsx
git commit -m "feat(gamepack): add shared QualityPill component"
```

---

## Task 7: TrainingView additive `useEffect` — localStorage mirror

**Files:**
- Modify: `web/src/components/views/TrainingView.tsx`

**CRITICAL INVARIANT:** This is the *only* change to TrainingView in M1. Do not refactor the existing OO compute, do not touch `K_VALUES`/`W_VALUES` (they remain in TrainingView), do not change any existing behaviour. Add one `useEffect` that calls `nfbSettingsStore.write(...)` whenever the user edits the settings panel.

- [ ] **Step 1: Locate the TrainingView state hooks**

Open `web/src/components/views/TrainingView.tsx` and confirm the following state variables exist (they do, per the spec exploration):

- `indicators` — `EegIndicator[]` holding the 5 EEG rows
- `difficultyLevel`
- `persistenceLevel`

If any of them has been renamed, STOP and tell the human rather than guessing.

- [ ] **Step 2: Add the import**

Near the other `services` imports at the top of the file (search for `from '../../services/'`), add:

```ts
import {
  nfbSettingsStore,
  type NfbSettings,
  type NfbIndicatorSetting,
} from '../../services/nfbSettingsStore';
```

- [ ] **Step 3: Add the mirroring effect**

Find the block where `enabledIndicators` is computed (spec notes line ≈ 1630). Immediately after that line, add:

```tsx
// ── GamePack M1: mirror current NFB settings into nfbSettingsStore
// so the Games tab can consume them. Additive only — does not touch
// TrainingView's OO compute path, postMessage visual mask, or audio feedback.
useEffect(() => {
  const settings: NfbSettings = {
    indicators: indicators.map<NfbIndicatorSetting>((ind) => ({
      id: `eeg${ind.id}`,
      enabled: ind.enabled,
      direction: ind.direction,
      threshold: ind.threshold,
      metricKey: ind.formula || `eeg${ind.id}`,
    })),
    difficultyLevel: difficultyLevel as 1 | 2 | 3 | 4 | 5,
    persistenceLevel: persistenceLevel as 1 | 2 | 3 | 4 | 5,
    qualitySensitivity: 3,
  };
  nfbSettingsStore.write(settings);
}, [indicators, difficultyLevel, persistenceLevel]);
```

- [ ] **Step 4: Run the build to verify no type errors**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build 2>&1 | tail -20
```

Expected: build succeeds. If TypeScript complains about the `as` casts, widen the type annotation in the settings object — but do not change the surrounding state types.

- [ ] **Step 5: Manual smoke check (local dev server)**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run dev
```

Open http://localhost:5173, go to the Training tab, change the difficulty slider, open DevTools → Application → Local Storage, and verify a key `soramynd.nfb.settings.v1` appears with the new value. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/components/views/TrainingView.tsx
git commit -m "feat(gamepack): mirror NFB settings from TrainingView into localStorage"
```

---

## Task 8: `services/gameSessionLog.ts` — IndexedDB pending queue (TDD)

**Files:**
- Create: `web/src/services/gameSessionLog.ts`
- Create: `web/src/services/gameSessionLog.test.ts`

This runs *before* `gameSessionApi` because the upload service depends on the queue for retry.

Schema: one IndexedDB database `soramynd-game` version 1 with one object store `pendingSessions` keyed by `sessionId`. If IndexedDB cannot be opened, fall back to a single-record localStorage slot.

- [ ] **Step 1: Write the failing test**

Create `web/src/services/gameSessionLog.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { gameSessionLog } from './gameSessionLog';
import type { SessionReport } from '../game/SessionConfig';

function fakeReport(id: string): SessionReport {
  return {
    sessionId: id,
    gameId: 'plane',
    gameMode: 'auto',
    themeId: 'papercut',
    startedAt: 0,
    endedAt: 1000,
    plannedDurationSec: 300,
    actualDurationSec: 300,
    runs: [],
    validRunsCount: 0,
    avgOO: 0,
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
```

- [ ] **Step 2: Run the failing test**

```bash
~/.bun/bin/bun run test -- gameSessionLog
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the store**

Create `web/src/services/gameSessionLog.ts`:

```ts
import type { SessionReport } from '../game/SessionConfig';

const DB_NAME = 'soramynd-game';
const DB_VERSION = 1;
const STORE = 'pendingSessions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const gameSessionLog = {
  async enqueue(report: SessionReport): Promise<void> {
    await run('readwrite', (s) => s.put(report));
  },
  async dequeue(sessionId: string): Promise<void> {
    await run('readwrite', (s) => s.delete(sessionId));
  },
  async list(): Promise<SessionReport[]> {
    return run<SessionReport[]>('readonly', (s) => s.getAll() as IDBRequest<SessionReport[]>);
  },
  async clearAll(): Promise<void> {
    await run('readwrite', (s) => s.clear());
  },
};
```

- [ ] **Step 4: Run the test**

```bash
~/.bun/bin/bun run test -- gameSessionLog
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/services/gameSessionLog.ts web/src/services/gameSessionLog.test.ts
git commit -m "feat(gamepack): add IndexedDB pending-sessions queue"
```

---

## Task 9: `services/gameSessionApi.ts` — upload client

**Files:**
- Create: `web/src/services/gameSessionApi.ts`

Three-endpoint client, modelled on the existing `sgimacog-web/src/services/sessionApi.ts` pattern (get session info from URL, upload CSV, send result). M1 uses only upload/result — session token fetch is out of scope (sessions are provisioned outside this feature for now; we use a synthetic sessionId for standalone testing).

**Important:** the v1 upload path goes through the artisebio-api endpoints already used in production. Do not invent new endpoints. If the backend URL is not configured, the service falls back to writing the report to the local queue only.

- [ ] **Step 1: Create the upload service**

Create `web/src/services/gameSessionApi.ts`:

```ts
import type { SessionReport } from '../game/SessionConfig';
import { gameSessionLog } from './gameSessionLog';

const API_BASE = import.meta.env.VITE_ARTISEBIO_API ?? 'https://artisebio-api.sigmacog.xyz';

export interface UploadArgs {
  sessionId: string;
  sessionToken: string;    // JWT provided by the join flow; '' if standalone
  report: SessionReport;
  reportHtml: string;
}

export interface UploadResult {
  ok: boolean;
  error?: string;
}

async function uploadCsv(sessionId: string, sessionToken: string, csv: string): Promise<boolean> {
  if (!sessionToken) return true;
  const form = new FormData();
  form.append('session_token', sessionToken);
  form.append('file', new Blob([csv], { type: 'text/csv' }), `${sessionId}.csv`);
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/upload-csv`, {
    method: 'POST',
    body: form,
  });
  return res.ok;
}

async function putResult(
  sessionId: string,
  sessionToken: string,
  report: SessionReport,
  reportHtml: string,
): Promise<boolean> {
  if (!sessionToken) return true;
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/result`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_token: sessionToken,
      results: report,
      report_html: reportHtml,
    }),
  });
  return res.ok;
}

function reportToCsv(report: SessionReport): string {
  // Run-by-run table; raw ooSeries omitted to stay under the 50 MB limit.
  const header = ['runIndex', 'startedAt', 'durationMs', 'qualityPercent', 'isValid'].join(',');
  const rows = report.runs.map((r) =>
    [r.runIndex, r.startedAt, r.durationMs, r.qualityPercent, r.isValid].join(','),
  );
  return [header, ...rows].join('\n');
}

export const gameSessionApi = {
  async upload(args: UploadArgs): Promise<UploadResult> {
    const { sessionId, sessionToken, report, reportHtml } = args;
    try {
      const csvOk = await uploadCsv(sessionId, sessionToken, reportToCsv(report));
      if (!csvOk) throw new Error('CSV upload failed');
      const resultOk = await putResult(sessionId, sessionToken, report, reportHtml);
      if (!resultOk) throw new Error('result PUT failed');
      await gameSessionLog.dequeue(sessionId);
      return { ok: true };
    } catch (err) {
      await gameSessionLog.enqueue(report);
      return { ok: false, error: (err as Error).message };
    }
  },

  async flushPending(sessionToken: string): Promise<number> {
    const pending = await gameSessionLog.list();
    let flushed = 0;
    for (const r of pending) {
      const res = await this.upload({
        sessionId: r.sessionId,
        sessionToken,
        report: r,
        reportHtml: '',
      });
      if (res.ok) flushed++;
    }
    return flushed;
  },
};
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/services/gameSessionApi.ts
git commit -m "feat(gamepack): add gameSessionApi upload client"
```

---

## Task 10: Vite multi-entry + subject-window HTML

**Files:**
- Create: `web/nfb-game.html`
- Modify: `web/vite.config.ts`

Two HTML entries: `index.html` (main app) and `nfb-game.html` (subject window). Vite serves both during `dev` and emits both during `build`.

> **IMPORTANT — do not put this in `public/`:** Vite multi-entry HTML must live **next to** `index.html` at the project root. The `public/` directory is copied verbatim into the build with no Vite injection, so any HTML placed there would ship broken. The path is `web/nfb-game.html`, not `web/public/nfb-game.html`.

- [ ] **Step 1: Create the subject entry HTML**

Create `web/nfb-game.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <title>SoraMynd NFB Game</title>
    <style>
      html, body, #subject-root {
        margin: 0;
        padding: 0;
        height: 100%;
        width: 100%;
        background: #000;
        overflow: hidden;
        color: #e4ecfa;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      body { cursor: none; }
    </style>
  </head>
  <body>
    <div id="subject-root"></div>
    <script type="module" src="/src/gameWindow.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Update `vite.config.ts`**

Replace `web/vite.config.ts` with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'
import { resolve } from 'path'

const APP_VERSION = '0.8.0-alpha'

export default defineConfig({
  plugins: [
    react(),
    obfuscatorPlugin({
      include: ['src/**/*.js', 'src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        /node_modules/,
        /src\/pkg\/.*\.js/,
        /src\/services\/wasm\.ts/,
        /src\/components\/layout\/Header\.tsx/,
        /src\/game\/subject\//,
        /src\/game\/games\//,
        /src\/gameWindow\.tsx/,
      ],
      apply: 'build',
      debugger: true,
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        numbersToExpressions: true,
        simplify: true,
        stringArrayShuffle: true,
        splitStrings: false,
        stringArrayThreshold: 0.8,
        unicodeEscapeSequence: false,
        identifierNamesGenerator: 'hexadecimal'
      }
    })
  ],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        nfbGame: resolve(__dirname, 'nfb-game.html'),
      },
    },
  },
})
```

**Why the subject window is obfuscator-excluded:** Pixi.js internals contain many identifiers that the obfuscator's aggressive string-array rewriting can corrupt, and the subject window loads no sensitive code we need to protect — it is a pure renderer. Keeping it unobfuscated saves build time and eliminates a class of runtime bugs.

- [ ] **Step 3: Verify dev server serves both entries**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run dev
```

Open two tabs: http://localhost:5173/ (main) and http://localhost:5173/nfb-game.html. The second should return a blank dark page (no script yet — that is next task). No 404. Stop the server.

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/nfb-game.html web/vite.config.ts
git commit -m "feat(gamepack): add nfb-game.html second Vite entry"
```

---

## Task 11: `gameWindow.tsx` + `SubjectWindowRoot.tsx` shell

**Files:**
- Create: `web/src/gameWindow.tsx`
- Create: `web/src/game/subject/SubjectWindowRoot.tsx`

Minimal React root that mounts the `SubjectWindowRoot` component and wires up channel listeners. No Pixi yet — that comes in Task 13.

- [ ] **Step 1: Create `gameWindow.tsx`**

Create `web/src/gameWindow.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SubjectWindowRoot } from './game/subject/SubjectWindowRoot';

const container = document.getElementById('subject-root');
if (!container) throw new Error('subject-root element missing');

createRoot(container).render(
  <StrictMode>
    <SubjectWindowRoot />
  </StrictMode>,
);
```

- [ ] **Step 2: Create `SubjectWindowRoot.tsx`**

Create `web/src/game/subject/SubjectWindowRoot.tsx`:

```tsx
import { useEffect, useRef, useState, type FC } from 'react';
import {
  createGameChannel,
  GAME_PROTOCOL_VERSION,
  type GameChannelMessage,
  type GameChannel,
} from '../../services/gameChannel';

type ConnectionState = 'connecting' | 'ready' | 'closed';

export const SubjectWindowRoot: FC = () => {
  const channelRef = useRef<GameChannel | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [lastMessage, setLastMessage] = useState<string>('waiting for main window…');

  useEffect(() => {
    const ch = createGameChannel();
    channelRef.current = ch;

    const unsub = ch.subscribe((msg: GameChannelMessage) => {
      setLastMessage(msg.kind);
      if (msg.kind === 'hello') {
        setState('ready');
      }
    });

    ch.post({ kind: 'subjectReady', protocolVersion: GAME_PROTOCOL_VERSION });

    // 2s heartbeat
    const hbId = window.setInterval(() => {
      ch.post({ kind: 'heartbeatSubject', t: performance.now() });
    }, 2000);

    // Tell main we are closing
    const onUnload = () => {
      ch.post({ kind: 'subjectClosing' });
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.clearInterval(hbId);
      window.removeEventListener('beforeunload', onUnload);
      unsub();
      ch.close();
      channelRef.current = null;
      setState('closed');
    };
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        letterSpacing: '0.08em',
        color: 'rgba(230,240,255,0.35)',
      }}
    >
      <div>
        SoraMynd NFB Game — {state} · {lastMessage}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Sanity check dev server**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run dev
```

Open http://localhost:5173/nfb-game.html. You should see "SoraMynd NFB Game — connecting · waiting for main window…". Stop the server.

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/gameWindow.tsx web/src/game/subject/SubjectWindowRoot.tsx
git commit -m "feat(gamepack): subject window React shell with channel wiring"
```

---

## Task 12: `game/subject/pixiBootstrap.ts`

**Files:**
- Create: `web/src/game/subject/pixiBootstrap.ts`

Thin wrapper around Pixi v8 `Application`. Isolates the Pixi API so Game classes never instantiate `Application` directly. Follows the spec's module-boundary rule #6.

- [ ] **Step 1: Create the module**

Create `web/src/game/subject/pixiBootstrap.ts`:

```ts
import { Application, Container } from 'pixi.js';

export interface PixiHost {
  app: Application;
  stage: Container;
  dispose: () => Promise<void>;
}

export async function createPixiHost(container: HTMLDivElement): Promise<PixiHost> {
  const app = new Application();
  await app.init({
    resizeTo: container,
    background: '#000000',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  container.appendChild(app.canvas);

  const stage = new Container();
  app.stage.addChild(stage);

  return {
    app,
    stage,
    async dispose() {
      try {
        stage.removeFromParent();
        stage.destroy({ children: true });
      } catch {}
      try {
        app.destroy(true, { children: true, texture: true, textureSource: true });
      } catch {}
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build 2>&1 | tail -10
```

Expected: build succeeds. If Pixi v8 type names differ, adjust the imports — but keep the public API (`PixiHost`, `createPixiHost`) intact.

- [ ] **Step 3: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/subject/pixiBootstrap.ts
git commit -m "feat(gamepack): add pixiBootstrap wrapper"
```

---

## Task 13: `game/control/GameSessionController.ts` — state machine (TDD)

**Files:**
- Create: `web/src/game/control/GameSessionController.ts`
- Create: `web/src/game/control/GameSessionController.test.ts`

Pure TypeScript (no React, no Pixi). Takes a channel, a clock, and config; exposes `start`, `pause`, `resume`, `abort`, and event callbacks. State transitions per spec §6 rewritten for the main window.

**Rationale for pure class:** the controller's state is rich (timer, pause ledger, heartbeat watchdog, run queue) and benefits from being testable without React. A thin React wrapper in `GameControlView` subscribes to its `onChange` events and re-renders.

- [ ] **Step 1: Write the failing test**

Create `web/src/game/control/GameSessionController.test.ts`:

```ts
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
    return () => this.listeners.delete(l);
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

  it('transitions CONNECTING → PREVIEW after subjectReady', () => {
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

  it('PREVIEW → RUN ACTIVE on start, broadcasts runStart', () => {
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
```

- [ ] **Step 2: Run the failing test**

```bash
~/.bun/bin/bun run test -- GameSessionController
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the controller**

Create `web/src/game/control/GameSessionController.ts`:

```ts
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
    return () => this.listeners.delete(l);
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
```

- [ ] **Step 4: Run the test**

```bash
~/.bun/bin/bun run test -- GameSessionController
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/control/GameSessionController.ts web/src/game/control/GameSessionController.test.ts
git commit -m "feat(gamepack): GameSessionController state machine"
```

---

## Task 14: Sidebar + App routing entries

**Files:**
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add the `games` TabType to Sidebar**

In `web/src/components/layout/Sidebar.tsx`, change the `TabType` union to:

```ts
export type TabType = 'home' | 'impedance' | 'signal' | 'fft' | 'record' | 'training' | 'games';
```

Add a `GamesIcon` component near the existing icons:

```tsx
const GamesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="12" rx="2"/>
    <path d="M8 12h3M9.5 10.5v3"/>
    <circle cx="15.5" cy="11" r="0.8" fill="currentColor"/>
    <circle cx="17" cy="13" r="0.8" fill="currentColor"/>
  </svg>
);
```

Add one row to the `tabs` array after the `training` entry:

```ts
{ id: 'games',     labelKey: 'tabGames',     icon: <GamesIcon />,     requiresConnect: true  },
```

- [ ] **Step 2: Add the `tabGames` i18n label**

Open `web/src/i18n.ts` and add to both `zh` and `en` dictionaries:

```ts
  tabGames: { zh: '遊戲訓練', en: 'Games' },
```

If the file's dictionary shape differs, match it exactly — do not restructure.

- [ ] **Step 3: Add the route in `App.tsx`**

Open `web/src/App.tsx`. Find where `TrainingView` is rendered inside the tab switcher and add a sibling case:

```tsx
) : activeTab === 'games' ? (
  <GameControlView
    lang={lang}
    bandPower={bandPower}
    isConnected={isConnected}
  />
```

Add the import at the top of the file:

```ts
import { GameControlView } from './components/views/GameControlView';
```

If `bandPower` is not already computed in `App.tsx`, add a call to `useBandPower` above the JSX — but only if it is genuinely missing. (Training tab does its own thing; check before adding a duplicate.)

- [ ] **Step 4: Verify build**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build 2>&1 | tail -20
```

Expected: build fails on missing `GameControlView` import — that is created in Task 15. If the only error is "GameControlView not found", proceed. Any other error must be fixed.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/components/layout/Sidebar.tsx web/src/App.tsx web/src/i18n.ts
git commit -m "feat(gamepack): add Games sidebar entry and route"
```

---

## Task 15: `GameControlView.tsx` — top-level therapist view

**Files:**
- Create: `web/src/components/views/GameControlView.tsx`

Top-level view that holds the `GameSessionController`, wires up `useGameOverlayOpacity`, and switches between wizard steps and the active HUD. For M1 this is a single file with inline sub-views — we can split later if it grows past ~400 lines.

- [ ] **Step 1: Create the view**

Create `web/src/components/views/GameControlView.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import type { BandPowerMatrix } from '../../hooks/useBandPower';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';
import { useGameOverlayOpacity } from '../../hooks/useGameOverlayOpacity';
import { createGameChannel, type GameChannel } from '../../services/gameChannel';
import { GameSessionController, type ControllerState } from '../../game/control/GameSessionController';
import type { SessionConfig, SessionDurationSec } from '../../game/SessionConfig';
import { SelectGameStep } from '../../game/control/sessionWizard/SelectGameStep';
import { SelectDurationStep } from '../../game/control/sessionWizard/SelectDurationStep';
import { OpenSubjectWindowButton } from '../../game/control/OpenSubjectWindowButton';
import { SubjectWindowStatus } from '../../game/control/SubjectWindowStatus';
import { TherapistHud } from '../../game/control/TherapistHud';
import { SessionReportView } from '../../game/control/sessionReport';

export interface GameControlViewProps {
  lang: Lang;
  bandPower: BandPowerMatrix | null;
  isConnected: boolean;
}

function bandPowerToMetricMap(bp: BandPowerMatrix | null): Record<string, number> | null {
  if (!bp) return null;
  // Channel order: Fp1 Fp2 T7 T8 O1 O2 Fz Pz
  // Band order:    Delta Theta Alpha SMR Beta Hi-Beta Gamma
  const Fz = 6;
  const Theta = 1;
  const Beta = 4;
  return {
    Fz_Beta: bp[Fz]?.[Beta] ?? 0,
    Fz_Theta: bp[Fz]?.[Theta] ?? 0,
  };
}

export const GameControlView: FC<GameControlViewProps> = ({ lang, bandPower, isConnected }) => {
  const [step, setStep] = useState<'game' | 'duration' | 'active' | 'report'>('game');
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [controllerState, setControllerState] = useState<ControllerState>('idle');
  const controllerRef = useRef<GameSessionController | null>(null);
  const channelRef = useRef<GameChannel | null>(null);
  const subjectWindowRef = useRef<Window | null>(null);

  const metrics = useMemo(() => bandPowerToMetricMap(bandPower), [bandPower]);
  const { oo, ta, isActive } = useGameOverlayOpacity(metrics);

  // Create channel + controller once
  useEffect(() => {
    const ch = createGameChannel();
    const ctrl = new GameSessionController({ channel: ch });
    channelRef.current = ch;
    controllerRef.current = ctrl;
    const unsub = ctrl.onChange(() => setControllerState(ctrl.state));
    return () => {
      unsub();
      ctrl.dispose();
      ch.close();
      channelRef.current = null;
      controllerRef.current = null;
    };
  }, []);

  // Broadcast OO every tick while RUN ACTIVE
  useEffect(() => {
    if (controllerState !== 'runActive') return;
    const ch = channelRef.current;
    if (!ch) return;
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      ch.post({ kind: 'oo', t: performance.now() - startedAt, oo, ta });
    }, 100);
    return () => window.clearInterval(id);
  }, [controllerState, oo, ta]);

  // Broadcast main heartbeat
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const id = window.setInterval(() => {
      ch.post({ kind: 'heartbeatMain', t: performance.now() });
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const onOpenSubject = () => {
    const w = window.open('/nfb-game.html', 'soramynd-subject', 'popup,width=1280,height=800');
    if (!w) {
      alert(T(lang, 'gameSubjectPopupBlocked'));
      return;
    }
    subjectWindowRef.current = w;
    controllerRef.current?.openSubjectWindow();
  };

  const onStart = (duration: SessionDurationSec) => {
    if (!sessionConfig || !controllerRef.current) return;
    const cfgWithDur: SessionConfig = { ...sessionConfig, plannedDurationSec: duration };
    setSessionConfig(cfgWithDur);
    controllerRef.current.configure(cfgWithDur);
    controllerRef.current.start();
    setStep('active');
  };

  if (!isConnected) {
    return (
      <div style={{ padding: 32, color: 'rgba(200,215,235,0.7)' }}>
        {T(lang, 'gameConnectRequired')}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: '#e4ecfa' }}>
      <h2 style={{ margin: '0 0 20px' }}>{T(lang, 'tabGames')}</h2>

      {step === 'game' && (
        <SelectGameStep
          lang={lang}
          onSelect={(cfg) => {
            setSessionConfig(cfg);
            setStep('duration');
          }}
        />
      )}

      {step === 'duration' && sessionConfig && (
        <SelectDurationStep
          lang={lang}
          isActive={isActive}
          config={sessionConfig}
          controllerState={controllerState}
          openSubjectButton={<OpenSubjectWindowButton lang={lang} state={controllerState} onOpen={onOpenSubject} />}
          statusPill={<SubjectWindowStatus lang={lang} state={controllerState} />}
          onStart={onStart}
          onBack={() => setStep('game')}
        />
      )}

      {step === 'active' && controllerRef.current && (
        <TherapistHud
          lang={lang}
          controller={controllerRef.current}
          controllerState={controllerState}
          oo={oo}
          ta={ta}
          onReportComplete={() => setStep('report')}
        />
      )}

      {step === 'report' && controllerRef.current && (
        <SessionReportView
          lang={lang}
          report={controllerRef.current.buildReport()}
          onDone={() => setStep('game')}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Add i18n keys**

In `web/src/i18n.ts`, add:

```ts
  gameConnectRequired: { zh: '請先連接裝置才能進入遊戲訓練', en: 'Please connect a device before starting game training' },
  gameSubjectPopupBlocked: { zh: '瀏覽器阻擋了彈出視窗，請允許後再試', en: 'Pop-ups are blocked. Please allow them and try again' },
```

- [ ] **Step 3: Verify build fails only on wizard + HUD imports**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build 2>&1 | tail -20
```

Expected: errors about `SelectGameStep`, `SelectDurationStep`, `OpenSubjectWindowButton`, `SubjectWindowStatus`, `TherapistHud`, `SessionReportView` — created in Tasks 16–20. No other errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/components/views/GameControlView.tsx web/src/i18n.ts
git commit -m "feat(gamepack): GameControlView top-level shell"
```

---

## Task 16: Wizard step components

**Files:**
- Create: `web/src/game/control/sessionWizard/SelectGameStep.tsx`
- Create: `web/src/game/control/sessionWizard/SelectDurationStep.tsx`
- Create: `web/src/game/control/sessionWizard/NfbSettingsPanel.tsx`

M1 Plane-only. The game picker still renders three cards — Golf/Maze cards are disabled placeholders so the layout is already final when M2/M3 plug in. `NfbSettingsPanel` is a read-mostly panel: the full editor is the existing TrainingView. M1 only displays the active settings with an "Edit in Training tab" button.

- [ ] **Step 1: Create `NfbSettingsPanel.tsx`**

Create `web/src/game/control/sessionWizard/NfbSettingsPanel.tsx`:

```tsx
import { useEffect, useState, type FC } from 'react';
import { nfbSettingsStore, type NfbSettings } from '../../../services/nfbSettingsStore';
import type { Lang } from '../../../i18n';
import { T } from '../../../i18n';

export const NfbSettingsPanel: FC<{ lang: Lang }> = ({ lang }) => {
  const [s, setS] = useState<NfbSettings>(() => nfbSettingsStore.read());
  useEffect(() => nfbSettingsStore.subscribe(setS), []);

  const enabled = s.indicators.filter((i) => i.enabled);

  return (
    <div style={{
      padding: 14, borderRadius: 8, background: 'rgba(88,166,255,0.04)',
      border: '1px solid rgba(88,166,255,0.15)', fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{T(lang, 'gameNfbPanelTitle')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>{T(lang, 'gameNfbDifficulty')}: Lv.{s.difficultyLevel}</div>
        <div>{T(lang, 'gameNfbPersistence')}: Lv.{s.persistenceLevel}</div>
        <div style={{ gridColumn: '1 / -1' }}>
          {T(lang, 'gameNfbEnabled')}: {enabled.length > 0
            ? enabled.map((i) => i.metricKey).join(', ')
            : T(lang, 'gameNfbNoneEnabled')}
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(200,215,235,0.5)' }}>
        {T(lang, 'gameNfbEditHint')}
      </div>
    </div>
  );
};
```

Add i18n keys in `web/src/i18n.ts`:

```ts
  gameNfbPanelTitle: { zh: '神經回饋設定（目前）', en: 'Current NFB Settings' },
  gameNfbDifficulty: { zh: '活躍度', en: 'Difficulty' },
  gameNfbPersistence: { zh: '持續度', en: 'Persistence' },
  gameNfbEnabled: { zh: '啟用指標', en: 'Enabled Indicators' },
  gameNfbNoneEnabled: { zh: '（無）', en: '(none)' },
  gameNfbEditHint: { zh: '若需修改，請到 Training Tab 調整，設定會自動同步。', en: 'To change settings, edit them in the Training tab — they sync automatically.' },
```

- [ ] **Step 2: Create `SelectGameStep.tsx`**

Create `web/src/game/control/sessionWizard/SelectGameStep.tsx`:

```tsx
import { useState, type FC } from 'react';
import type { Lang } from '../../../i18n';
import { T } from '../../../i18n';
import type { SessionConfig } from '../../SessionConfig';
import { NfbSettingsPanel } from './NfbSettingsPanel';

export interface SelectGameStepProps {
  lang: Lang;
  onSelect: (cfg: SessionConfig) => void;
}

interface CardDef {
  id: 'plane' | 'golf' | 'maze';
  titleKey: string;
  taglineKey: string;
  enabled: boolean;
  modes: Array<{ id: string; labelKey: string }>;
}

const CARDS: CardDef[] = [
  {
    id: 'plane',
    titleKey: 'gamePlaneTitle',
    taglineKey: 'gamePlaneTagline',
    enabled: true,
    modes: [{ id: 'auto', labelKey: 'gameModeStandard' }],
  },
  {
    id: 'golf',
    titleKey: 'gameGolfTitle',
    taglineKey: 'gameGolfTagline',
    enabled: false,
    modes: [],
  },
  {
    id: 'maze',
    titleKey: 'gameMazeTitle',
    taglineKey: 'gameMazeTagline',
    enabled: false,
    modes: [],
  },
];

export const SelectGameStep: FC<SelectGameStepProps> = ({ lang, onSelect }) => {
  const [picked, setPicked] = useState<CardDef['id'] | null>(null);
  const [modeId, setModeId] = useState<string>('auto');

  const pickedCard = CARDS.find((c) => c.id === picked);

  return (
    <div>
      <div style={{ marginBottom: 12, color: 'rgba(200,215,235,0.75)' }}>
        {T(lang, 'gameStep1Desc')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
        {CARDS.map((c) => {
          const isPicked = picked === c.id;
          return (
            <button
              key={c.id}
              disabled={!c.enabled}
              onClick={() => {
                if (!c.enabled) return;
                setPicked(c.id);
                setModeId(c.modes[0]?.id ?? 'auto');
              }}
              style={{
                padding: 16,
                borderRadius: 10,
                border: `1px solid ${isPicked ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
                background: isPicked ? 'rgba(88,166,255,0.08)' : 'rgba(255,255,255,0.02)',
                color: c.enabled ? '#e4ecfa' : 'rgba(200,215,235,0.25)',
                cursor: c.enabled ? 'pointer' : 'not-allowed',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {T(lang, c.titleKey)}
                {!c.enabled && (
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8, color: 'rgba(200,215,235,0.4)' }}>
                    {T(lang, 'gameComingSoon')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.55)' }}>
                {T(lang, c.taglineKey)}
              </div>
            </button>
          );
        })}
      </div>

      {pickedCard && pickedCard.modes.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>{T(lang, 'gameSelectMode')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {pickedCard.modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setModeId(m.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: `1px solid ${modeId === m.id ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
                  background: modeId === m.id ? 'rgba(88,166,255,0.08)' : 'transparent',
                  color: '#e4ecfa',
                  cursor: 'pointer',
                }}
              >
                {T(lang, m.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <NfbSettingsPanel lang={lang} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          disabled={!pickedCard}
          onClick={() => {
            if (!pickedCard) return;
            onSelect({
              gameId: pickedCard.id,
              modeId,
              themeId: 'papercut',
              lang,
              plannedDurationSec: 300,
            });
          }}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            background: pickedCard ? '#58a6ff' : 'rgba(93,109,134,0.3)',
            color: '#0a0f1a',
            fontWeight: 600,
            cursor: pickedCard ? 'pointer' : 'not-allowed',
            border: 'none',
          }}
        >
          {T(lang, 'gameNext')}
        </button>
      </div>
    </div>
  );
};
```

Add i18n keys:

```ts
  gameStep1Desc: { zh: '選擇遊戲與模式', en: 'Choose a game and mode' },
  gamePlaneTitle: { zh: '飛行 PlaneFlight', en: 'PlaneFlight' },
  gamePlaneTagline: { zh: '持續專注訓練', en: 'Sustained focus training' },
  gameGolfTitle: { zh: '高爾夫 Golf', en: 'Golf' },
  gameGolfTagline: { zh: '爆發專注訓練（M2）', en: 'Burst focus (M2)' },
  gameMazeTitle: { zh: '迷宮 RabbitMaze', en: 'RabbitMaze' },
  gameMazeTagline: { zh: '放鬆訓練（M3）', en: 'Relaxation training (M3)' },
  gameSelectMode: { zh: '選擇模式', en: 'Mode' },
  gameModeStandard: { zh: '標準', en: 'Standard' },
  gameComingSoon: { zh: '即將推出', en: 'coming soon' },
  gameNext: { zh: '下一步', en: 'Next' },
```

- [ ] **Step 3: Create `SelectDurationStep.tsx`**

Create `web/src/game/control/sessionWizard/SelectDurationStep.tsx`:

```tsx
import { useState, type FC, type ReactNode } from 'react';
import type { Lang } from '../../../i18n';
import { T } from '../../../i18n';
import type { SessionConfig, SessionDurationSec } from '../../SessionConfig';
import type { ControllerState } from '../GameSessionController';

export interface SelectDurationStepProps {
  lang: Lang;
  isActive: boolean;
  config: SessionConfig;
  controllerState: ControllerState;
  openSubjectButton: ReactNode;
  statusPill: ReactNode;
  onStart: (duration: SessionDurationSec) => void;
  onBack: () => void;
}

const DURATIONS: SessionDurationSec[] = [300, 600, 900, 1200];

export const SelectDurationStep: FC<SelectDurationStepProps> = ({
  lang, isActive, controllerState, openSubjectButton, statusPill, onStart, onBack,
}) => {
  const [duration, setDuration] = useState<SessionDurationSec>(300);
  const canStart = isActive && controllerState === 'preview';
  const blockReason =
    !isActive ? T(lang, 'gameNoIndicatorsHint')
    : controllerState !== 'preview' ? T(lang, 'gameWaitingSubjectHint')
    : '';

  return (
    <div>
      <div style={{ marginBottom: 14, color: 'rgba(200,215,235,0.75)' }}>
        {T(lang, 'gameStep2Desc')}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: `1px solid ${duration === d ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
              background: duration === d ? 'rgba(88,166,255,0.08)' : 'transparent',
              color: '#e4ecfa',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {d / 60} min
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        {openSubjectButton}
        {statusPill}
      </div>

      {blockReason && (
        <div style={{ fontSize: 12, color: '#f0a93e', marginBottom: 10 }}>
          {blockReason}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <button
          onClick={onBack}
          style={{
            padding: '10px 18px', borderRadius: 6,
            background: 'transparent', border: '1px solid rgba(93,109,134,0.3)',
            color: '#e4ecfa', cursor: 'pointer',
          }}
        >
          {T(lang, 'gameBack')}
        </button>
        <button
          disabled={!canStart}
          onClick={() => onStart(duration)}
          style={{
            padding: '10px 24px', borderRadius: 6,
            background: canStart ? '#3fb950' : 'rgba(93,109,134,0.3)',
            color: '#0a0f1a', fontWeight: 700,
            cursor: canStart ? 'pointer' : 'not-allowed',
            border: 'none',
          }}
        >
          {T(lang, 'gameStart')}
        </button>
      </div>
    </div>
  );
};
```

Add i18n keys:

```ts
  gameStep2Desc: { zh: '選擇時長並開啟受測者視窗', en: 'Choose duration and open the subject window' },
  gameNoIndicatorsHint: { zh: '請先在 Training tab 啟用至少一個指標', en: 'Enable at least one indicator in the Training tab first' },
  gameWaitingSubjectHint: { zh: '等待受測者視窗連線中…', en: 'Waiting for subject window…' },
  gameBack: { zh: '返回', en: 'Back' },
  gameStart: { zh: '開始', en: 'Start' },
```

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/control/sessionWizard/ web/src/i18n.ts
git commit -m "feat(gamepack): session wizard steps and NFB panel"
```

---

## Task 17: Subject-window controls — `OpenSubjectWindowButton` + `SubjectWindowStatus`

**Files:**
- Create: `web/src/game/control/OpenSubjectWindowButton.tsx`
- Create: `web/src/game/control/SubjectWindowStatus.tsx`

- [ ] **Step 1: Create the open button**

Create `web/src/game/control/OpenSubjectWindowButton.tsx`:

```tsx
import type { FC } from 'react';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';
import type { ControllerState } from './GameSessionController';

export interface OpenSubjectWindowButtonProps {
  lang: Lang;
  state: ControllerState;
  onOpen: () => void;
}

export const OpenSubjectWindowButton: FC<OpenSubjectWindowButtonProps> = ({ lang, state, onOpen }) => {
  const open = state !== 'idle';
  return (
    <button
      onClick={onOpen}
      style={{
        padding: '10px 18px',
        borderRadius: 6,
        background: open ? 'rgba(88,166,255,0.08)' : '#58a6ff',
        border: `1px solid ${open ? 'rgba(88,166,255,0.4)' : 'transparent'}`,
        color: open ? '#8ecfff' : '#0a0f1a',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {open ? T(lang, 'gameReopenSubject') : T(lang, 'gameOpenSubject')}
    </button>
  );
};
```

- [ ] **Step 2: Create the status pill**

Create `web/src/game/control/SubjectWindowStatus.tsx`:

```tsx
import type { FC } from 'react';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';
import type { ControllerState } from './GameSessionController';

export interface SubjectWindowStatusProps {
  lang: Lang;
  state: ControllerState;
}

function display(state: ControllerState) {
  switch (state) {
    case 'idle':         return { c: 'rgba(200,215,235,0.4)', k: 'gameSubjectIdle' };
    case 'connecting':   return { c: '#f0a93e',               k: 'gameSubjectConnecting' };
    case 'preview':      return { c: '#3fb950',               k: 'gameSubjectReady' };
    case 'runActive':    return { c: '#58a6ff',               k: 'gameSubjectActive' };
    case 'runRest':      return { c: '#58a6ff',               k: 'gameSubjectRest' };
    case 'paused':       return { c: '#f0a93e',               k: 'gameSubjectPaused' };
    case 'subjectLost':  return { c: '#f85149',               k: 'gameSubjectLost' };
    case 'sessionReport':return { c: 'rgba(200,215,235,0.4)', k: 'gameSubjectDone' };
  }
}

export const SubjectWindowStatus: FC<SubjectWindowStatusProps> = ({ lang, state }) => {
  const { c, k } = display(state);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 10px', borderRadius: 999,
        border: `1px solid ${c}`, color: c,
        fontSize: 12, fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: c }} />
      {T(lang, k)}
    </span>
  );
};
```

Add i18n keys:

```ts
  gameOpenSubject: { zh: '開啟受測者視窗', en: 'Open subject window' },
  gameReopenSubject: { zh: '重新開啟', en: 'Reopen' },
  gameSubjectIdle: { zh: '受測者視窗未開啟', en: 'Subject window closed' },
  gameSubjectConnecting: { zh: '連線中…', en: 'Connecting…' },
  gameSubjectReady: { zh: '已連線', en: 'Connected' },
  gameSubjectActive: { zh: '進行中', en: 'Running' },
  gameSubjectRest: { zh: '休息', en: 'Rest' },
  gameSubjectPaused: { zh: '已暫停', en: 'Paused' },
  gameSubjectLost: { zh: '受測者視窗已中斷', en: 'Subject window lost' },
  gameSubjectDone: { zh: '結束', en: 'Finished' },
```

- [ ] **Step 3: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/control/OpenSubjectWindowButton.tsx web/src/game/control/SubjectWindowStatus.tsx web/src/i18n.ts
git commit -m "feat(gamepack): subject window open button + status pill"
```

---

## Task 18: `TherapistHud.tsx` + `sessionReport.tsx`

**Files:**
- Create: `web/src/game/control/TherapistHud.tsx`
- Create: `web/src/game/control/sessionReport.tsx`

- [ ] **Step 1: Create the therapist HUD**

Create `web/src/game/control/TherapistHud.tsx`:

```tsx
import { useEffect, type FC } from 'react';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';
import type { GameSessionController, ControllerState } from './GameSessionController';

export interface TherapistHudProps {
  lang: Lang;
  controller: GameSessionController;
  controllerState: ControllerState;
  oo: number;
  ta: number;
  onReportComplete: () => void;
}

export const TherapistHud: FC<TherapistHudProps> = ({
  lang, controller, controllerState, oo, ta, onReportComplete,
}) => {
  useEffect(() => {
    if (controllerState === 'sessionReport') onReportComplete();
  }, [controllerState, onReportComplete]);

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14, marginBottom: 20,
      }}>
        <Stat label={T(lang, 'gameHudOO')} value={`${Math.round(oo)}%`} />
        <Stat label={T(lang, 'gameHudTA')} value={`${Math.round(ta)}%`} />
        <Stat label={T(lang, 'gameHudRuns')} value={`${controller.runs.length}`} />
        <Stat label={T(lang, 'gameHudState')} value={controllerState} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {controllerState === 'runActive' && (
          <button onClick={() => controller.pause()} style={btnStyle('#f0a93e')}>
            {T(lang, 'gameHudPause')}
          </button>
        )}
        {controllerState === 'paused' && (
          <button onClick={() => controller.resume()} style={btnStyle('#3fb950')}>
            {T(lang, 'gameHudResume')}
          </button>
        )}
        {controllerState === 'runRest' && (
          <button onClick={() => controller.start()} style={btnStyle('#58a6ff')}>
            {T(lang, 'gameHudNextRun')}
          </button>
        )}
        <button onClick={() => controller.abort()} style={btnStyle('#f85149')}>
          {T(lang, 'gameHudAbort')}
        </button>
      </div>
    </div>
  );
};

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    padding: 14, borderRadius: 8,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(93,109,134,0.25)',
  }}>
    <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.5)' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#8ecfff', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>{value}</div>
  </div>
);

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 6,
    background: bg, color: '#0a0f1a', fontWeight: 600,
    border: 'none', cursor: 'pointer',
  };
}
```

Add i18n keys:

```ts
  gameHudOO: { zh: 'OO', en: 'OO' },
  gameHudTA: { zh: 'TA', en: 'TA' },
  gameHudRuns: { zh: '完成回合', en: 'Runs' },
  gameHudState: { zh: '狀態', en: 'State' },
  gameHudPause: { zh: '暫停', en: 'Pause' },
  gameHudResume: { zh: '繼續', en: 'Resume' },
  gameHudNextRun: { zh: '下一回合', en: 'Next run' },
  gameHudAbort: { zh: '結束 session', en: 'End session' },
```

- [ ] **Step 2: Create the session report view**

Create `web/src/game/control/sessionReport.tsx`:

```tsx
import { useEffect, useState, type FC } from 'react';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';
import type { SessionReport } from '../SessionConfig';
import { gameSessionApi } from '../../services/gameSessionApi';

export interface SessionReportViewProps {
  lang: Lang;
  report: SessionReport;
  onDone: () => void;
}

export const SessionReportView: FC<SessionReportViewProps> = ({ lang, report, onDone }) => {
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    setUploadState('uploading');
    gameSessionApi
      .upload({
        sessionId: report.sessionId,
        sessionToken: '', // M1: standalone, no token
        report,
        reportHtml: buildReportHtml(report),
      })
      .then((r) => {
        if (r.ok) setUploadState('ok');
        else { setUploadState('error'); setErr(r.error ?? ''); }
      });
  }, [report]);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{T(lang, 'gameReportTitle')}</h3>
      <div style={{
        padding: 16, borderRadius: 8,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(93,109,134,0.25)',
        marginBottom: 16,
      }}>
        <ReportRow label={T(lang, 'gameReportGame')} value={`${report.gameId} · ${report.gameMode}`} />
        <ReportRow label={T(lang, 'gameReportPlanned')} value={`${report.plannedDurationSec}s`} />
        <ReportRow label={T(lang, 'gameReportActual')} value={`${report.actualDurationSec}s`} />
        <ReportRow label={T(lang, 'gameReportRuns')} value={`${report.runs.length} (${report.validRunsCount} valid)`} />
        <ReportRow label={T(lang, 'gameReportAvgOO')} value={`${Math.round(report.avgOO)}%`} />
      </div>

      <div style={{ marginBottom: 16, fontSize: 12, color: 'rgba(200,215,235,0.6)' }}>
        {uploadState === 'uploading' && T(lang, 'gameReportUploading')}
        {uploadState === 'ok' && T(lang, 'gameReportUploaded')}
        {uploadState === 'error' && `${T(lang, 'gameReportUploadFailed')} ${err}`}
      </div>

      <button
        onClick={onDone}
        style={{
          padding: '10px 18px', borderRadius: 6,
          background: '#58a6ff', border: 'none', color: '#0a0f1a',
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        {T(lang, 'gameReportDone')}
      </button>
    </div>
  );
};

const ReportRow: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
    <span style={{ color: 'rgba(200,215,235,0.55)', fontSize: 12 }}>{label}</span>
    <span style={{ color: '#8ecfff', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{value}</span>
  </div>
);

function buildReportHtml(r: SessionReport): string {
  return `<!DOCTYPE html><html><body>
<h1>SoraMynd GamePack — Session Report</h1>
<ul>
<li>Game: ${r.gameId} (${r.gameMode})</li>
<li>Theme: ${r.themeId}</li>
<li>Planned: ${r.plannedDurationSec}s · Actual: ${r.actualDurationSec}s</li>
<li>Runs: ${r.runs.length} (valid ${r.validRunsCount})</li>
<li>Avg OO: ${r.avgOO.toFixed(1)}%</li>
</ul>
</body></html>`;
}
```

Add i18n keys:

```ts
  gameReportTitle: { zh: 'Session 報告', en: 'Session Report' },
  gameReportGame: { zh: '遊戲', en: 'Game' },
  gameReportPlanned: { zh: '預計時長', en: 'Planned' },
  gameReportActual: { zh: '實際時長', en: 'Actual' },
  gameReportRuns: { zh: '回合', en: 'Runs' },
  gameReportAvgOO: { zh: '平均 OO', en: 'Avg OO' },
  gameReportUploading: { zh: '上傳中…', en: 'Uploading…' },
  gameReportUploaded: { zh: '已上傳', en: 'Uploaded' },
  gameReportUploadFailed: { zh: '上傳失敗，已存入本地佇列：', en: 'Upload failed, queued locally:' },
  gameReportDone: { zh: '完成', en: 'Done' },
```

- [ ] **Step 3: Verify full build**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build 2>&1 | tail -20
```

Expected: build now succeeds. If Pixi imports in pixiBootstrap cause build errors, double-check that `pixi.js` is in dependencies (Task 0 Step 2).

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/control/TherapistHud.tsx web/src/game/control/sessionReport.tsx web/src/i18n.ts
git commit -m "feat(gamepack): therapist HUD + session report view"
```

---

## Task 19: Theme: papercut

**Files:**
- Create: `web/src/game/themes/tokens.ts`
- Create: `web/src/game/themes/papercut/palette.ts`
- Create: `web/src/game/themes/papercut/index.ts`

Data only, no logic. Sprite URLs are empty strings in M1 — PlaneGame uses Pixi `Graphics` primitives (procedural) for the M1 alpha, and sprites are swapped in during M4. Keeping the theme file structured this way lets M4 fill in URLs without code changes.

- [ ] **Step 1: Create `tokens.ts`**

Create `web/src/game/themes/tokens.ts`:

```ts
export type { Theme } from '../Game';
```

- [ ] **Step 2: Create papercut palette**

Create `web/src/game/themes/papercut/palette.ts`:

```ts
export const papercutPalette = {
  bgTop:    '#f6ead3',
  bgBottom: '#e3c48b',
  ground:   '#4c3a28',
  accent1:  '#d95a3b',
  accent2:  '#2a619e',
  accent3:  '#6ba644',
  text:     '#1a1208',
} as const;
```

- [ ] **Step 3: Create papercut theme data**

Create `web/src/game/themes/papercut/index.ts`:

```ts
import type { Theme } from '../../Game';
import { papercutPalette } from './palette';

export const papercutTheme: Theme = {
  id: 'papercut',
  name: { zh: '剪紙', en: 'Papercut' },
  previewUrl: '',
  palette: { ...papercutPalette },
  bgmUrl: '',
  sfx: {},
  sprites: {
    plane: { body: '', trail: '', cloud: [], bird: '' },
    golf:  { ball: '', club: '', terrain: [], flag: '' },
    maze:  { rabbit: [], carrot: '', wall: [], goal: '' },
  },
};
```

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/themes/
git commit -m "feat(gamepack): add papercut theme data"
```

---

## Task 20: `game/games/plane/terrain.ts` (TDD)

**Files:**
- Create: `web/src/game/games/plane/terrain.ts`
- Create: `web/src/game/games/plane/terrain.test.ts`

Pure procedural terrain generator. Given a seed and a length, outputs a height profile sampled every X pixels. Deterministic for the same seed.

- [ ] **Step 1: Write the failing test**

Create `web/src/game/games/plane/terrain.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateValley, samplePoint } from './terrain';

describe('generateValley', () => {
  it('is deterministic for the same seed', () => {
    const a = generateValley({ seed: 42, lengthPx: 4000, sampleEveryPx: 20 });
    const b = generateValley({ seed: 42, lengthPx: 4000, sampleEveryPx: 20 });
    expect(a).toEqual(b);
  });

  it('produces different output for different seeds', () => {
    const a = generateValley({ seed: 1, lengthPx: 4000, sampleEveryPx: 20 });
    const b = generateValley({ seed: 2, lengthPx: 4000, sampleEveryPx: 20 });
    expect(a).not.toEqual(b);
  });

  it('has the correct sample count', () => {
    const v = generateValley({ seed: 1, lengthPx: 4000, sampleEveryPx: 20 });
    expect(v.samples.length).toBe(4000 / 20 + 1);
  });

  it('stays within height bounds', () => {
    const v = generateValley({ seed: 1, lengthPx: 4000, sampleEveryPx: 20 });
    for (const s of v.samples) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('samplePoint', () => {
  it('interpolates between samples', () => {
    const v = generateValley({ seed: 1, lengthPx: 1000, sampleEveryPx: 100 });
    // samples[0] and samples[1] at x=0 and x=100
    const mid = samplePoint(v, 50);
    const expected = (v.samples[0]! + v.samples[1]!) / 2;
    expect(mid).toBeCloseTo(expected, 5);
  });
  it('clamps to 0 below the start', () => {
    const v = generateValley({ seed: 1, lengthPx: 1000, sampleEveryPx: 100 });
    expect(samplePoint(v, -100)).toBe(v.samples[0]);
  });
  it('clamps to the last sample beyond the end', () => {
    const v = generateValley({ seed: 1, lengthPx: 1000, sampleEveryPx: 100 });
    expect(samplePoint(v, 99999)).toBe(v.samples[v.samples.length - 1]);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
~/.bun/bin/bun run test -- terrain
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the terrain module**

Create `web/src/game/games/plane/terrain.ts`:

```ts
export interface ValleyGenArgs {
  seed: number;
  lengthPx: number;
  sampleEveryPx: number;
}

export interface Valley {
  lengthPx: number;
  sampleEveryPx: number;
  samples: number[];   // 0..1, 0 = bottom of the visible area, 1 = top
}

// Mulberry32: small deterministic PRNG
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateValley({ seed, lengthPx, sampleEveryPx }: ValleyGenArgs): Valley {
  const next = rng(seed);
  const n = Math.floor(lengthPx / sampleEveryPx) + 1;
  const samples: number[] = [];
  let h = 0.5;
  for (let i = 0; i < n; i++) {
    // Drifting midline plus noise; keeps height in [0.15, 0.85]
    h += (next() - 0.5) * 0.08;
    if (h < 0.15) h = 0.15 + (0.15 - h);
    if (h > 0.85) h = 0.85 - (h - 0.85);
    samples.push(h);
  }
  return { lengthPx, sampleEveryPx, samples };
}

export function samplePoint(valley: Valley, x: number): number {
  if (x <= 0) return valley.samples[0]!;
  const maxX = (valley.samples.length - 1) * valley.sampleEveryPx;
  if (x >= maxX) return valley.samples[valley.samples.length - 1]!;
  const i = Math.floor(x / valley.sampleEveryPx);
  const frac = (x - i * valley.sampleEveryPx) / valley.sampleEveryPx;
  return valley.samples[i]! * (1 - frac) + valley.samples[i + 1]! * frac;
}
```

- [ ] **Step 4: Run the test**

```bash
~/.bun/bin/bun run test -- terrain
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/games/plane/terrain.ts web/src/game/games/plane/terrain.test.ts
git commit -m "feat(gamepack): procedural valley terrain generator"
```

---

## Task 21: `PlaneGame.ts` + manifest + scene

**Files:**
- Create: `web/src/game/games/plane/PlaneGame.ts`
- Create: `web/src/game/games/plane/scene.ts`
- Create: `web/src/game/games/plane/manifest.ts`

M1 Plane uses primitives only (no sprite textures). This is deliberate — gameplay works, visuals polish comes in M4.

- [ ] **Step 1: Create the scene builder**

Create `web/src/game/games/plane/scene.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import type { Valley } from './terrain';
import { samplePoint } from './terrain';

export interface PlaneScene {
  root: Container;
  plane: Graphics;
  terrainGfx: Graphics;
  trail: Graphics;
  updateTerrain(scrollX: number, worldWidth: number, worldHeight: number): void;
  updatePlane(y: number): void;
  updateTrail(oo: number): void;
  destroy(): void;
}

export function buildPlaneScene(valley: Valley, bg: string, accent: string): PlaneScene {
  const root = new Container();

  const bgGfx = new Graphics();
  root.addChild(bgGfx);

  const terrainGfx = new Graphics();
  root.addChild(terrainGfx);

  const trail = new Graphics();
  root.addChild(trail);

  const plane = new Graphics();
  plane.roundRect(-18, -8, 36, 16, 4).fill(accent);
  plane.poly([18, 0, 30, -6, 30, 6]).fill(accent);
  root.addChild(plane);

  function updateTerrain(scrollX: number, worldWidth: number, worldHeight: number) {
    bgGfx.clear();
    bgGfx.rect(0, 0, worldWidth, worldHeight).fill(bg);

    terrainGfx.clear();
    terrainGfx.moveTo(0, worldHeight);
    const step = 20;
    for (let x = 0; x <= worldWidth; x += step) {
      const wx = scrollX + x;
      const h = samplePoint(valley, wx);
      terrainGfx.lineTo(x, worldHeight - h * worldHeight * 0.5);
    }
    terrainGfx.lineTo(worldWidth, worldHeight);
    terrainGfx.closePath();
    terrainGfx.fill('#4c3a28');
  }

  function updatePlane(y: number) {
    plane.y = y;
  }

  function updateTrail(oo: number) {
    trail.clear();
    const alpha = 0.25 + 0.6 * (oo / 100);
    trail.rect(plane.x - 40, plane.y - 2, 40, 4).fill({ color: accent, alpha });
  }

  function destroy() {
    root.removeFromParent();
    root.destroy({ children: true });
  }

  return { root, plane, terrainGfx, trail, updateTerrain, updatePlane, updateTrail, destroy };
}
```

- [ ] **Step 2: Create `PlaneGame.ts`**

Create `web/src/game/games/plane/PlaneGame.ts`:

```ts
import type { Application, Container, Ticker } from 'pixi.js';
import type { GameInstance, RunResult, Theme } from '../../Game';
import { generateValley } from './terrain';
import { buildPlaneScene, type PlaneScene } from './scene';

export interface PlaneGameArgs {
  app: Application;
  stage: Container;
  theme: Theme;
}

const RUN_DURATION_MS = 90_000;

export function createPlaneGame(args: PlaneGameArgs): GameInstance {
  const { app, stage, theme } = args;
  const valley = generateValley({ seed: Date.now() % 1e9, lengthPx: 50_000, sampleEveryPx: 20 });
  let scene: PlaneScene | null = buildPlaneScene(
    valley,
    theme.palette.bgTop,
    theme.palette.accent2,
  );
  stage.addChild(scene.root);

  let oo = 0;
  let targetY = app.screen.height * 0.5;
  let runIndex = -1;
  let runStarted = 0;
  let finishCb: ((r: RunResult) => void) | null = null;
  let scrollX = 0;
  let distanceM = 0;
  let paused = false;
  let ooSeries: number[] = [];
  let timeAboveMidSec = 0;
  let lastAccumSec = 0;

  scene.updateTerrain(scrollX, app.screen.width, app.screen.height);

  const tick = (ticker: Ticker) => {
    if (paused || !scene || runIndex < 0) return;
    const now = performance.now();
    const elapsedMs = now - runStarted;

    // Movement
    const speed = 2 + 2 * (oo / 100);
    scrollX += speed * ticker.deltaTime;
    distanceM = scrollX / 10;

    // Vertical easing toward targetY
    scene.plane.y += (targetY - scene.plane.y) * 0.04 * ticker.deltaTime;

    scene.updateTerrain(scrollX, app.screen.width, app.screen.height);
    scene.updateTrail(oo);

    // Accumulate per-second stats
    const nowSec = Math.floor(elapsedMs / 1000);
    if (nowSec > lastAccumSec) {
      ooSeries.push(oo);
      if (oo >= 50) timeAboveMidSec++;
      lastAccumSec = nowSec;
    }

    if (elapsedMs >= RUN_DURATION_MS && finishCb && runIndex >= 0) {
      const result: RunResult = {
        runIndex,
        startedAt: runStarted,
        durationMs: elapsedMs,
        ooSeries,
        qualityPercent: 0, // filled in by controller
        isValid: true,
        gameSpecific: {
          distanceM: Math.round(distanceM),
          timeAboveMidSec,
        },
      };
      const cb = finishCb;
      finishCb = null;
      cb(result);
    }
  };

  app.ticker.add(tick);

  return {
    startRun(idx, onFinish) {
      runIndex = idx;
      runStarted = performance.now();
      scrollX = 0;
      distanceM = 0;
      ooSeries = [];
      timeAboveMidSec = 0;
      lastAccumSec = 0;
      finishCb = onFinish;
      if (scene) scene.plane.x = 120;
    },
    setOO(next) {
      oo = Math.max(0, Math.min(100, next));
      const groundY = app.screen.height * 0.8;
      const skyY = app.screen.height * 0.2;
      targetY = skyY + (groundY - skyY) * (1 - oo / 100);
    },
    onInput() { /* Plane has no primary input in M1 */ },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() {
      app.ticker.remove(tick);
      if (scene) { scene.destroy(); scene = null; }
      finishCb = null;
    },
  };
}
```

- [ ] **Step 3: Create the manifest**

Create `web/src/game/games/plane/manifest.ts`:

```ts
import type { GameManifest, GameFactory } from '../../Game';

export const planeManifest: GameManifest = {
  id: 'plane',
  name: { zh: 'PlaneFlight', en: 'PlaneFlight' },
  tagline: { zh: '持續專注飛行', en: 'Sustained focus flight' },
  runDurationSec: 90,
  modes: [{ id: 'auto', name: { zh: '標準', en: 'Standard' }, taskLoad: 'single' }],
  async load(): Promise<GameFactory> {
    const { createPlaneGame } = await import('./PlaneGame');
    // Adapter: `GameFactoryArgs` gives us container/theme/lang/modeId;
    // PlaneGame needs a live Pixi Application + stage. The subject-window
    // GameEngine is responsible for bridging those two. The factory returned
    // here assumes `container.dataset.app` holds a JSON hint — see GameEngine.
    return (args) => {
      const app = (args.container as unknown as { __pixiApp?: unknown }).__pixiApp;
      const stage = (args.container as unknown as { __pixiStage?: unknown }).__pixiStage;
      if (!app || !stage) throw new Error('PlaneGame requires a Pixi Application bridged via container.__pixiApp');
      return createPlaneGame({
        app: app as Parameters<typeof createPlaneGame>[0]['app'],
        stage: stage as Parameters<typeof createPlaneGame>[0]['stage'],
        theme: args.theme,
      });
    };
  },
};
```

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/games/plane/PlaneGame.ts web/src/game/games/plane/scene.ts web/src/game/games/plane/manifest.ts
git commit -m "feat(gamepack): PlaneGame implementation + manifest"
```

---

## Task 22: `game/subject/GameEngine.ts` + `InputCapture.ts` + wire up `SubjectWindowRoot`

**Files:**
- Create: `web/src/game/subject/GameEngine.ts`
- Create: `web/src/game/subject/InputCapture.ts`
- Modify: `web/src/game/subject/SubjectWindowRoot.tsx`

- [ ] **Step 1: Create the subject-side engine**

Create `web/src/game/subject/GameEngine.ts`:

```ts
import type { GameChannel, GameChannelMessage } from '../../services/gameChannel';
import type { GameInstance, GameFactory, Theme, Lang } from '../Game';
import { createPixiHost, type PixiHost } from './pixiBootstrap';
import { papercutTheme } from '../themes/papercut';
import { planeManifest } from '../games/plane/manifest';

export interface GameEngineArgs {
  container: HTMLDivElement;
  channel: GameChannel;
}

const THEMES: Record<Theme['id'], Theme> = {
  papercut: papercutTheme,
  ghibli: papercutTheme,     // M1 alias; real ghibli ships in M4
  geometric: papercutTheme,
};

export class GameEngine {
  private container: HTMLDivElement;
  private channel: GameChannel;
  private host: PixiHost | null = null;
  private instance: GameInstance | null = null;
  private unsub: () => void = () => {};
  private currentRunIndex = -1;
  private theme: Theme = papercutTheme;
  private lang: Lang = 'zh';

  constructor(args: GameEngineArgs) {
    this.container = args.container;
    this.channel = args.channel;
  }

  async start(): Promise<void> {
    this.host = await createPixiHost(this.container);
    // Bridge: stash refs so manifests can pull them off the container
    (this.container as unknown as { __pixiApp: unknown }).__pixiApp = this.host.app;
    (this.container as unknown as { __pixiStage: unknown }).__pixiStage = this.host.stage;

    this.unsub = this.channel.subscribe((m) => this.onMessage(m));
  }

  private async onMessage(m: GameChannelMessage) {
    if (m.kind === 'loadGame') {
      this.theme = THEMES[m.themeId] ?? papercutTheme;
      this.lang = m.lang;
      await this.loadGame(m.gameId);
      return;
    }
    if (m.kind === 'runStart') {
      this.currentRunIndex = m.runIndex;
      this.instance?.startRun(m.runIndex, (result) => {
        this.channel.post({ kind: 'runResult', runIndex: result.runIndex, result });
      });
      return;
    }
    if (m.kind === 'oo') {
      this.instance?.setOO(m.oo);
      return;
    }
    if (m.kind === 'pause') { this.instance?.pause(); return; }
    if (m.kind === 'resume') { this.instance?.resume(); return; }
    if (m.kind === 'runForceEnd') {
      // synthesise a zero result so the channel contract holds
      this.channel.post({
        kind: 'runResult',
        runIndex: this.currentRunIndex,
        result: {
          runIndex: this.currentRunIndex,
          startedAt: 0,
          durationMs: 0,
          ooSeries: [],
          qualityPercent: 0,
          isValid: false,
          gameSpecific: {},
        },
      });
      return;
    }
    if (m.kind === 'sessionEnd') {
      this.instance?.destroy();
      this.instance = null;
      return;
    }
  }

  private async loadGame(gameId: 'plane' | 'golf' | 'maze') {
    if (gameId !== 'plane') return;   // M1: Plane only
    if (this.instance) { this.instance.destroy(); this.instance = null; }
    const factory: GameFactory = await planeManifest.load();
    this.instance = factory({
      container: this.container,
      theme: this.theme,
      lang: this.lang,
      modeId: 'auto',
    });
  }

  async stop(): Promise<void> {
    this.unsub();
    this.instance?.destroy();
    this.instance = null;
    if (this.host) {
      await this.host.dispose();
      this.host = null;
    }
  }
}
```

- [ ] **Step 2: Create `InputCapture.ts`**

Create `web/src/game/subject/InputCapture.ts`:

```ts
import type { GameChannel } from '../../services/gameChannel';
import type { GameInputEvent } from '../Game';

export function installInputCapture(channel: GameChannel): () => void {
  const handleKey = (e: KeyboardEvent) => {
    let evt: GameInputEvent | null = null;
    if (e.code === 'Space') evt = { type: 'primary' };
    else if (e.code === 'Escape') evt = { type: 'secondary' };
    else if (e.code === 'KeyP') evt = { type: 'pause' };
    else if (e.code === 'ArrowUp') evt = { type: 'direction', dx: 0, dy: -1 };
    else if (e.code === 'ArrowDown') evt = { type: 'direction', dx: 0, dy: 1 };
    else if (e.code === 'ArrowLeft') evt = { type: 'direction', dx: -1, dy: 0 };
    else if (e.code === 'ArrowRight') evt = { type: 'direction', dx: 1, dy: 0 };
    if (!evt) return;
    e.preventDefault();
    channel.post({ kind: 'gameInput', event: evt });
  };
  window.addEventListener('keydown', handleKey);
  return () => window.removeEventListener('keydown', handleKey);
}
```

- [ ] **Step 3: Wire them into `SubjectWindowRoot`**

Replace the existing placeholder `SubjectWindowRoot.tsx` with:

```tsx
import { useEffect, useRef, useState, type FC } from 'react';
import {
  createGameChannel,
  GAME_PROTOCOL_VERSION,
  type GameChannel,
} from '../../services/gameChannel';
import { GameEngine } from './GameEngine';
import { installInputCapture } from './InputCapture';

export const SubjectWindowRoot: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<GameChannel | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ch = createGameChannel();
    channelRef.current = ch;
    const engine = new GameEngine({ container, channel: ch });
    engineRef.current = engine;
    const removeInput = installInputCapture(ch);

    engine.start().then(() => {
      ch.post({ kind: 'subjectReady', protocolVersion: GAME_PROTOCOL_VERSION });
    }).catch((err) => setError((err as Error).message));

    const hbId = window.setInterval(() => {
      ch.post({ kind: 'heartbeatSubject', t: performance.now() });
    }, 2000);

    const onUnload = () => ch.post({ kind: 'subjectClosing' });
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.clearInterval(hbId);
      window.removeEventListener('beforeunload', onUnload);
      removeInput;
      removeInput();
      engine.stop();
      ch.close();
    };
  }, []);

  return (
    <>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
      {error && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#100', color: '#f85149', fontFamily: 'ui-monospace, monospace',
        }}>
          Game engine error: {error}
        </div>
      )}
    </>
  );
};
```

- [ ] **Step 4: Verify the full build one more time**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build 2>&1 | tail -30
```

Expected: build succeeds. If Pixi v8 types emit warnings, address only the errors — warnings can be audited later.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/game/subject/
git commit -m "feat(gamepack): subject window GameEngine + input capture + wired root"
```

---

## Task 23: End-to-end smoke in dev server

**No new files.**

This is a manual regression. The goal is to catch obvious breakage before the deploy step. Every check on the list must pass.

- [ ] **Step 1: Launch dev server**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run dev
```

Leave the server running in the foreground of another terminal.

- [ ] **Step 2: Main window — sidebar and route**

Open http://localhost:5173 in Chrome:
- [ ] Connect to the FTDI device using the existing flow
- [ ] Sidebar shows a new "遊戲訓練 / Games" entry
- [ ] Click it — `GameControlView` loads with the game picker
- [ ] Plane card is clickable; Golf and Maze are greyed out with "coming soon"

- [ ] **Step 3: Wizard flow**

- [ ] Click Plane card → "Next" becomes active
- [ ] Click Next → duration step renders
- [ ] NFB settings panel shows the current settings from TrainingView
- [ ] "Open subject window" button is visible

- [ ] **Step 4: Subject window open**

- [ ] Click "Open subject window" — a second tab opens to `/nfb-game.html` (allow pop-ups if blocked and retry)
- [ ] After ~1s the main window's status pill turns green ("Connected")
- [ ] "Start" button is now enabled (provided at least one indicator is enabled in TrainingView)

- [ ] **Step 5: Run a 5-minute Plane session**

- [ ] Click Start
- [ ] Subject window shows the Pixi canvas with a moving plane and parallax terrain
- [ ] Main window therapist HUD shows OO and TA updating
- [ ] Focus levels change → plane altitude changes
- [ ] After 90s the plane run ends and the HUD shows "runRest"; Next run button appears
- [ ] Click Next run → plane resets and a new run starts
- [ ] Let the session run out naturally (5 min)
- [ ] Session report view appears in main window with run count and avg OO

- [ ] **Step 6: Dual-window failure modes**

- [ ] Open a new session; mid-run, close the subject tab
- [ ] Main window goes into "Subject window lost" state within ~5s, session pauses
- [ ] Click "Open subject window" again → reopen, resume training

- [ ] **Step 7: Pop-up blocker path**

- [ ] In a fresh private window, deny pop-ups for the origin
- [ ] Click "Open subject window" — an alert appears explaining the block
- [ ] Enable pop-ups and retry — it works

- [ ] **Step 8: TrainingView non-regression**

- [ ] Go to Training tab
- [ ] Change difficulty slider, persistence slider, toggle an indicator
- [ ] Run a 1-minute training session
- [ ] Feedback window opens and visual mask opacity responds to OO (unchanged behaviour)
- [ ] Audio volume responds to OO (unchanged behaviour)
- [ ] DevTools → Local Storage shows `soramynd.nfb.settings.v1` updating live

- [ ] **Step 9: Settings cross-flow**

- [ ] With Training tab open, change difficulty to Lv 5
- [ ] Switch to Games tab → NFB panel reflects Lv 5
- [ ] Open subject window, start a session → OO math uses Lv 5

- [ ] **Step 10: Stop the dev server**

Ctrl-C in the terminal running `bun run dev`.

- [ ] **Step 11: Commit (smoke pass marker)**

```bash
cd /Users/swryociao/NFB-Webapp
git commit --allow-empty -m "chore(gamepack): M1 dev smoke passed"
```

---

## Task 24: Run the full test suite

- [ ] **Step 1: Run all unit tests**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run test
```

Expected: all tests from the following files pass with no skipped or failed cases.

- `src/test/smoke.test.ts`
- `src/utils/nfbFormulas.test.ts`
- `src/services/nfbSettingsStore.test.ts`
- `src/services/gameChannel.test.ts`
- `src/services/gameSessionLog.test.ts`
- `src/hooks/useGameOverlayOpacity.test.tsx`
- `src/game/control/GameSessionController.test.ts`
- `src/game/games/plane/terrain.test.ts`

Total: approximately 45 test cases.

- [ ] **Step 2: Commit marker**

```bash
cd /Users/swryociao/NFB-Webapp
git commit --allow-empty -m "chore(gamepack): M1 test suite green"
```

---

## Task 25: Build and staging deploy

- [ ] **Step 1: Production build**

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bun run build
```

Expected: Vite writes `dist/` with at least `index.html`, `nfb-game.html`, and a handful of JS/CSS chunks. Inspect:

```bash
ls dist
ls dist/assets | head -20
```

Both HTML entries must be present. The nfb-game chunk should contain Pixi code (large file size) — confirm visually that `dist/assets/` has a chunk over 200KB.

- [ ] **Step 2: Deploy to Cloudflare Pages staging**

Do not push to production on this alpha. Deploy with `--commit-dirty` to the existing `nfb-webapp` project:

```bash
cd /Users/swryociao/NFB-Webapp/web
~/.bun/bin/bunx wrangler pages deploy dist --project-name nfb-webapp --commit-dirty=true --branch gamepack-m1-alpha
```

Capture the preview URL from the Wrangler output.

- [ ] **Step 3: Smoke the deployed preview**

Open the preview URL, repeat Task 23 Steps 2–8 against the deployed build. Spot-check that the subject window opens and the plane moves. If any regression shows up that was not present locally, STOP and investigate — do not push to main.

- [ ] **Step 4: Bump version**

Modify `web/vite.config.ts`:

```ts
const APP_VERSION = '0.8.0-alpha.1'
```

- [ ] **Step 5: Final commit and push**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/vite.config.ts
git commit -m "chore(gamepack): bump version to v0.8.0-alpha.1 for M1 dogfood"
git push -u origin feat/gamepack-m1
```

Share the preview URL with the clinician dogfood group. Gather feedback before opening a PR into `main`.

---

## Out of scope for M1 (deferred to M2+)

- Golf game (M2)
- RabbitMaze game (M3)
- ghibli theme sprites and BGM (M4)
- Geometric theme (v1.1)
- Session result upload through a real artisebio-api session token (M4 — ties into session-token provisioning flow already used by sgimacog-web)
- Production deploy and version bump to `v0.8.0` (M5)
- Full performance instrumentation (M5)
- Plane power-ups, dual-task mode (v1.1)

---

## Self-review checklist (run after implementation)

Before opening a PR for this milestone:

- [ ] Every task commit message follows the `feat(gamepack):` / `chore(gamepack):` convention
- [ ] `bun run test` green
- [ ] `bun run build` green, no new warnings beyond existing baseline
- [ ] Dual-window flow tested in Chrome and Safari (Safari may need extra Fullscreen API tweaks — note any findings in the PR description)
- [ ] TrainingView regression gate (Task 23 Step 8) passed — attach a short Loom of the feedback window + audio volume working
- [ ] Files added to `game/games/plane/` do not import React (quick grep check)
- [ ] `services/gameChannel.ts` is the only module imported by both `game/control/**` and `game/subject/**` besides `game/Game.ts`
