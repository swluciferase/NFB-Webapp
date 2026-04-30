import {
  Container,
  Graphics,
  Text,
  TextStyle,
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
  /** Freeform palette ID — used only when modeId === 'freeform'. */
  paletteId?: string;
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

// ── Freeform palette definitions ──────────────────────────────────────────

interface Palette {
  lowR: number; lowG: number; lowB: number;
  highR: number; highG: number; highB: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

const PALETTE_DEFS: Record<string, { low: string; high: string }> = {
  // ── Gradient (同色調漸變) ──
  ocean:  { low: '#1a3a5c', high: '#7ee8c6' },
  sunset: { low: '#4a1942', high: '#ffd166' },
  forest: { low: '#1a2e1a', high: '#88e088' },
  sakura: { low: '#3d1f3d', high: '#ffb7c5' },
  aurora: { low: '#0a1a3a', high: '#c4a0ff' },
  ember:  { low: '#2a0a0a', high: '#ff6644' },
  // ── Contrast (對比色) ──
  fire_ice:    { low: '#2244cc', high: '#ff3322' },
  coral_teal:  { low: '#008080', high: '#ff6f61' },
  violet_lime: { low: '#88cc22', high: '#8833cc' },
  gold_navy:   { low: '#0f1d4a', high: '#ffc832' },
  rose_cyan:   { low: '#00cccc', high: '#e63370' },
};

function getPalette(id: string): Palette {
  const def = PALETTE_DEFS[id] ?? PALETTE_DEFS.ocean;
  const lo = hexToRgb(def.low);
  const hi = hexToRgb(def.high);
  return { lowR: lo.r, lowG: lo.g, lowB: lo.b, highR: hi.r, highG: hi.g, highB: hi.b };
}

function lerpColor(pal: Palette, t: number): number {
  const f = Math.max(0, Math.min(1, t));
  const r = Math.round(pal.lowR + (pal.highR - pal.lowR) * f);
  const g = Math.round(pal.lowG + (pal.highG - pal.lowG) * f);
  const b = Math.round(pal.lowB + (pal.highB - pal.lowB) * f);
  return (r << 16) | (g << 8) | b;
}

// ── Freeform run duration (used only if controller doesn't end it) ────────
const FREEFORM_MAX_RUN_MS = 1200_000; // 20 min safety cap

export function createZentangleGame(args: ZentangleGameArgs): GameInstance {
  const { app, stage, modeId, onStats } = args;
  const isFreeform = modeId === 'freeform';
  const noFeedback = args.noFeedback ?? false;
  const completeFraction = Math.max(0.05, Math.min(1, args.targetPct / 100));
  const palette = isFreeform ? getPalette(args.paletteId ?? 'ocean') : null;

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
  /** Planned run duration in ms — set by startRun for freeform time-based end. */
  let runDurationMs = FREEFORM_MAX_RUN_MS;

  // Pointer state on the canvas (native DOM events). We keep a map of
  // active pointers so multi-touch still works, but only the first
  // pointer that lands in the panel is tracked per-stroke.
  const activePointers = new Map<number, { x: number; y: number }>();

  const canvas = app.canvas as HTMLCanvasElement;
  // Pen-shaped cursor (SVG, 24×24, hotspot at the tip 2,22). Browsers fall
  // back to crosshair if the data-URI fails to load.
  const PEN_CURSOR =
    "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M2 22 L5 21 L19 7 L17 5 L3 19 Z' fill='%232a1f14' stroke='white' stroke-width='1.2' stroke-linejoin='round'/%3E%3Ccircle cx='2.5' cy='21.5' r='0.8' fill='white'/%3E%3C/svg%3E\") 2 22, crosshair";
  // The subject window sets `body { cursor: none }` for immersion in plane /
  // baseball / karesansui. Zentangle needs the cursor visible so the patient
  // can see where their pen will draw — override on both body and canvas.
  const prevTouchAction = canvas.style.touchAction;
  const prevCursor = canvas.style.cursor;
  const prevBodyCursor = document.body.style.cursor;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = PEN_CURSOR;
  document.body.style.cursor = PEN_CURSOR;

  // ── End overlay ─────────────────────────────────────────────────────────
  const endOverlay = new Container();
  endOverlay.visible = false;
  root.addChild(endOverlay);

  const endBg = new Graphics();
  endOverlay.addChild(endBg);

  const endTitle = new Text({
    text: '訓練完成',
    style: new TextStyle({
      fontFamily: '-apple-system, system-ui, sans-serif',
      fontSize: 32,
      fontWeight: '800',
      fill: '#ffffff',
      align: 'center',
      dropShadow: { color: '#000000', blur: 8, distance: 0, alpha: 0.5 },
    }),
  });
  endTitle.anchor.set(0.5);
  endOverlay.addChild(endTitle);

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
    if (isFreeform) return; // no template in freeform mode
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
    if (isFreeform) {
      strokes = [];
      samples = [];
      coveredCount = 0;
      userLayer.clear();
      return;
    }
    strokes = generatePattern(panelW, panelH, currentPattern);
    samples = buildSamples(strokes, SAMPLE_SPACING);
    coveredCount = 0;
    userLayer.clear();
    drawTemplate();
  }

  function markCoverage(px: number, py: number) {
    if (isFreeform) return;
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
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * app.screen.width;
    const cy = ((e.clientY - rect.top) / rect.height) * app.screen.height;
    const lx = cx - panelX;
    const ly = cy - panelY;
    if (lx < 0 || ly < 0 || lx > panelW || ly > panelH) return null;
    return { x: lx, y: ly };
  }

  /** Get the current stroke color — RL-dependent for freeform, fixed for template modes. */
  function currentStrokeColor(): number {
    if (isFreeform && palette) {
      return lerpColor(palette, oo / 100);
    }
    return USER_STROKE_COLOR;
  }

  function drawUserSegment(a: { x: number; y: number }, b: { x: number; y: number }) {
    const color = currentStrokeColor();
    userLayer.moveTo(a.x + panelX, a.y + panelY);
    userLayer.lineTo(b.x + panelX, b.y + panelY);
    userLayer.stroke({
      color,
      alpha: 1,
      width: isFreeform ? 4 : BRUSH_WIDTH,
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
      if (!isFreeform) regeneratePattern();
    }, 150);
  };
  app.renderer.on('resize', resizeListener);

  layout();
  regeneratePattern();

  /** Show photo-frame effect + "訓練完成" overlay. */
  function showEndOverlay() {
    const w = app.screen.width;
    const h = app.screen.height;

    endBg.clear();
    // Semi-transparent vignette around the canvas
    endBg.rect(0, 0, w, h).fill({ color: 0x0a0f1a, alpha: 0.45 });
    // Inner cutout revealing the artwork with a "photo frame" border
    const frameW = panelW + 24;
    const frameH = panelH + 24;
    const fx = (w - frameW) / 2;
    const fy = (h - frameH) / 2;
    // White frame border
    endBg.roundRect(fx, fy, frameW, frameH, 6)
      .fill({ color: 0xffffff, alpha: 0.95 });
    // Re-draw the panel background inside the frame (artwork is already there on userLayer)
    endBg.roundRect(fx + 12, fy + 12, panelW, panelH, 4)
      .fill({ color: PANEL_BG_COLOR, alpha: 1 });
    // Shadow under frame
    endBg.roundRect(fx + 4, fy + 4, frameW, frameH, 6)
      .fill({ color: 0x000000, alpha: 0.15 });

    // Move endBg behind artwork layers but above backdrop
    root.setChildIndex(endBg, root.getChildIndex(panelBg));

    endTitle.x = w / 2;
    endTitle.y = fy + frameH + 36;
    endOverlay.visible = true;
  }

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

    if (isFreeform) {
      // Freeform: time-based end — game self-terminates when planned duration elapses.
      if (elapsedMs >= runDurationMs && finishCb) {
        runFinished = true;
        showEndOverlay();
        const result: RunResult = {
          runIndex,
          startedAt: runStarted,
          durationMs: elapsedMs,
          rlSeries,
          qualityPercent: 0,
          isValid: true,
          gameSpecific: { freeform: true },
        };
        const cb = finishCb;
        finishCb = null;
        cb(result);
      }
      return;
    }

    // Template mode: the run continues past the target percentage — the
    // player can keep drawing until the entire template is covered.
    // End only when ≥97% of samples are hit (edge samples may be unreachable).
    const pct = samples.length ? coveredCount / samples.length : 0;
    const allCovered = pct >= 0.97;

    if (allCovered && finishCb) {
      runFinished = true;
      showEndOverlay();
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
    if (isFreeform) {
      onStats({
        rl: runIndex >= 0 ? Math.round(oo) : 0,
        // Use coveragePct = -1 as sentinel so the HUD knows it's freeform
        // (SubjectWindowRoot hides the coverage bar when coveragePct is set,
        // and we want it hidden in freeform).
      });
      return;
    }
    const pct = samples.length ? (coveredCount / samples.length) * 100 : 0;
    onStats({
      rl: runIndex >= 0 ? Math.round(oo) : 0,
      coveragePct: Math.round(pct * 10) / 10,
    });
  }

  app.ticker.add(tick);

  return {
    startRun(idx, onFinish, durationSec) {
      runIndex = idx;
      runStarted = performance.now();
      runFinished = false;
      rlSeries = [];
      lastAccumSec = 0;
      finishCb = onFinish;
      activePointers.clear();
      endOverlay.visible = false;
      runDurationMs = durationSec != null ? durationSec * 1000 : FREEFORM_MAX_RUN_MS;
      if (isFreeform) {
        userLayer.clear();
      } else {
        // Each run picks the next pattern so multi-run sessions cycle through
        if (idx > 0) {
          const startIdx = PATTERN_NAMES.indexOf(patternFromModeId(modeId));
          currentPattern = PATTERN_NAMES[(startIdx + idx) % PATTERN_NAMES.length];
        } else {
          currentPattern = patternFromModeId(modeId);
        }
        regeneratePattern();
      }
    },
    setRL(next) {
      oo = Math.max(0, Math.min(100, next));
      if (!isFreeform && !noFeedback && runIndex >= 0) drawTemplate();
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
      document.body.style.cursor = prevBodyCursor;
      stage.removeChild(root);
      root.destroy({ children: true });
      finishCb = null;
    },
  };
}
