# SoraMynd GamePack — Design Spec

**Date:** 2026-04-13
**Status:** Design approved, ready for implementation plan
**Source:** Port of `0531_GamePack` (Unity BCI game collection by Ponkan & Sesame / EXBrain) to SoraMynd web platform
**Target version:** SoraMynd v0.8.0

---

## 1. Goal

Add a **game-based neurofeedback training mode** to SoraMynd as a third feedback modality, alongside the existing visual mask and audio volume feedback. The games replace the original Unity WebSocket + C#/mono stack with a pure-web Pixi.js implementation that consumes the existing SoraMynd EEG + OO pipeline. Visuals and gameplay are redesigned for web and for clinical NFB goals; three of the five original games are ported.

**Non-goals for v1:** desktop Unity parity, 3D rendering, competitive scoring, long-term personal baselines, offline PWA, the Basketball and Racing games.

---

## 2. Product decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Embed in SoraMynd** as a new `Games` sidebar tab (not a separate sub-app) | Sessions, EEG stream, device management, reports all sit in one place; clinicians can switch between dashboard training and game training in one session |
| 2 | **3 games for v1:** PlaneFlight (sustained focus), Golf (burst focus), RabbitMaze (relaxation/down-training) | Covers three distinct NFB mapping types; forces the game framework to be genuinely reusable without exploding scope |
| 3 | **Games consume `OO ∈ [0, 100]` only**; no per-game metric recommendation in v1 | `OO` already bakes in metric selection, threshold, direction, difficultyLevel (K constant), persistenceLevel (W-second sliding window) and sqrt smoothing — it is the right abstraction for a gameplay input |
| 4 | **Fixed global thresholds** (no in-game calibration) | A z-score database is planned as a separate upstream project; games stay agnostic to whether the metric is raw µV² or z-score |
| 5 | **Pixi.js v8** for rendering, three runtime-switchable 2D themes (papercut, ghibli, geometric) | NFB games benefit from visual minimalism; 2D keeps bundle small; theme switching adds novelty without touching gameplay code |
| 6 | **Run-based sessions:** duration-locked (5 / 10 / 15 / 20 min), split into short runs (60–90s) with ~10s rest screens between | Matches clinical NFB protocols (burst-and-rest avoids neural fatigue); gives clean per-run reward loop; time-cap is soft (the current run always finishes naturally) |
| 7 | **Split framework: `GameSessionController` (main window) + `GameEngine` (subject window) + thin `Game` interface** | Pixi is imperative and fights React lifecycle if inlined; splitting control state (main) from render lifecycle (subject) keeps the dual-window boundary clean and lets session logic live once |
| 8 | **Dual-task mode switch** on Golf and Maze (auto = single task, manual = dual task) | Clinically important training dimension: sustaining NFB state while also executing an active cognitive decision. Plane stays single-mode as a pure sustained-focus baseline |
| 9 | **Golf release:** both auto and manual modes supported, picked per session | Same rationale — dual task vs single task |
| 10 | **Maze navigation:** both auto pathfinding and manual direction input, picked per session | Same rationale |
| 11 | **Plane has no mode** in v1; single "Standard" mode only | Plane is the pure sustained-focus baseline; adding cognitive load would turn it into Golf/Maze. Dual-task variants deferred to v1.1 |
| 12 | **Plane power-ups (light rings, events) deferred to v1.1** | v1 = minimum viable mapping of focus → altitude |
| 13 | **Visual themes:** papercut + ghibli in v1, geometric deferred to v1.1 | Two themes cover the "novelty" goal without inflating v1 asset budget |
| 14 | **NFB setting sharing via localStorage (scheme B)** | TrainingView writes settings to localStorage via one additive `useEffect`; the game control view reads and writes the same key. Zero touch to TrainingView's OO compute path, visual mask postMessage, or audio feedback |
| 15 | **Games do not touch the existing TrainingView OO pipeline.** `GameControlView` computes its own OO independently using pure functions shared via `utils/nfbFormulas.ts` | Eliminates regression risk on the production visual mask + audio feedback flows |
| 16 | **Signal quality handling:** reuse `useQualityMonitor` (recording logic), no impedance pre-session gate. Runs with `qualityPercent < 50` are marked invalid in the report but are not blocked or interrupted | Matches SoraMynd's existing "don't block the clinician, report honestly" philosophy |
| 17 | **Game class body cannot import React** (strict); HUD / run report / session report / wizard are React rendered as an overlay on top of the Pixi canvas (compromise) | Pixi lifecycle bugs cluster around mixed React/imperative boundaries; strict boundary + React for static overlays gives the best of both |
| 18 | **Backend integration:** new `services/gameSessionApi.ts` modelled on `sgimacog-web/src/services/sessionApi.ts`; uploads SessionReport + report HTML via existing artisebio-api endpoints | artisebio-api schema requires no changes; SessionReport fits in `test_sessions.result_data` JSON |
| 19 | **Session-end reporting:** extends SoraMynd existing report formats with a run-by-run table and per-run OO curves | Clinicians already know the format |
| 20 | **v1 total timeline:** ~6–7 weeks (Milestone 0 merged into Milestone 1) | Clinician internal alpha after each game milestone |
| 21 | **Dual-window architecture (REQUIRED):** therapist control panel in the main SoraMynd window; game canvas in a second standalone window (`nfb-game.html`) the therapist drags to the subject's monitor. The two tabs cannot be toggled — they run simultaneously. | Matches clinical setup: therapist adjusts NFB parameters on their own screen while the subject sees only the game on a second monitor. The same pattern is already proven by the existing TrainingView feedback window (`nfb-feedback.html` + postMessage). |

---

## 3. Architecture

### 3.1 High-level data flow

```
┌─────────── MAIN WINDOW (therapist) ────────────┐     ┌─── SUBJECT WINDOW (nfb-game.html) ───┐
│                                                │     │                                       │
│ Serial / FTDI ──► useEegStream ──► packets[]   │     │   (no device access, no EEG hooks)    │
│                      │                         │     │                                       │
│                      ├──► useBandPower          │     │   gameChannel.subscribe()            │
│                      │     ─► bandPower         │     │          │                            │
│                      │        │                │     │          ├─ oo events                 │
│                      │        ├──► TrainingView │     │          ├─ runStart / runEnd        │
│                      │        │  (UNTOUCHED)   │     │          ├─ pause / resume           │
│                      │        │                │     │          ├─ settingsChange           │
│                      │        └──► GameControl │     │          └─ themeChange              │
│                      │              Panel      │     │                 │                     │
│                      │              (in SPA)   │     │                 ▼                     │
│                      │              │          │     │          GameEngine (Pixi)            │
│                      │              └─ useGame │     │          ├─ game.setOO()              │
│                      │                 Overlay │     │          ├─ game.startRun()           │
│                      │                 Opacity │     │          └─ full-screen canvas        │
│                      │                 │       │     │                                       │
│                      │                 ▼       │     │   Input (space / arrows) ──►          │
│                      │           ┌──────────┐  │     │      gameChannel.post('input')        │
│                      │           │gameChannel│◄─┼─────┼───► subjectAlive heartbeat (2s)      │
│                      │           │(Broadcast│──┼─────┼───► oo / run events                  │
│                      │           │ Channel) │  │     │                                       │
│                      │           └──────────┘  │     │                                       │
│                      │                         │     │                                       │
│                      └──► useQualityMonitor    │     │                                       │
│                            └─► RecordView /    │     │                                       │
│                                GameControl     │     │                                       │
└────────────────────────────────────────────────┘     └───────────────────────────────────────┘
```

**Key invariants:**

1. **Main window is the single source of truth.** EEG device, band power, OO, session state, NFB settings, upload queue — all live in the main window. The subject window is a pure renderer that reflects state it receives via `gameChannel`.
2. **TrainingView's OO compute path, postMessage visual mask plumbing, and audio feedback are not modified in v1.** The only change to `TrainingView.tsx` is one additive `useEffect` that mirrors current settings into localStorage so the game control panel can read them.
3. **GameControlPanel computes its own OO** from the same raw `bandPower` using shared pure formulas in `utils/nfbFormulas.ts` — two independent feedback consumers of one EEG stream.
4. **The subject window cannot own the Web Serial connection** (only one tab can open the port). All EEG access stays in the main window; the subject window is display-only.

### 3.2 Module layout

```
web/
├── public/
│   └── nfb-game.html                     NEW — subject-window entry HTML (Vite multi-entry)
├── vite.config.ts                        MOD: rollupOptions.input adds 'nfb-game'
└── src/
    ├── App.tsx                           MOD: + 'games' page entry
    ├── gameWindow.tsx                    NEW — subject-window React root (minimal)
    ├── utils/
    │   └── nfbFormulas.ts                NEW pure functions + K/W constants
    ├── hooks/
    │   ├── useBandPower.ts               unchanged
    │   ├── useEegStream.ts               unchanged
    │   ├── useQualityMonitor.ts          unchanged
    │   └── useGameOverlayOpacity.ts      NEW — independent OO stream (main window only)
    ├── services/
    │   ├── wasm.ts                       unchanged
    │   ├── nfbSettingsStore.ts           NEW — localStorage I/O + schema validation
    │   ├── gameChannel.ts                NEW — BroadcastChannel wrapper, typed message schema
    │   ├── gameSessionApi.ts             NEW — uploads to artisebio-api
    │   └── gameSessionLog.ts             NEW — local IndexedDB / localStorage fallback
    ├── components/
    │   ├── layout/
    │   │   └── Sidebar.tsx               MOD: + 'Games' item
    │   ├── shared/
    │   │   └── QualityPill.tsx           NEW — extracted from RecordView quality indicator
    │   └── views/
    │       ├── TrainingView.tsx          MOD: one additive useEffect → localStorage
    │       ├── RecordView.tsx            MOD: uses shared QualityPill
    │       └── GameControlView.tsx       NEW — therapist control panel (main window)
    └── game/                             NEW entire subtree
        ├── Game.ts                       interface (shared by both windows)
        ├── SessionConfig.ts              session types
        ├── control/                      MAIN-WINDOW ONLY
        │   ├── GameSessionController.ts  state machine + session timer + OO pump
        │   ├── sessionWizard/
        │   │   ├── SelectGameStep.tsx
        │   │   ├── SelectDurationStep.tsx
        │   │   └── NfbSettingsPanel.tsx
        │   ├── OpenSubjectWindowButton.tsx
        │   ├── TherapistHud.tsx          live OO / TA / quality / run stats / pause / resume
        │   ├── SubjectWindowStatus.tsx   connected / lost / reopen
        │   └── sessionReport.tsx         React session-end report (therapist view)
        ├── subject/                      SUBJECT-WINDOW ONLY (imports only gameChannel + game/*)
        │   ├── SubjectWindowRoot.tsx     receives channel events, mounts GameEngine
        │   ├── GameEngine.ts             Pixi lifecycle, game load, setOO forwarding
        │   ├── pixiBootstrap.ts          Application lifecycle, DPR, resize, fullscreen API
        │   └── InputCapture.ts           keyboard → gameChannel.post('input')
        ├── themes/
        │   ├── tokens.ts                 Theme type
        │   ├── papercut/ { palette.ts, sprites/, bgm.ogg, preview.png }
        │   ├── ghibli/   { palette.ts, sprites/, bgm.ogg, preview.png }
        │   └── geometric/                (v1.1 — empty dir in v1)
        └── games/
            ├── plane/
            │   ├── PlaneGame.ts          implements Game (no React, no channel)
            │   ├── scene.ts
            │   ├── terrain.ts            procedural parallax valley
            │   └── manifest.ts           dynamic-import factory
            ├── golf/
            │   ├── GolfGame.ts           implements Game
            │   ├── physics.ts            planck.js wrapper (golf-only, dynamic import)
            │   ├── holes.ts              9 procedural holes for v1
            │   └── manifest.ts
            └── maze/
                ├── MazeGame.ts           implements Game
                ├── generator.ts          recursive backtracker
                └── manifest.ts
```

**Module boundary rules (enforced by lint / code review):**

1. `game/control/**` runs only in the main window. It may import hooks (`useBandPower`, `useGameOverlayOpacity`, `useQualityMonitor`), utils, services, and `game/Game.ts`. It must NOT import `game/subject/**` or Pixi.
2. `game/subject/**` runs only in the subject window. It may import `game/Game.ts`, `game/games/**`, `game/themes/**`, `services/gameChannel.ts`. It must NOT import any React hook from `hooks/**`, any EEG service, or any file under `components/**`.
3. `game/games/<name>/**` may not import from another game directory.
4. `game/games/<name>/*Game.ts` (the class files) **may not import React**, react-dom, any React library, or any file under `components/**`. Enforced by ESLint `no-restricted-imports` scoped to `game/games/**`.
5. `game/themes/<name>/**` holds only data (palettes, sprite path maps, audio URLs, preview image). No logic.
6. Pixi `Application` instantiation and destruction only happens inside `game/subject/pixiBootstrap.ts`. Game classes receive a `Container` or a ready canvas; they never `new Application()` themselves.
7. All network calls (artisebio-api upload, token fetch) live in `services/gameSessionApi.ts`, called only from the main window. `game/subject/**` never calls `fetch`.
8. `services/gameChannel.ts` is the only module both windows import directly. Its public type (`GameChannelMessage` union) is the wire contract between the two tabs.

### 3.3 Bundle budget

| Item | Estimate |
|---|---|
| Pixi.js v8 (tree-shaken core + ticker + text) | ~230 KB gz |
| planck.js (dynamic import, Golf only) | ~60 KB gz |
| Three game code + shared framework | ~40 KB gz |
| papercut theme (sprites + 1 BGM ogg) | ~500 KB |
| ghibli theme (sprites + 1 BGM ogg) | ~700 KB |

**Target:** first visit to the game control view (control panel only — no Pixi, no themes) < 200 KB over the wire. The subject window loads engine + one default theme on first open (< 1 MB). Themes and planck.js are dynamic-import chunks loaded on demand **inside the subject window only**, so the main window never pays for Pixi at all.

### 3.4 Dual-window communication

The therapist control panel (main window) and the subject window are two separate tabs running simultaneously. They communicate via `BroadcastChannel('soramynd-game-v1')`, wrapped in `services/gameChannel.ts` with a typed message union.

**Why `BroadcastChannel` over `window.postMessage` on a held reference:**

- Survives subject-window reload without losing the channel
- No dependency on `window.opener`, which is null when the window is moved to a different virtual desktop on macOS in some browsers
- Clean API on both sides — no opener-is-null / target-origin / tab-reference bookkeeping
- Same-origin guaranteed (SoraMynd is served from one origin), so trust boundary is not a concern

`window.postMessage` is still used in one place: `window.open('/nfb-game.html', 'soramynd-subject')` returns a window reference the main window keeps so it can call `focus()` and detect close via `closed` polling. All payload traffic goes through BroadcastChannel.

**Message schema (wire contract in `gameChannel.ts`):**

```ts
export type GameChannelMessage =
  // main → subject
  | { kind: 'hello';         sessionId: string; protocolVersion: 1 }
  | { kind: 'loadGame';      gameId: 'plane'|'golf'|'maze'; modeId: string; themeId: string; lang: 'zh'|'en' }
  | { kind: 'preview' }
  | { kind: 'runStart';      runIndex: number; runDurationSec: number; startedAt: number }
  | { kind: 'oo';            t: number; oo: number; ta: number }   // t = perf.now() since runStart
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'runForceEnd' }                                         // overrun guard / abort
  | { kind: 'sessionEnd' }
  | { kind: 'themeChange';   themeId: string }
  | { kind: 'heartbeatMain'; t: number }
  // subject → main
  | { kind: 'subjectReady';  protocolVersion: 1 }
  | { kind: 'runResult';     runIndex: number; result: RunResult } // full RunResult payload
  | { kind: 'gameInput';     event: GameInputEvent }               // so therapist can log it
  | { kind: 'heartbeatSubject'; t: number }
  | { kind: 'subjectClosing' };                                    // best-effort on beforeunload
```

`protocolVersion` lets the main window detect a stale subject tab after a code push and prompt a reload.

**Heartbeat and liveness:**

- Main → subject every 2s; subject → main every 2s
- Main window marks the subject lost if no `heartbeatSubject` arrives for 5s OR if polling `subjectWindow.closed === true`
- Subject lost during `RUN ACTIVE` → auto-pause, therapist HUD shows a reconnect banner with "Reopen subject window" button
- Pause > 5 min still aborts the session as before

**Subject window lifecycle:**

1. Therapist clicks "Open subject window" (required user gesture for pop-up allowance)
2. Main opens `/nfb-game.html?session=<sid>&protocol=1`
3. Subject root mounts, loads default theme chunk, posts `subjectReady`
4. Main posts `hello` with session id, then `loadGame` with current wizard selection
5. Subject preloads game module (dynamic import), confirms ready
6. Therapist clicks "Start session" → main starts OO pump → `runStart` → `oo` stream
7. Subject drives Pixi from the `oo` messages, forwards `runResult` on natural end
8. On `subjectClosing` or lost heartbeat, main pauses the session

**Clock:** the authoritative wall clock lives in the main window. OO messages carry a `t` offset from `runStart` so the subject window can schedule rendering smoothly without inter-tab clock drift.

**Input forwarding:** keyboard events for manual Golf / Maze modes are captured inside the subject window (the one the patient focuses on) and forwarded to the main window as `gameInput` for session logging. The game itself still handles the event locally — the main-window copy is for audit only.

**Same-origin, multi-monitor:** Both tabs are served by the same SoraMynd origin, so BroadcastChannel works without configuration. The therapist physically drags the subject window onto the patient's monitor and presses a HUD button that invokes Fullscreen API inside the subject window.

---

## 4. The OO pipeline for games

### 4.1 Why games do not touch TrainingView

TrainingView currently owns the production OO compute path that drives two existing, in-use feedback modalities:

- The **feedback window** (visual mask) receives `postMessage({type:'nfb_overlay', opacity: 1 - OO/100})`
- The **audio element** volume tracks `OO / 100`

Refactoring this path for game consumption would put those two modalities at risk. Instead, v1 treats the game as a third independent consumer of the same upstream `bandPower`, with its own OO computation running in parallel.

The two OO streams share **constants and formulas** via pure functions, but each maintains its own state (`taWindow` ring buffer, session history). Divergence between the two values is acceptable and expected — each view has its own session lifecycle.

### 4.2 `utils/nfbFormulas.ts` (pure)

```ts
export const K_VALUES = [16.67, 14.29, 12.70, 11.55, 10.66] as const;
export const W_VALUES = [5, 8, 12, 17, 23] as const;

export function computeTickBool(
  indicators: ReadonlyArray<NfbIndicator>,
  metricValues: Readonly<Record<string, number>>,
): boolean;

export function computeTA(taWindow: ReadonlyArray<boolean>): number;

export function computeOO(ta: number, difficultyLevel: 1|2|3|4|5): number;
```

No state, no React, no imports from `hooks/` or `services/`. Unit-tested against the formulas documented in the existing NFB training metrics memo.

### 4.3 `hooks/useGameOverlayOpacity.ts`

```ts
interface UseGameOverlayOpacityResult {
  oo: number;              // 0..100, latest
  ta: number;              // 0..100
  tick: boolean;           // latest per-second tick
  ooHistory: Float32Array; // last N seconds (ring buffer)
  isActive: boolean;       // at least one enabled indicator
}

export function useGameOverlayOpacity(
  bandPower: BandPowerMatrix | null,
  cardiacMetrics: CardiacMetrics | null,
): UseGameOverlayOpacityResult;
```

- Runs in the **main window only**, alongside `useBandPower` and `useEegStream`
- Reads NFB settings from `nfbSettingsStore` (localStorage) via a subscription
- Runs its own `setInterval(1000)` tick
- Maintains its own `taWindowRef` (boolean[], capped at max W)
- Maintains its own `sessionHistoryRef` (reset when `GameSessionController` starts a session, not on hook mount)
- Output is fed to `GameSessionController`, which emits `oo` messages over `gameChannel` to the subject window

### 4.4 TrainingView modification scope

The **only** v1 change to `TrainingView.tsx`:

```tsx
// Additive useEffect — writes current settings snapshot to localStorage.
// Does not read, does not alter existing state, does not touch OO compute.
useEffect(() => {
  nfbSettingsStore.write({
    indicators: enabledIndicators, /* ... */,
    difficultyLevel,
    persistenceLevel,
    qualitySensitivity: /* default 3 if absent */,
  });
}, [enabledIndicators, difficultyLevel, persistenceLevel /* etc. */]);
```

No read of localStorage in v1 (TrainingView retains its current initialization). v1.1 may upgrade to bidirectional sync once v1 is stable in production.

---

## 5. Game contract

### 5.1 `Game.ts`

```ts
export type Lang = 'zh' | 'en';

export interface Theme {
  id: 'papercut' | 'ghibli' | 'geometric';
  palette: Record<string, string>;
  assetBase: string;
  bgmUrl: string;
  sfx: Record<string, string>;
}

export interface GameMode {
  id: string;                              // 'auto' | 'manual'
  name: Record<Lang, string>;
  taskLoad: 'single' | 'dual';
}

export interface GameManifest {
  id: 'plane' | 'golf' | 'maze';
  name: Record<Lang, string>;
  tagline: Record<Lang, string>;
  runDurationSec: number;
  modes: GameMode[];
  load(): Promise<GameFactory>;
}

export type GameFactory = (args: {
  container: HTMLDivElement;
  theme: Theme;
  lang: Lang;
  modeId: string;
}) => GameInstance;

export interface RunResult {
  runIndex: number;
  startedAt: number;
  durationMs: number;
  ooSeries: Float32Array;
  qualityPercent: number;
  isValid: boolean;
  gameSpecific: Record<string, number | boolean>;
}

export type GameInputEvent =
  | { type: 'primary' }    // Space / click / tap
  | { type: 'secondary' }  // Esc / right-click
  | { type: 'pause' };     // P

export interface GameInstance {
  startRun(runIndex: number, onFinish: (r: RunResult) => void): void;
  setOO(oo: number): void;
  onInput?(event: GameInputEvent): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}
```

### 5.2 Invariants every game implementation must honour

1. `setOO` may arrive before `startRun` (preview use). Games must have an idle state that reacts visually without affecting run state.
2. `startRun` is idempotent: consecutive calls reset internal state each time.
3. `onFinish` fires exactly once per `startRun`. If `destroy` fires first, `onFinish` must not be called.
4. `pause` / `resume` freeze game logic but leave Pixi rendering alive (ambient background may continue). `setOO` calls during pause are ignored (no accumulation).
5. `destroy` releases all Pixi resources: stop tickers, remove event listeners, destroy textures, empty the container. No WebGL context leaks.
6. `*Game.ts` files must not import React. Run reports, session reports, and the therapist HUD are rendered only in the main window by `GameControlView`. The subject window shows no React overlays — it is pure Pixi + fullscreen canvas so the subject stays immersed.

---

## 6. GameSessionController state machine (main window)

The controller lives in the main window. The subject window is a display slave — it does not own a state machine, it only reacts to messages.

```
    [MOUNTED]
        │
        ▼
    [IDLE] ──openSubjectWindow──► [CONNECTING] ──subjectReady──► [PREVIEW]
                                                                     │
                                                                     │ startSession
                                                                     ▼
                                                                [RUN ACTIVE] ◄────┐
                                                                     │             │
                                                                     │ runResult / │
                                                                     │ time-up     │
                                                                     ▼             │
                                                                [RUN REST] ────────┘
                                                                     │
                                                                     └─(sessionTime == 0 AND
                                                                        current run naturally ended)
                                                                       ─► [SESSION REPORT]
                                                                              │
                                                                              ▼
                                                                          [IDLE]

    Any state except IDLE, SESSION REPORT ──subject lost──► [SUBJECT LOST]
                                                                 │
                                                                 ├─heartbeatSubject resumed─► previous state
                                                                 │
                                                                 └─pause > 5 min─► abort, upload partial
```

| State | OO broadcast | Session timer | Quality monitor accumulates |
|---|---|---|---|
| IDLE | no | stopped | no |
| CONNECTING | no | stopped | no |
| PREVIEW | yes | stopped | no |
| RUN ACTIVE | yes | running (wall clock) | yes |
| RUN REST | no | running | no |
| SESSION REPORT | no | stopped | no |
| SUBJECT LOST | no | paused (accumulates to pauseMs) | no |

**Key rules:**

- Session timer uses the main window wall clock (`Date.now()`), not the Pixi ticker that lives in the subject window — tab switches and subject-window reloads do not drop seconds.
- Time-up is soft: if `sessionTimeRemaining === 0` during RUN ACTIVE, wait for `runResult` from the subject window before transitioning to SESSION REPORT. If during RUN REST, transition immediately.
- Pause subtracts paused duration from the session timer so pauses are not cheats.
- Pause > 5 minutes → auto-abort session, uploads what is already completed.
- Quality monitor ticks are independent of run lifecycle; at run end, the controller slices the last `durationMs` worth of quality windows to compute `qualityPercent` and attaches it to the incoming `RunResult`.
- Run overrun guard: if no `runResult` arrives from the subject window within `runDurationSec × 2`, the controller posts `runForceEnd`, synthesises a minimal `RunResult` (all zeros, `isValid: false`), logs the error, and starts the next run.
- Subject window lost during RUN ACTIVE: controller enters `SUBJECT LOST`, stops the OO pump, shows the therapist a reconnect banner. A heartbeat resume reverts to the prior state; a close + reopen restarts the current run from scratch.

### 6.1 Signal failure handling

| Event | Detection | Action |
|---|---|---|
| Hard serial disconnect | `useEegStream.connectionStatus !== 'connected'` | Auto-pause RUN ACTIVE, show "device disconnected" toast, user presses "continue" to resume |
| 30s with zero new packets | empty packet buffer | Same as hard disconnect |
| Poor signal quality (live) | `qualityPercent` dropping | No pause, no toast. `QualityPill` in HUD turns yellow / red. Run's `isValid` is decided at run end based on final `qualityPercent >= 50` |

Philosophy: don't interrupt training for poor quality — just report it honestly afterwards. This matches SoraMynd RecordView behaviour.

---

## 7. Session wizard and therapist control panel

The wizard and the live therapist HUD both live in the main window under `components/views/GameControlView.tsx`. The subject window never shows any of this UI.

**Step 1 — Select game + mode + theme**
- Three game cards (Plane / Golf / Maze), each showing name, tagline, theme preview, and a mode segmented control (only shown for games with more than one mode).
- Top-right theme switcher (papercut / ghibli).
- NFB settings panel below the cards (compact version of TrainingView's panel) — reads from localStorage, writes back on change.
- Live `<QualityPill/>` showing current signal quality.

**Step 2 — Select duration and open subject window**
- Four buttons: 5 / 10 / 15 / 20 min
- Summary of selected game, mode, theme, enabled indicators, difficulty, persistence
- Live `<QualityPill/>` still visible
- **"Open subject window"** button — `window.open('/nfb-game.html', …)` on click; this is a direct gesture so pop-up blockers allow it
- **"Start session"** button — disabled until: `enabledIndicators.length > 0` AND `subjectWindowStatus === 'ready'`. Inline hints explain each gate.

**Step 3 — Active session (therapist HUD)**
- Replaces the wizard content once the session starts
- Live OO bar, TA %, quality pill, current run index and countdown
- NFB settings remain editable — `settingsChange` messages flow to the subject window, but the on-screen game reaction depends only on the OO stream, so the change is seamless
- Pause / Resume / Abort buttons
- "Subject window: connected / lost / reopen" status row
- Per-run report slides in during RUN REST

No impedance gate. Quality is visible at every decision point as a soft indicator.

---

## 8. Per-game design

### 8.1 PlaneFlight

- **Genre:** side-scrolling sustained-focus flight
- **Modes:** `auto` only (single mode, no dual task in v1)
- **Run length:** ~90 seconds or until the procedurally-generated valley is cleared
- **OO → gameplay:**
  - flight altitude: `targetY = map(focus, 0..1, groundY..skyY)`; actual `Y` follows target with ~1.2s easeInOutQuad
  - forward speed: `baseSpeed × (0.8 + 0.4 × focus)`
  - particle trail colour: gold at OO ≥ 80, fades grey at OO ≤ 40
  - background audio layering: extra chime layer at OO ≥ 80
- **No fail state** — low focus just means flying through fog near the valley floor
- **Run end:** reaches valley endpoint (~18000 px of procedural terrain) or engine overrun guard at `runDurationSec × 2`
- **Run report metrics:**

```
distanceM: number
cloudsPassed: number
timeAboveMidSec: number      // OO >= 50 seconds
maxSustainedSec: number      // longest run of OO >= 70
```

### 8.2 Golf

- **Genre:** side-view minigolf with charge-and-release shot mechanic
- **Modes:**
  - `auto` — single task, shot releases automatically when charge enters the target zone
  - `manual` — dual task, player presses Space / taps to release when ready
- **Run length:** one hole per run (~60–120 seconds); up to 3 strokes per hole
- **OO → gameplay:**
  - Charge phase: `chargeLevel += (focus - 0.3) × dt` — only accumulates when focus > 0.3, geometric decay when lower
  - Target zone (e.g. 60–80%) shown as a green band on the charge bar; when charge enters it, a pulsing green halo appears around the ball
  - Auto mode: engine auto-releases at the most stable tick inside the target zone
  - Manual mode: player input triggers release; overshooting 100% also auto-releases to prevent lockup
  - Release `power = chargeLevel / 100 × maxForce`; ball follows planck.js trajectory
- **Physics:** planck.js loaded only when Golf is selected (dynamic import)
- **Run end:** hole-in or 3 strokes used
- **Run report metrics:**

```
strokes: number
holedIn: boolean
bestChargeOO: number         // max OO during any charge attempt
releaseAccuracy: number      // 0..1, closeness to target-zone centre at release
chargeTimeTotalSec: number
releaseLatencyMs?: number    // manual mode only — time from entering target zone to release
```

### 8.3 RabbitMaze

- **Genre:** top-down maze with autonomous or player-directed rabbit
- **Modes:**
  - `auto` — single task, rabbit auto-pathfinds to nearest carrot; training goal is pure relaxation
  - `manual` — dual task, player provides direction input (arrows / WASD / touch swipe); player must balance route planning against staying relaxed
- **Maze:** procedural recursive-backtracker, 12×12 or 16×16 cells, 5–8 carrots scattered, one goal area
- **OO → gameplay:**
  - Movement speed scales with OO: full speed at ≥ 80, slow walk at 40–60, stationary tremble below 20
  - View radius scales with OO: 5 cells at high, 1 cell at very low
  - Carrot pickup: "crunch" SFX, small hop animation, local brightness bump for 2s as a micro-reinforcement
- **Run end:** reach goal area, or engine overrun guard at `runDurationSec × 2`
- **Run report metrics:**

```
carrotsEaten: number
cellsVisited: number
reachedGoal: boolean
avgMovementSpeed: number     // 0..1
stillTimeSec: number         // seconds spent stationary (OO < 20)
backtrackCount?: number      // manual mode only
avgDecisionIntervalMs?: number  // manual mode only
```

---

## 9. Theme system

### 9.1 Theme structure

```ts
interface Theme {
  id: 'papercut' | 'ghibli' | 'geometric';
  name: Record<Lang, string>;
  preview: string;
  palette: Record<string, string>;
  typography: { display: string; body: string };
  bgmUrl: string;
  sfx: Record<string, string>;
  sprites: {
    plane: { body: string; trail: string; cloud: string[]; bird: string };
    golf:  { ball: string; club: string; terrain: string[]; flag: string };
    maze:  { rabbit: string[]; carrot: string; wall: string[]; goal: string };
  };
}
```

### 9.2 Three themes

| Theme | Aesthetic | Palette direction | Target audience | Bundle |
|---|---|---|---|---|
| **papercut** | Flat colour blocks, hard edges, paper texture | Warm cream background, high-saturation red / blue / green accents | Children, East-Asian visual language | ~500 KB |
| **ghibli** | Soft brushwork, rich light, natural tones | Pastel sky blue, forest green, warm yellow | Adult relaxation, aesthetic preference | ~700 KB |
| **geometric** (v1.1) | Pure geometric shapes, minimal, cold | Monochrome + one accent | Clinical / low-distraction environments | ~200 KB |

**v1 ships papercut + ghibli.** geometric is deferred.

### 9.3 Runtime switching

- `ThemeProvider` (React context) holds the current theme id
- Switching is only allowed in the wizard (Step 1 top-right control) and on the session report screen — not during active runs, because theme change triggers a game re-mount
- Each theme chunk is a separate dynamic import (Vite `manualChunks` or `import('./themes/<id>')`), loaded on demand
- First theme switch shows a brief loading spinner
- Theme id is written into `SessionReport.themeId` for research comparison

---

## 10. Session report and upload

### 10.1 `SessionReport` shape

```ts
interface SessionReport {
  gameId: 'plane' | 'golf' | 'maze';
  gameMode: string;
  themeId: Theme['id'];
  startedAt: number;
  endedAt: number;
  plannedDurationSec: 300 | 600 | 900 | 1200;
  actualDurationSec: number;
  runs: RunResult[];
  validRunsCount: number;
  avgOO: number;                         // average OO during RUN ACTIVE only
  nfbSettingsSnapshot: {
    indicators: NfbIndicator[];
    difficultyLevel: number;
    persistenceLevel: number;
    qualitySensitivity: number;
  };
}
```

### 10.2 Upload flow

1. On `onSessionComplete`, `GameSessionController` (main window) builds the `SessionReport`.
2. `services/gameSessionApi.ts`:
   - `POST /sessions/:id/upload-csv` (multipart) — raw run data as JSON, stored as R2 `session-files/{sid}.csv` (schema accepts any bytes)
   - `PUT /sessions/:id/result` — `{ results: <SessionReport>, report_html: <rendered HTML> }`
3. On success: clear the local IndexedDB pending record.
4. On failure: keep in IndexedDB `pendingGameSessions` store; next `GameControlView` mount flushes the queue and shows a "N pending uploads" badge.

### 10.3 Unload handling

- `beforeunload` handler inside `GameSessionController` serialises any completed runs of the current session to `sessionStorage` (main window)
- On next game control view visit, if a pending-unfinished session is detected, show a modal: "A previous session was interrupted. Upload partial results?" with upload / discard options

---

## 11. Error handling summary

### 11.1 Device / signal

| Event | Action |
|---|---|
| Hard disconnect | Auto-pause, toast, user resume |
| 30s silence | Same |
| Live poor quality | No interruption, HUD turns red, marked invalid at run end |
| FTDI not connected at all | `GameControlView` shows "please connect device" banner, cannot enter wizard |

### 11.2 Game / render / subject window

| Event | Action |
|---|---|
| Game overruns (`runDurationSec × 2`) | Main window posts `runForceEnd`, synthesises zeroed RunResult, logs error, continues |
| `manifest.load()` or factory throws (subject window) | Subject posts error event, main shows "failed to load game" modal, retry button, back to wizard |
| WebGL context lost (subject window) | Subject window shows "rendering context lost" with reload button; main window is notified via missing heartbeat and pauses |
| Theme dynamic import failure (subject window) | Fallback to papercut, main logged via channel |
| Subject window closed mid-session (user or crash) | Main window detects via `subjectClosing` OR lost heartbeat (5s), enters `SUBJECT LOST`, auto-pause, therapist HUD shows "Reopen subject window" button |
| Subject window reopened after loss | New subject tab posts `subjectReady`, main resends `loadGame` + `themeChange`, resumes at the start of the current run (not mid-run — would be misleading) |
| Pop-up blocker prevents `window.open` | Main shows a banner "Please allow pop-ups for SoraMynd and click Open subject window again" |
| Stale subject tab after code push (protocol mismatch) | Main sees different `protocolVersion` in `subjectReady`, prompts therapist to reload the subject tab |
| Pause > 5 min | Auto-abort session, attempt upload of completed runs |

### 11.3 Persistence / network

| Event | Action |
|---|---|
| Upload failure | Queue in IndexedDB, "saved locally, will retry" toast, flush on next `GameControlView` mount |
| IndexedDB write failure | Fallback to localStorage (single record); if both fail, error modal |
| User closes browser mid-session | `beforeunload` serialises to `sessionStorage`; resume modal on next visit |

### 11.4 NFB settings

| Event | Action |
|---|---|
| No stored settings (first-ever visit) | Load a built-in default preset (EEG #1 Fz_Beta/Theta, diff=3, persist=3, sensitivity=3) |
| Stored JSON invalid / schema mismatch | Fallback to default + toast "settings reset due to format mismatch" |
| Zero enabled indicators at session start | Wizard Start button disabled with inline hint |

---

## 12. Testing

### 12.1 Unit tests (vitest)

- `utils/nfbFormulas.ts` — edge cases for `computeTA`, `computeOO`, `computeTickBool`; byte-equal regression vs documented formula fixture
- `services/nfbSettingsStore.ts` — round-trip, schema validation, fallback
- `services/gameSessionApi.ts` — happy path upload, failure → pending queue, queue flush
- Per-game pure logic:
  - Plane `terrain.generateValley(seed, length)` — deterministic output for fixed seed
  - Golf `physics.simulateShot(chargeLevel, angle)` — stable trajectory
  - Maze `generator.build(w, h, seed)` — every cell reachable (connectivity check)

### 12.2 React integration tests (RTL)

- `GameSessionController` state machine transitions (IDLE → CONNECTING → PREVIEW → RUN ACTIVE → RUN REST → SESSION REPORT)
- `SUBJECT LOST` branch: simulated heartbeat timeout pauses, resume restores
- Pause suspends OO broadcast and subtracts time; resume continues
- Time-up soft behaviour (does not cut mid-run)
- Run overrun guard triggers after `runDurationSec × 2`
- `NfbSettingsPanel` read/write round-trip with localStorage
- Wizard flow: empty settings → Start disabled → enable indicator → open subject → Start enabled → controller transitions
- `gameChannel` mock: main posts messages, subject receives in order with no drops

### 12.3 Game behaviour tests (headless Pixi, subject window)

A `mockOOStream(pattern)` helper pushes a scripted OO sequence directly into each game instance (bypassing the channel) and asserts internal state fields (no canvas rendering):

```ts
const pattern = [
  { sec: 0, oo: 0 },
  { sec: 10, oo: 80 },
  { sec: 20, oo: 40 },
  { sec: 30, oo: 90 },
];
```

### 12.4 Manual regression — SoraMynd existing flow (zero regression)

Before every release:

- [ ] TrainingView 5-minute session: visual mask opacity tracks OO
- [ ] Audio volume tracks OO
- [ ] Difficulty / persistence sliders live update
- [ ] Feedback window open / close
- [ ] Indicator enable / disable / threshold drag / direction flip
- [ ] **Pre- vs post-change OO CSV byte-equal comparison** on the same recorded EEG file
- [ ] localStorage `steeg_nfb_settings` written correctly after TrainingView changes

### 12.5 Manual regression — new game flow

- [ ] Connect device → Games tab → pick Plane auto → Open subject window → Start → 5 min → full session → upload success
- [ ] Same for Golf auto / Golf manual / Maze auto / Maze manual
- [ ] Subject window dragged to second monitor, Fullscreen API engaged
- [ ] Signal disconnect mid-run → auto-pause → reconnect → resume
- [ ] Poor-quality run marked invalid in report, not counted in stats
- [ ] Theme switch during PREVIEW triggers subject-window re-mount, correct assets load
- [ ] Close browser mid-session → reopen → "unfinished session" modal
- [ ] Settings changed in TrainingView then switch to Games → new settings visible in wizard
- [ ] Children scenario: 15 min session, 4 runs, rest screens smooth

### 12.6 Manual regression — dual-window specific

- [ ] Subject window closed mid-run → main auto-pause → Reopen button restores at start of current run
- [ ] Subject window reloaded mid-run → main detects loss, same recovery path
- [ ] Main window reloaded mid-run → both windows reset cleanly, unfinished-session modal appears
- [ ] Pop-up blocker on → clear banner and recovery path
- [ ] Keyboard input in subject window (Golf manual space / Maze manual arrows) drives the game and appears in main-window session log
- [ ] BroadcastChannel message latency under load (10 min continuous session, no dropped `oo` events)
- [ ] Main window tab backgrounded → subject window keeps rendering (must work with therapist's multi-monitor workflow)

### 12.7 Performance targets

| Metric | Target | How |
|---|---|---|
| Game control view first load (main window, control panel only) | < 0.8s @ fast 3G | Lighthouse |
| Subject window first load (engine + one theme) | < 1.5s @ fast 3G | Lighthouse |
| Theme switch load | < 2s | `performance.now()` markers |
| In-run FPS (subject window) | 60 fps M1 Mac, 30 fps 2018 iPad | DevTools perf panel |
| Main OO tick → subject-window on-screen reaction latency | < 120ms (includes BroadcastChannel hop) | instrumented |
| `oo` messages delivered per run | 100% (no drops across 10-min runs) | channel sequence numbers |
| Session upload p95 | < 3s | backend api log |
| 20 subject-window open/close cycles | zero WebGL context leaks / stable memory | `about:gpu`, memory profiler |

---

## 13. Milestones

### M1 — Non-invasive foundation + dual-window shell + Plane (3.5 weeks, combined per user decision)

- `utils/nfbFormulas.ts` + unit tests
- `services/nfbSettingsStore.ts` + unit tests
- `services/gameChannel.ts` (BroadcastChannel wrapper, typed message union, heartbeat)
- `services/gameSessionApi.ts` (ported from sgimacog-web's `sessionApi.ts`)
- TrainingView one-line additive `useEffect` → localStorage
- `components/shared/QualityPill.tsx`
- `hooks/useGameOverlayOpacity.ts` + unit tests
- `components/views/GameControlView.tsx` shell, Sidebar entry
- `game/Game.ts` interface
- `game/control/GameSessionController.ts` state machine incl. `SUBJECT LOST` handling
- `game/control/sessionWizard/` three steps (wizard + active HUD)
- `game/control/OpenSubjectWindowButton.tsx`, `SubjectWindowStatus.tsx`, `TherapistHud.tsx`
- **New Vite entry:** `nfb-game.html` at project root (NOT inside `public/` — Vite multi-entry HTML must sit next to `index.html`), `src/gameWindow.tsx`, `vite.config.ts` `rollupOptions.input`
- `game/subject/SubjectWindowRoot.tsx` + `GameEngine.ts` + `pixiBootstrap.ts` + Pixi v8 integration
- `game/subject/InputCapture.ts` (keyboard → channel)
- `game/themes/papercut/` (single theme only for M1)
- `game/games/plane/` complete
- `game/control/sessionReport.tsx` (therapist session report view)
- Upload flow with IndexedDB pending queue (main window)
- Manual regression — TrainingView zero-regression gate
- Manual regression — dual-window flow (open, reload subject, kill subject, pop-up blocker)
- Deploy to staging, internal clinician dogfood

### M2 — Golf (1.5 weeks)

- `game/games/golf/physics.ts` with planck.js dynamic import
- `game/games/golf/GolfGame.ts` charge / release logic
- 9 procedural holes
- Auto and manual modes
- Subject-window `InputCapture` for Space / click / arrow forwarding over `gameChannel`
- Unit + integration tests
- Internal dogfood

### M3 — Maze (1.5 weeks)

- `game/games/maze/generator.ts` (recursive backtracker + connectivity verification)
- `game/games/maze/MazeGame.ts` with view fog, auto pathfinding, manual direction
- Carrot / goal / rabbit animations
- Auto and manual modes
- Unit + integration tests
- Internal dogfood

### M4 — Second theme + report polish (1 week)

- `game/themes/ghibli/` complete assets
- Runtime theme switching test across all three games
- Session report HTML generator (run-by-run table, OO curves, mode / theme metadata)
- artisebio admin UI for game sessions — tracked as a follow-up, **not v1 critical path**

### M5 — Release and monitoring (0.5 week)

- Performance testing and optimisation
- Error telemetry wiring (if SoraMynd has any)
- Version bump to `v0.8.0 — GamePack integration`
- Production deploy
- One-week observation window: error rates, upload success, usage

**Total v1 timeline:** ~7 weeks (M1 grew by ~0.5 week to accommodate the dual-window shell).

---

## 14. Explicitly out of v1 scope

- Third theme `geometric` → v1.1
- Plane power-ups, Plane dual-task variants → v1.1
- Basketball and Racing games (interface reserves a slot)
- Two-player modes (original racing had P2)
- Cross-session progress curves and long-term personal baseline — depends on the planned z-score database project
- Achievements / badges / leaderboards (inappropriate for therapeutic application)
- Original audio composition and SFX recording — v1 uses CC0 assets
- Languages beyond zh / en
- Offline PWA — v1 still requires network for session upload

---

## 15. Open items to decide during implementation

Deliberately not locked at design time; to be addressed in the implementation plan or during M1:

- Exact lint / CI mechanism to enforce the "no React inside `*Game.ts`" rule (ESLint `no-restricted-imports` on React packages scoped to `game/games/**` is the candidate)
- Exact IndexedDB schema version and migration path for `pendingGameSessions`
- Whether `SessionReport` includes the full `ooSeries` (Float32Array) or a downsampled summary — weighs bundle size of stored reports against research value
- Keyboard event capture scope in the subject window: `window` vs `document.body` vs the Pixi container (Pixi container is cleaner but may miss events if focus is lost)
- Whether to preload the next run's procedural content during RUN REST for smoother transitions
- `gameChannel` message compression for long `oo` streams — the naive 1-message-per-second is fine for v1 (~600 msgs per 10-min run), but if we add sub-second ticks we may need batching
- Whether the subject window needs a "please focus this window" prompt if the therapist accidentally clicks back to the main window and keyboard input stops reaching the subject tab
