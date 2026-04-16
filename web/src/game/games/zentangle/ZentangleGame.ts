import {
  Container,
  Graphics,
  type Application,
  type Ticker,
} from 'pixi.js';
import type { GameInputEvent, GameInstance, GameStatsListener, RunResult, Theme } from '../../Game';
import {
  PATTERN_NAMES,
  buildSamples,
  generatePattern,
  type PatternName,
  type Sample,
  type Stroke,
} from './patterns';

export interface ZentangleGameArgs {
  app: Application;
  stage: Container;
  theme: Theme;
  modeId: string;
  /** Target coverage fraction 0–100; run ends when covered ≥ this percent. */
  targetPct: number;
  /**
   * When true the template is shown at a fixed opacity regardless of OO —
   * biofeedback is disabled, the patient simply traces the pattern.
   */
  noFeedback?: boolean;
  onStats?: GameStatsListener;
}

const SAMPLE_SPACING = 9;
const BRUSH_WIDTH = 3;
const USER_STROKE_COLOR = 0x2a1f14;
const TEMPLATE_STROKE_COLOR = 0x2a1f14;
const PANEL_BG_COLOR = 0xfffaf0;
const PANEL_BORDER_COLOR = 0x2a1f14;

function patternFromModeId(modeId: string): PatternName {
  if (PATTERN_NAMES.includes(modeId as PatternName)) return modeId as PatternName;
  return 'mandala';
}

// Map OO (0..100) to template alpha. Matches the standalone demo so the
// therapist preview and live NFB drive behave identically.
function templateAlphaFromOO(oo: number): number {
  const n = Math.max(0, Math.min(100, oo));
  return 0.03 + (n / 100) * 0.30;
}

// Fixed alpha used in no-feedback mode (pattern always clearly visible).
const NO_FEEDBACK_ALPHA = 0.22;

// Coverage radius is brush-width sensitive but never narrower than a
// finger-tip; players rarely land exactly on the guide lines.
function coverageRadiusFor(brush: number): number {
  return Math.max(brush * 1.6, 16);
}

export function createZentangleGame(args: ZentangleGameArgs): GameInstance {
  const { app, stage, modeId, onStats } = args;
  const noFeedback = args.noFeedback ?? false;
  const completeFraction = Math.max(0.05, Math.min(1, args.targetPct / 100));

  const root = new Container();
  stage.addChild(root);

  // Full-screen dim backdrop so the paper panel pops against any theme.
  const backdrop = new Graphics();
  root.addChild(backdrop);

  const panelBg = new Graphics();
  root.addChild(panelBg);

  const templateLayer = new Graphics();
  const userLayer = new Graphics();
  root.addChild(templateLayer);
  root.addChild(userLayer);

  let panelX = 0;
  let panelY = 0;
  let panelW = 0;
  let panelH = 0;

  let currentPattern: PatternName = patternFromModeId(modeId);
  let strokes: Stroke[] = [];
  let samples: Sample[] = [];
  let coveredCount = 0;

  let oo = 0;
  let runIndex = -1;
  let runStarted = 0;
  let runFinished = false;
  let finishCb: ((r: RunResult) => void) | null = null;
  let paused = false;
  let rlSeries: number[] = [];
  let lastAccumSec = 0;

  // Pointer state on the canvas (native DOM events). We keep a map of
  // active pointers so multi-touch still works, but only the first
  // pointer that lands in the panel is tracked per-stroke.
  const activePointers = new Map<number, { x: number; y: number }>();

  const canvas = app.canvas as HTMLCanvasElement;
  // Keep cursor visible and give touch devices a non-scrolling surface.
  const prevTouchAction = canvas.style.touchAction;
  const prevCursor = canvas.style.cursor;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'crosshair';

  function layout() {
    const w = app.screen.width;
    const h = app.screen.height;
    const size = Math.min(w, h) * 0.92;
    panelW = size;
    panelH = size;
    panelX = (w - size) / 2;
    panelY = (h - size) / 2;

    backdrop.clear();
    backdrop.rect(0, 0, w, h).fill({ color: 0x0a0f1a, alpha: 0.55 });

    panelBg.clear();
    panelBg.roundRect(panelX, panelY, panelW, panelH, 18)
      .fill({ color: PANEL_BG_COLOR, alpha: 1 })
      .stroke({ color: PANEL_BORDER_COLOR, alpha: 0.15, width: 2 });
  }

  function drawTemplate() {
    templateLayer.clear();
    const alpha = noFeedback ? NO_FEEDBACK_ALPHA : templateAlphaFromOO(oo);
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      templateLayer.moveTo(stroke[0].x + panelX, stroke[0].y + panelY);
      for (let i = 1; i < stroke.length; i++) {
        templateLayer.lineTo(stroke[i].x + panelX, stroke[i].y + panelY);
      }
      templateLayer.stroke({
        color: TEMPLATE_STROKE_COLOR,
        alpha,
        width: 2.2,
        cap: 'round',
        join: 'round',
      });
    }
  }

  function regeneratePattern() {
    strokes = generatePattern(panelW, panelH, currentPattern);
    samples = buildSamples(strokes, SAMPLE_SPACING);
    coveredCount = 0;
    userLayer.clear();
    drawTemplate();
  }

  function markCoverage(px: number, py: number) {
    const radius = coverageRadiusFor(BRUSH_WIDTH);
    const r2 = radius * radius;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.covered) continue;
      const dx = s.x - px;
      const dy = s.y - py;
      if (dx * dx + dy * dy <= r2) {
        s.covered = true;
        coveredCount++;
      }
    }
  }

  function getLocalPanelPoint(e: PointerEvent): { x: number; y: number } | null {
    // clientX/Y → canvas-local → panel-local. The Pixi renderer uses CSS
    // pixel coordinates in app.screen, so the CSS-relative bounding rect
    // is the right reference.
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * app.screen.width;
    const cy = ((e.clientY - rect.top) / rect.height) * app.screen.height;
    const lx = cx - panelX;
    const ly = cy - panelY;
    if (lx < 0 || ly < 0 || lx > panelW || ly > panelH) return null;
    return { x: lx, y: ly };
  }

  function drawUserSegment(a: { x: number; y: number }, b: { x: number; y: number }) {
    userLayer.moveTo(a.x + panelX, a.y + panelY);
    userLayer.lineTo(b.x + panelX, b.y + panelY);
    userLayer.stroke({
      color: USER_STROKE_COLOR,
      alpha: 1,
      width: BRUSH_WIDTH,
      cap: 'round',
      join: 'round',
    });
  }

  const onPointerDown = (e: PointerEvent) => {
    if (paused || runFinished || runIndex < 0) return;
    const local = getLocalPanelPoint(e);
    if (!local) return;
    e.preventDefault();
    activePointers.set(e.pointerId, local);
    drawUserSegment(local, local);
    markCoverage(local.x, local.y);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onPointerMove = (e: PointerEvent) => {
    const last = activePointers.get(e.pointerId);
    if (!last) return;
    const local = getLocalPanelPoint(e);
    if (!local) return;
    e.preventDefault();
    drawUserSegment(last, local);
    // Interpolate marker points so fast swipes still register coverage.
    const dx = local.x - last.x;
    const dy = local.y - last.y;
    const dist = Math.hypot(dx, dy);
    const step = 3;
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      markCoverage(last.x + dx * t, last.y + dy * t);
    }
    activePointers.set(e.pointerId, local);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);

  let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const resizeListener = () => {
    if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      resizeDebounceTimer = null;
      layout();
      regeneratePattern();
    }, 150);
  };
  app.renderer.on('resize', resizeListener);

  layout();
  regeneratePattern();

  const tick = (_ticker: Ticker) => {
    if (paused) return;
    if (runIndex < 0 || runFinished) {
      emitStats();
      return;
    }
    const now = performance.now();
    const elapsedMs = now - runStarted;
    const nowSec = Math.floor(elapsedMs / 1000);
    if (nowSec > lastAccumSec) {
      rlSeries.push(oo);
      lastAccumSec = nowSec;
    }
    emitStats();

    const pct = samples.length ? coveredCount / samples.length : 0;
    const complete = pct >= completeFraction;

    if (complete && finishCb) {
      runFinished = true;
      const result: RunResult = {
        runIndex,
        startedAt: runStarted,
        durationMs: elapsedMs,
        rlSeries,
        qualityPercent: 0,
        isValid: true,
        gameSpecific: {
          coveragePct: Math.round(pct * 1000) / 10,
          targetPct: args.targetPct,
          samplesTotal: samples.length,
        },
      };
      const cb = finishCb;
      finishCb = null;
      cb(result);
    }
  };

  function emitStats() {
    if (!onStats) return;
    const pct = samples.length ? (coveredCount / samples.length) * 100 : 0;
    onStats({
      // Show 0 before the run starts so the HUD number doesn't flicker from
      // noisy EEG OO data — feedback is only meaningful during an active run.
      rl: runIndex >= 0 ? Math.round(oo) : 0,
      coveragePct: Math.round(pct * 10) / 10,
    });
  }

  app.ticker.add(tick);

  return {
    startRun(idx, onFinish) {
      runIndex = idx;
      runStarted = performance.now();
      runFinished = false;
      rlSeries = [];
      lastAccumSec = 0;
      finishCb = onFinish;
      activePointers.clear();
      // Each run picks the next pattern so multi-run sessions cycle through
      // the three layouts instead of repeating the wizard-selected mode.
      if (idx > 0) {
        const startIdx = PATTERN_NAMES.indexOf(patternFromModeId(modeId));
        currentPattern = PATTERN_NAMES[(startIdx + idx) % PATTERN_NAMES.length];
      } else {
        currentPattern = patternFromModeId(modeId);
      }
      regeneratePattern();
    },
    setRL(next) {
      oo = Math.max(0, Math.min(100, next));
      // Only redraw when a run is active — before training starts, OO may be
      // noisy EEG data, causing the template alpha to flicker on every 100 ms
      // broadcast even though the player hasn't started yet.
      if (!noFeedback && runIndex >= 0) drawTemplate();
    },
    onInput(_event: GameInputEvent) {
      /* Zentangle is pointer-driven; no remote input events in M1. */
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    destroy() {
      if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
      app.ticker.remove(tick);
      app.renderer.off('resize', resizeListener);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.style.touchAction = prevTouchAction;
      canvas.style.cursor = prevCursor;
      stage.removeChild(root);
      root.destroy({ children: true });
      finishCb = null;
    },
  };
}
