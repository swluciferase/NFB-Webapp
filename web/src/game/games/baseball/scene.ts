import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BaseballHitKind, Theme } from '../../Game';
import type { Ballpark } from './ballparks';

export interface BaseballSceneTickParams {
  now: number;
  dt: number;
  worldW: number;
  worldH: number;
}

export interface BaseballScene {
  root: Container;
  layout(w: number, h: number, init?: boolean): void;
  tick(params: BaseballSceneTickParams): void;
  /** Animate the pitcher's wind-up + release. Called in the prep phase. */
  pitcherWindup(now: number): void;
  /** Place ball along its pitch arc toward home plate. progress 0..1 over charge. */
  setBallProgress(progress: number): void;
  /** Update the power meter fill (0..1). */
  setMeter(fraction: number): void;
  /** Trigger batter swing animation. */
  swingBat(): void;
  /** Flash a big center-screen result for ~1.5s. */
  flashResult(kind: BaseballHitKind, lang: 'zh' | 'en'): void;
  /** Controller tells the scene how many innings are in the session so the
   *  line-score header can be sized correctly. Called once per session. */
  setInningTotal(total: number): void;
  /** Update which bases are occupied by runners. Index 0=1B, 1=2B, 2=3B. */
  setRunners(runners: readonly boolean[]): void;
  /** Show a countdown number during the prep phase, or null to hide. */
  setCountdown(value: number | null): void;
  /** Trigger a 3-second ball-in-flight animation for a hit result. */
  hitBall(kind: BaseballHitKind): void;
  /** Update the line score (runs per inning) and highlight which inning
   *  column is currently in progress. `currentInning` is 1-based. */
  setLineScore(inningRuns: readonly number[], currentInning: number, currentBatter: number): void;
  /** Swap in a new batter with a handedness-flipping slide-in animation. */
  switchBatter(hand: 'L' | 'R'): void;
  /** Hide the in-scene scoreboard (used in dual mode where React renders its own). */
  hideScoreboard(): void;
  /** Swap pitcher/batter uniform colors for dual mode half-inning changes. */
  setTeamColors(isBottom: boolean): void;
  /** Show a "比賽結束" end overlay with team scores. */
  showEndOverlay(teamA: string, scoreA: number, teamB: string, scoreB: number): void;
  destroy(): void;
}

const HIT_ANIM_MS = 3000;

export function buildBaseballScene(theme: Theme, ballpark: Ballpark): BaseballScene {
  const visual = theme.visual;
  const root = new Container();

  // Layers back→front. The stadium is drawn from behind home plate looking
  // toward the outfield. Scale on pitcher/batter fakes depth.
  const layers = {
    sky: new Container(),
    sun: new Container(),
    cloudFar: new Container(),
    mtnFar: new Container(),
    mtnMid: new Container(),
    stands: new Container(),
    wall: new Container(),
    outfield: new Container(),
    infield: new Container(),
    bases: new Container(),
    pitcher: new Container(),
    ball: new Container(),
    batter: new Container(),
    swing: new Container(),
    haze: new Container(),
    meter: new Container(),
    scoreboard: new Container(),
    resultFlash: new Container(),
    vignette: new Container(),
    endOverlay: new Container(),
  };
  for (const k of Object.keys(layers) as Array<keyof typeof layers>) {
    root.addChild(layers[k]);
  }
  // Far-cloud blur is applied per-sprite in layout() to avoid per-frame
  // filter-texture reallocation as clouds scroll (PIXI v8 container-filter issue).

  // Static graphics (rebuilt on layout)
  const skyG = new Graphics();
  const sunG = new Graphics();
  const sunGlowG = new Graphics();
  const sunRaysG = new Graphics();
  // No BlurFilter on sunGlowG: sunRaysG rotates every frame in the same
  // Container, forcing the filter to re-run every frame — major GPU cost.
  // The overlapping alpha circles produce a soft glow without GPU blur.
  const hazeG = new Graphics();
  const vignetteG = new Graphics();

  layers.sky.addChild(skyG);
  layers.sun.addChild(sunGlowG, sunRaysG, sunG);
  layers.haze.addChild(hazeG);
  layers.vignette.addChild(vignetteG);

  // Parallax mountains behind stands for depth
  let mtnFarG: Graphics | null = null;
  let mtnMidG: Graphics | null = null;
  let standsG: Graphics | null = null;
  let wallG: Graphics | null = null;
  let outfieldG: Graphics | null = null;
  let infieldG: Graphics | null = null;
  let basesG: Graphics | null = null;

  // Base runner graphics — persistent, redrawn whenever runner state changes.
  const runnersG = new Graphics();
  layers.bases.addChild(runnersG);
  let sceneRunners: [boolean, boolean, boolean] = [false, false, false];

  // Cloud sprites
  interface CloudSprite { g: Graphics; depth: number; }
  const clouds: CloudSprite[] = [];

  // Pitcher
  const pitcher = new Container();
  const pitcherBody = new Graphics();
  pitcher.addChild(pitcherBody);
  layers.pitcher.addChild(pitcher);

  // Batter
  const batter = new Container();
  const batterBody = new Graphics();
  const batterBat = new Graphics();
  batter.addChild(batterBody);
  batter.addChild(batterBat);
  layers.batter.addChild(batter);

  // Ball
  const ball = new Container();
  const ballG = new Graphics();
  ball.addChild(ballG);
  layers.ball.addChild(ball);

  // Power meter (vertical gauge on left side)
  const meter = new Container();
  const meterBg = new Graphics();
  const meterFill = new Graphics();
  const meterLabel = new Text({
    text: 'POWER',
    style: new TextStyle({
      fill: 0xe4ecfa,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 2,
    }),
  });
  meter.addChild(meterBg, meterFill, meterLabel);
  layers.meter.addChild(meter);

  // Scoreboard (top-center panel) — classic baseball line score:
  //   局 │  1   2   3   4   5   6   7   8   9   R
  //   分 │  0   1   -   -   -   -   -   -   -   1
  // Each cell is its own Text so the current inning column can be tinted
  // differently from the idle columns.
  const scoreboard = new Container();
  const scoreboardBg = new Graphics();
  layers.scoreboard.addChild(scoreboard);
  scoreboard.addChild(scoreboardBg);

  const SCOREBOARD_FONT_SIZE = 24;
  const SCOREBOARD_LABEL_FONT_SIZE = 20;

  // Colors — three distinct hues so inning numbers, runs, and the active
  // column are each unambiguous.
  const COLOR_INNING_IDLE = 0x6b7a9a;   // muted blue-gray (past / future)
  const COLOR_INNING_ACTIVE = 0x7ee8c6; // teal (current inning column)
  const COLOR_RUN_IDLE = 0xffd166;      // gold (runs row)
  const COLOR_RUN_ACTIVE = 0xffe27a;    // brighter gold on the current column
  const COLOR_TOTAL = 0xe4ecfa;         // white (R total column)
  const COLOR_LABEL_INN = 0xc8d4ee;     // label "局"
  const COLOR_LABEL_RUN = 0xffd166;     // label "分" matches run color

  const innLabelText = new Text({
    text: '局',
    style: new TextStyle({
      fill: COLOR_LABEL_INN,
      fontSize: SCOREBOARD_LABEL_FONT_SIZE,
      fontWeight: '800',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }),
  });
  const runLabelText = new Text({
    text: '分',
    style: new TextStyle({
      fill: COLOR_LABEL_RUN,
      fontSize: SCOREBOARD_LABEL_FONT_SIZE,
      fontWeight: '800',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }),
  });
  scoreboard.addChild(innLabelText, runLabelText);

  // Scoreboard cached state — the scene keeps its own copy so layout() and
  // per-setter calls can redraw the panel without receiving the full
  // aggregate every tick. Declared before rebuildScoreboardCells so its
  // first call (at init) sees a defined sbInningTotal.
  let sbInningTotal = 9;
  let sbInningRuns: number[] = [];
  // 1-based index of the inning currently being played. 0 means "none yet"
  // (used before the first pitch) and suppresses the highlight.
  let sbCurrentInning = 0;
  // Current at-bat position within the inning (1-based). 0 means "none".
  let sbCurrentBatter = 0;

  // Per-column cells, one Text per cell. Rebuilt whenever sbInningTotal
  // changes. Layout (column X positions) happens in drawScoreboard.
  let inningHeaderCells: Text[] = [];
  let inningValueCells: Text[] = [];
  let rHeaderText: Text | null = null;
  let rValueText: Text | null = null;
  let batHeaderText: Text | null = null;
  let batValueText: Text | null = null;
  const COLOR_BAT = 0xa0d8ff;

  function makeCellStyle(fill: number): TextStyle {
    return new TextStyle({
      fill,
      fontSize: SCOREBOARD_FONT_SIZE,
      fontWeight: '800',
      fontFamily: 'ui-monospace, Menlo, monospace',
    });
  }

  function rebuildScoreboardCells() {
    for (const t of inningHeaderCells) t.destroy();
    for (const t of inningValueCells) t.destroy();
    if (rHeaderText) { rHeaderText.destroy(); rHeaderText = null; }
    if (rValueText) { rValueText.destroy(); rValueText = null; }
    if (batHeaderText) { batHeaderText.destroy(); batHeaderText = null; }
    if (batValueText) { batValueText.destroy(); batValueText = null; }
    inningHeaderCells = [];
    inningValueCells = [];

    for (let i = 0; i < sbInningTotal; i++) {
      const header = new Text({
        text: String(i + 1),
        style: makeCellStyle(COLOR_INNING_IDLE),
      });
      header.anchor.set(0.5, 0);
      const value = new Text({
        text: '-',
        style: makeCellStyle(COLOR_RUN_IDLE),
      });
      value.anchor.set(0.5, 0);
      scoreboard.addChild(header, value);
      inningHeaderCells.push(header);
      inningValueCells.push(value);
    }
    rHeaderText = new Text({ text: 'R', style: makeCellStyle(COLOR_TOTAL) });
    rHeaderText.anchor.set(0.5, 0);
    rValueText = new Text({ text: '0', style: makeCellStyle(COLOR_TOTAL) });
    rValueText.anchor.set(0.5, 0);
    scoreboard.addChild(rHeaderText, rValueText);

    batHeaderText = new Text({ text: '棒', style: makeCellStyle(COLOR_BAT) });
    batHeaderText.anchor.set(0.5, 0);
    batValueText = new Text({ text: '-', style: makeCellStyle(COLOR_BAT) });
    batValueText.anchor.set(0.5, 0);
    scoreboard.addChild(batHeaderText, batValueText);
  }
  rebuildScoreboardCells();

  const wallText = new Text({
    text: `${ballpark.wallM}m`,
    style: new TextStyle({
      fill: 0xffffff,
      fontSize: 14,
      fontWeight: '700',
      fontFamily: 'ui-monospace, Menlo, monospace',
    }),
  });
  layers.scoreboard.addChild(wallText);

  // Batter handedness + switch animation state. Default to R until the
  // game tells us otherwise via switchBatter().
  let batterHand: 'L' | 'R' = 'R';
  let batterAnimActive = false;
  let batterAnimStart = 0;

  // Team uniform colors (swapped on half-inning change in dual mode)
  // Default: pitcher=blue (Team A), batter=red (Team B)
  let pitcherJersey = 0xe4ecfa;
  let pitcherStripe = 0x58a6ff;
  let pitcherCap    = 0x1a2a44;
  let batterJersey  = 0xe63946;
  let batterStripe  = 0xf28a93;
  const BATTER_ANIM_MS = 600;

  // Result flash overlay
  const resultFlash = new Container();
  const resultBg = new Graphics();
  const resultText = new Text({
    text: '',
    style: new TextStyle({
      fill: 0xffffff,
      fontSize: 64,
      fontWeight: '900',
      letterSpacing: 3,
      align: 'center',
    }),
  });
  resultText.anchor.set(0.5);
  resultFlash.addChild(resultBg, resultText);
  resultFlash.visible = false;
  layers.resultFlash.addChild(resultFlash);

  // Countdown text (shown during the 5s prep phase).
  const countdownText = new Text({
    text: '',
    style: new TextStyle({
      fill: 0xffe27a,
      fontSize: 140,
      fontWeight: '900',
      fontFamily: 'ui-monospace, Menlo, monospace',
      stroke: { color: 0x0a0f1a, width: 8, alpha: 0.85 },
    }),
  });
  countdownText.anchor.set(0.5);
  countdownText.visible = false;
  layers.resultFlash.addChild(countdownText);
  let countdownValue: number | null = null;

  let resultFlashExpiry = 0;

  // End overlay — "比賽結束" + final score
  const endOverlay = new Container();
  const endBg = new Graphics();
  const endTitle = new Text({
    text: '比賽結束',
    style: new TextStyle({
      fill: 0xffe27a,
      fontSize: 72,
      fontWeight: '900',
      letterSpacing: 6,
      stroke: { color: 0x0a0f1a, width: 6, alpha: 0.8 },
    }),
  });
  endTitle.anchor.set(0.5);
  const endScore = new Text({
    text: '',
    style: new TextStyle({
      fill: 0xe4ecfa,
      fontSize: 36,
      fontWeight: '700',
      align: 'center',
    }),
  });
  endScore.anchor.set(0.5);
  endOverlay.addChild(endBg, endTitle, endScore);
  endOverlay.visible = false;
  layers.endOverlay.addChild(endOverlay);

  // Cached layout anchors (real diamond positions)
  let W = 0;
  let H = 0;
  let mound = { x: 0, y: 0 };
  let plate = { x: 0, y: 0 };
  let firstBase = { x: 0, y: 0 };
  let secondBase = { x: 0, y: 0 };
  let thirdBase = { x: 0, y: 0 };

  // Animation state
  let swingAngle = 0;       // current bat angle relative to neutral
  let swingImpulse = 0;     // momentary kick that decays
  let pitcherPhase = 0;     // 0..1 wind-up progress
  let pitcherActive = false;
  let currentBallProgress = 0;
  let meterFraction = 0;

  // Sun position cache (set in paintSun, read by buildSunRays)
  let sunCX = 0;
  let sunCY = 0;
  let sunR = 0;

  // Hit animation state
  let hitActive = false;
  let hitStartMs = 0;
  let hitKind: BaseballHitKind = 'whiff';

  // ---------- PAINT HELPERS ----------

  function paintSky(w: number, h: number) {
    skyG.clear();
    const BANDS = 28;
    const top = hexToRgb(visual.skyTop);
    const bot = hexToRgb(visual.skyBottom);
    for (let i = 0; i < BANDS; i++) {
      const t = i / (BANDS - 1);
      const r = Math.round(top.r + (bot.r - top.r) * t);
      const g = Math.round(top.g + (bot.g - top.g) * t);
      const b = Math.round(top.b + (bot.b - top.b) * t);
      const color = (r << 16) | (g << 8) | b;
      skyG.rect(0, (h * i) / BANDS, w, h / BANDS + 1).fill({ color });
    }
  }

  function paintSun(w: number, h: number) {
    sunCX = w * 0.78;
    sunCY = h * 0.14;
    sunR = Math.min(w, h) * 0.055;
    sunG.clear();
    sunG.circle(sunCX, sunCY, sunR).fill({ color: visual.sun });
    sunG.circle(sunCX, sunCY, sunR * 0.7).fill({ color: 0xffffff, alpha: 0.55 });
    sunGlowG.clear();
    for (let i = 0; i < 4; i++) {
      sunGlowG.circle(sunCX, sunCY, sunR * (1.4 + i * 0.6))
        .fill({ color: visual.sunGlow, alpha: 0.15 - i * 0.03 });
    }
  }

  // Build sun rays once (or on layout) as geometry centered at origin,
  // then rotate the sprite in tick() — avoids per-frame clear()+redraw.
  function buildSunRays() {
    if (sunR <= 0) return;
    sunRaysG.clear();
    sunRaysG.position.set(sunCX, sunCY);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const x1 = Math.cos(a) * sunR * 1.2;
      const y1 = Math.sin(a) * sunR * 1.2;
      const x2 = Math.cos(a) * sunR * 2.3;
      const y2 = Math.sin(a) * sunR * 2.3;
      sunRaysG.moveTo(x1, y1).lineTo(x2, y2)
        .stroke({ width: 3, color: visual.sun, alpha: 0.32 });
    }
  }

  function paintHaze(w: number, h: number) {
    hazeG.clear();
    hazeG.rect(0, 0, w, h)
      .fill({ color: visual.hazeTint, alpha: visual.hazeAlpha });
  }

  function paintVignette(w: number, h: number) {
    vignetteG.clear();
    const STEPS = 20;
    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS;
      const inset = t * Math.min(w, h) * 0.5;
      vignetteG.rect(inset, inset, w - inset * 2, h - inset * 2)
        .stroke({ width: 4, color: 0x000000, alpha: (1 - t) * 0.025 });
    }
  }

  function buildMountain(
    w: number,
    h: number,
    baseY: number,
    amplitude: number,
    color: string,
    seed: number,
  ): Graphics {
    const g = new Graphics();
    const rand = mulberry32(seed);
    const steps = Math.max(18, Math.round(w / 60));
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const noise = rand() * amplitude + amplitude * 0.3;
      points.push({ x, y: baseY - noise });
    }
    g.moveTo(-20, h + 10).lineTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      g.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    }
    g.lineTo(points[points.length - 1].x, h + 10).lineTo(-20, h + 10);
    g.fill({ color });
    return g;
  }

  function buildStands(w: number, h: number): Graphics {
    const g = new Graphics();
    const baseY = h * 0.42;
    const standsTopY = h * 0.28;
    const rand = mulberry32(71);

    // Main stand body — wavy silhouette
    g.moveTo(-20, baseY);
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const bump = Math.sin((i / steps) * Math.PI) * (h * 0.05);
      const jitter = rand() * 8;
      g.lineTo(x, standsTopY - bump + jitter);
    }
    g.lineTo(w + 20, baseY);
    g.lineTo(w + 20, h * 0.44);
    g.lineTo(-20, h * 0.44);
    g.fill({ color: ballpark.stands });

    // Shaded underside
    g.moveTo(-20, baseY);
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const bump = Math.sin((i / steps) * Math.PI) * (h * 0.04);
      g.lineTo(x, baseY - bump);
    }
    g.lineTo(w + 20, baseY);
    g.closePath();
    g.fill({ color: ballpark.standsShade, alpha: 0.6 });

    // Crowd dots (tiny)
    for (let i = 0; i < 260; i++) {
      const x = rand() * w;
      const y = standsTopY + rand() * (baseY - standsTopY - 4);
      const size = 1 + rand() * 1.2;
      const shade = 0x90 + Math.floor(rand() * 0x50);
      g.circle(x, y, size)
        .fill({ color: (shade << 16) | (shade << 8) | shade, alpha: 0.35 });
    }

    // Stadium lights
    for (let i = 0; i < 4; i++) {
      const x = (w / 4) * (i + 0.5);
      const ly = h * 0.18;
      g.rect(x - 2, ly, 4, 24).fill({ color: 0x2a2a38 });
      g.rect(x - 12, ly - 8, 24, 10).fill({ color: 0x4a5060 });
      g.circle(x, ly - 3, 14)
        .fill({ color: 0xfff4c7, alpha: 0.35 });
    }
    return g;
  }

  function buildWall(w: number, h: number): Graphics {
    const g = new Graphics();
    const wallY = h * 0.42;
    const wallH = h * 0.04;
    // Main fence
    g.rect(0, wallY, w, wallH).fill({ color: ballpark.wallColor });
    // Top cap (yellow line like Fenway)
    g.rect(0, wallY, w, 3).fill({ color: ballpark.wallCap });
    // Vertical plank separators
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * w;
      g.rect(x, wallY + 3, 1, wallH - 3).fill({ color: 0x000000, alpha: 0.18 });
    }
    // Distance marker (billboard)
    const boardW = 80;
    const boardH = 28;
    const boardX = w * 0.5 - boardW / 2;
    const boardY = wallY - boardH - 6;
    g.roundRect(boardX, boardY, boardW, boardH, 4)
      .fill({ color: 0x1a1a2a });
    g.roundRect(boardX + 2, boardY + 2, boardW - 4, boardH - 4, 3)
      .stroke({ width: 1, color: 0xffffff, alpha: 0.4 });
    return g;
  }

  function buildOutfield(w: number, h: number): Graphics {
    const g = new Graphics();
    const topY = h * 0.46;
    const botY = h;
    g.rect(0, topY, w, botY - topY).fill({ color: ballpark.grassOutfield });
    // Mow stripes
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) continue;
      const stripY = topY + (i / 10) * (botY - topY);
      const stripH = (botY - topY) / 10;
      g.rect(0, stripY, w, stripH + 1).fill({ color: ballpark.grassInfield, alpha: 0.22 });
    }
    return g;
  }

  function buildInfield(w: number, h: number): Graphics {
    const g = new Graphics();
    const cx = w * 0.5;
    const homeY = h * 0.92;
    const firstX = cx + w * 0.24;
    const firstY = h * 0.74;
    const secondX = cx;
    const secondY = h * 0.56;
    const thirdX = cx - w * 0.24;
    const thirdY = h * 0.74;
    const moundY = h * 0.66;

    // Dirt kite — expanded beyond the bases so the skin is visible around
    // each bag, and large enough around home for the batter's box.
    const exp = 30;
    g.moveTo(cx, homeY + exp * 0.6);
    g.lineTo(firstX + exp, firstY + exp * 0.5);
    g.lineTo(firstX + exp * 0.7, firstY - exp);
    g.lineTo(cx + exp * 0.9, secondY - exp * 0.2);
    g.lineTo(cx, secondY - exp);
    g.lineTo(cx - exp * 0.9, secondY - exp * 0.2);
    g.lineTo(thirdX - exp * 0.7, thirdY - exp);
    g.lineTo(thirdX - exp, firstY + exp * 0.5);
    g.closePath();
    g.fill({ color: ballpark.dirt });

    // Infield grass inside baselines — smaller kite shrunk toward the
    // centroid of the four bases.
    const centroidX = cx;
    const centroidY = (homeY + firstY + secondY + thirdY) / 4;
    const shrink = 0.28;
    const sh = (x: number, y: number): [number, number] => [
      x + (centroidX - x) * shrink,
      y + (centroidY - y) * shrink,
    ];
    const [hx, hy] = sh(cx, homeY);
    const [fx, fy] = sh(firstX, firstY);
    const [sx, sy] = sh(secondX, secondY);
    const [tx, ty] = sh(thirdX, thirdY);
    g.moveTo(hx, hy).lineTo(fx, fy).lineTo(sx, sy).lineTo(tx, ty).closePath();
    g.fill({ color: ballpark.grassInfield });

    // Pitcher's mound — layered tan oval at center of the diamond
    g.ellipse(cx, moundY + 4, 48, 8).fill({ color: 0x000000, alpha: 0.25 });
    g.ellipse(cx, moundY, 44, 16).fill({ color: 0xd8a86a });
    g.ellipse(cx, moundY, 36, 12).fill({ color: 0xe8b880 });
    // Pitching rubber
    g.rect(cx - 11, moundY - 3, 22, 3).fill({ color: 0xffffff });

    // Baselines — white foul lines from home, dashed lines between others
    const foulStroke = { width: 3, color: 0xffffff, alpha: 0.9 };
    g.moveTo(cx, homeY).lineTo(firstX, firstY).stroke(foulStroke);
    g.moveTo(cx, homeY).lineTo(thirdX, thirdY).stroke(foulStroke);
    const dashStroke = { width: 2, color: 0xffffff, alpha: 0.55 };
    g.moveTo(firstX, firstY).lineTo(secondX, secondY).stroke(dashStroke);
    g.moveTo(secondX, secondY).lineTo(thirdX, thirdY).stroke(dashStroke);

    // Batter's boxes (rectangles on either side of home plate)
    const bbW = 28;
    const bbH = 34;
    g.rect(cx - bbW - 10, homeY - bbH / 2, bbW, bbH)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.65 });
    g.rect(cx + 10, homeY - bbH / 2, bbW, bbH)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.65 });

    return g;
  }

  function buildBases(w: number, h: number): Graphics {
    const g = new Graphics();
    const cx = w * 0.5;
    const homeY = h * 0.92;
    const firstX = cx + w * 0.24;
    const firstY = h * 0.74;
    const secondY = h * 0.56;
    const thirdX = cx - w * 0.24;
    const thirdY = h * 0.74;

    const sz = 18;
    const drawBag = (x: number, y: number) => {
      // Shadow
      g.rect(x - sz / 2 + 2, y - sz / 2 + 2, sz, sz)
        .fill({ color: 0x000000, alpha: 0.35 });
      g.rect(x - sz / 2, y - sz / 2, sz, sz)
        .fill({ color: 0xf8f8f8 });
      g.rect(x - sz / 2 + 2, y - sz / 2 + 2, sz - 4, 3)
        .fill({ color: 0xffffff, alpha: 0.55 });
    };
    drawBag(firstX, firstY);
    drawBag(cx, secondY);
    drawBag(thirdX, thirdY);

    // Home plate — pentagon
    const px = cx;
    const py = homeY;
    g.moveTo(px - 18, py - 6)
      .lineTo(px + 18, py - 6)
      .lineTo(px + 18, py + 4)
      .lineTo(px, py + 16)
      .lineTo(px - 18, py + 4)
      .closePath()
      .fill({ color: 0xffffff });
    return g;
  }

  function drawRunners(w: number, h: number) {
    runnersG.clear();
    if (!sceneRunners[0] && !sceneRunners[1] && !sceneRunners[2]) return;
    const cx = w * 0.5;
    const firstX = cx + w * 0.24;
    const firstY = h * 0.74;
    const secondY = h * 0.56;
    const thirdX = cx - w * 0.24;
    const thirdY = h * 0.74;

    // Runners stand just off each base toward the next one, like real
    // lead-offs, and are drawn as rounded squares in the team color.
    const size = 20;
    const runnerColor = 0xff8552;
    const positions = [
      { x: firstX + 20, y: firstY - 2 },
      { x: cx + 22, y: secondY - 2 },
      { x: thirdX - 20, y: thirdY - 2 },
    ];

    for (let i = 0; i < 3; i++) {
      if (!sceneRunners[i]) continue;
      const p = positions[i];
      runnersG.ellipse(p.x, p.y + size * 0.6, size * 0.7, 3)
        .fill({ color: 0x000000, alpha: 0.45 });
      runnersG.roundRect(p.x - size / 2, p.y - size, size, size + 4, 4)
        .fill({ color: runnerColor });
      runnersG.roundRect(p.x - size / 2 + 2, p.y - size + 2, size - 4, 4, 2)
        .fill({ color: 0xffffff, alpha: 0.55 });
      runnersG.circle(p.x, p.y - size / 2 + 2, 3.5)
        .fill({ color: 0xffffff, alpha: 0.92 });
    }
  }

  function drawPitcher() {
    pitcherBody.clear();
    // Shadow
    pitcherBody.ellipse(0, 20, 18, 5).fill({ color: 0x000000, alpha: 0.4 });
    // Legs
    pitcherBody.roundRect(-9, 6, 7, 18, 2).fill({ color: pitcherCap });
    pitcherBody.roundRect(2, 6, 7, 18, 2).fill({ color: pitcherCap });
    // Body (jersey)
    pitcherBody.roundRect(-12, -10, 24, 22, 5).fill({ color: pitcherJersey });
    pitcherBody.roundRect(-12, -10, 24, 6, 3).fill({ color: pitcherStripe });
    // Number
    pitcherBody.circle(0, 2, 5).fill({ color: 0x2a3550, alpha: 0.7 });
    // Head
    pitcherBody.circle(0, -18, 8).fill({ color: 0xf5d5a0 });
    // Cap
    pitcherBody.rect(-9, -22, 18, 5).fill({ color: pitcherCap });
    pitcherBody.rect(-9, -19, 12, 3).fill({ color: pitcherCap });
    // Arm (animated by wind-up phase)
    const armAngle = -0.3 + Math.sin(pitcherPhase * Math.PI) * 1.6;
    const ax = Math.cos(armAngle) * 20;
    const ay = Math.sin(armAngle) * 20;
    pitcherBody.moveTo(0, -2)
      .lineTo(ax, ay - 2)
      .stroke({ width: 5, color: pitcherJersey });
    // Glove hand (opposite arm)
    pitcherBody.circle(-10, 0, 4).fill({ color: pitcherCap });
  }

  function drawBatter() {
    batterBody.clear();
    // Shadow
    batterBody.ellipse(0, 42, 36, 8).fill({ color: 0x000000, alpha: 0.45 });
    // Legs
    batterBody.roundRect(-12, 12, 10, 30, 3).fill({ color: 0x2a3550 });
    batterBody.roundRect(2, 12, 10, 30, 3).fill({ color: 0x2a3550 });
    // Body (jersey)
    batterBody.roundRect(-17, -18, 34, 36, 7).fill({ color: batterJersey });
    batterBody.roundRect(-17, -18, 34, 10, 5).fill({ color: batterStripe, alpha: 0.7 });
    // Number
    batterBody.circle(0, -2, 6).fill({ color: 0xffffff, alpha: 0.92 });
    // Head + helmet
    batterBody.circle(-2, -28, 11).fill({ color: 0xf5d5a0 });
    batterBody.circle(-2, -29, 12).fill({ color: 0x2a3550 });
    batterBody.rect(-14, -28, 24, 5).fill({ color: 0x2a3550 });
    // Front arm stub
    batterBody.circle(8, -8, 5).fill({ color: 0xf5d5a0 });
    // Back hand gripping bat
    batterBody.circle(12, -4, 4).fill({ color: 0xf5d5a0 });

    // Bat (rotates around handle)
    batterBat.clear();
    const len = 52;
    batterBat.roundRect(0, -4, len, 8, 4).fill({ color: 0xc2a17a });
    batterBat.roundRect(len - 16, -6, 16, 12, 5).fill({ color: 0xa68156 });
    batterBat.roundRect(0, -4, 12, 8, 3).fill({ color: 0x2a1a0a });
    batterBat.x = 8;
    batterBat.y = -8;
    batterBat.rotation = -0.9 + swingAngle;
  }

  function drawBallShape() {
    ballG.clear();
    ballG.circle(0, 0, 6).fill({ color: 0xffffff });
    ballG.circle(-1.5, -1.5, 2).fill({ color: 0xffe27a, alpha: 0.6 });
    ballG.moveTo(-4, 0)
      .quadraticCurveTo(0, -2, 4, 0)
      .stroke({ width: 1, color: 0xe63946 });
  }

  function updateBallPitch(h: number) {
    // During the pitch phase, the ball travels from the pitcher's mound
    // toward home plate with a gentle arc. Depth is faked by scaling.
    const t = Math.max(0, Math.min(1, currentBallProgress));
    const startX = mound.x;
    const startY = mound.y - 10;
    const endX = plate.x;
    const endY = plate.y - 18;
    const arc = -Math.sin(t * Math.PI) * h * 0.05;
    ball.x = startX + (endX - startX) * t;
    ball.y = startY + (endY - startY) * t + arc;
    // Scale grows as ball approaches the camera (plate is foreground)
    ball.scale.set(0.6 + t * 0.8);
    ball.alpha = 1;
  }

  function updateBallHitFlight(now: number, w: number, h: number) {
    const elapsed = now - hitStartMs;
    const rawT = elapsed / HIT_ANIM_MS;
    const t = Math.min(1, Math.max(0, rawT));

    const cx = w * 0.5;
    const startX = plate.x;
    const startY = plate.y - 22;

    let endX = startX;
    let endY = startY;
    let peak = 0;
    let endScale = 0.5;
    let fade = 1;

    switch (hitKind) {
      case 'whiff':
      case 'calledStrike':
        hitActive = false;
        ball.alpha = 0;
        return;
      case 'groundOut':
        endX = cx + w * 0.18;
        endY = h * 0.76;
        peak = h * 0.03;
        endScale = 1.0;
        break;
      case 'popFly':
        endX = cx - w * 0.08;
        endY = h * 0.68;
        peak = h * 0.28;
        endScale = 0.75;
        break;
      case 'deepFlyOut':
        endX = cx + w * 0.05;
        endY = h * 0.48;
        peak = h * 0.32;
        endScale = 0.45;
        break;
      case 'single':
        endX = cx + w * 0.32;
        endY = h * 0.62;
        peak = h * 0.10;
        endScale = 0.55;
        break;
      case 'double':
        endX = cx + w * 0.40;
        endY = h * 0.52;
        peak = h * 0.15;
        endScale = 0.42;
        break;
      case 'triple':
        endX = cx - w * 0.42;
        endY = h * 0.48;
        peak = h * 0.18;
        endScale = 0.40;
        break;
      case 'homeRun':
        endX = cx + w * 0.10;
        endY = h * 0.26;
        peak = h * 0.40;
        endScale = 0.22;
        if (t > 0.8) fade = 1 - (t - 0.8) / 0.2;
        break;
    }

    const x = startX + (endX - startX) * t;
    const yBase = startY + (endY - startY) * t;
    const arc = -Math.sin(t * Math.PI) * peak;
    const y = yBase + arc;
    const scale = 1 + (endScale - 1) * t;

    ball.x = x;
    ball.y = y;
    ball.scale.set(scale);
    ball.alpha = fade;

    if (t >= 1) {
      hitActive = false;
      ball.alpha = 0;
    }
  }

  function drawMeter(w: number, h: number) {
    meterBg.clear();
    meterFill.clear();
    const mx = 24;
    const my = h * 0.28;
    const mw = 18;
    const mh = h * 0.44;
    meterBg.roundRect(mx - 3, my - 3, mw + 6, mh + 6, 6)
      .fill({ color: 0x0a0f1a, alpha: 0.55 });
    meterBg.roundRect(mx, my, mw, mh, 4)
      .fill({ color: 0x11192a });
    // Tick marks
    for (let i = 1; i < 5; i++) {
      meterBg.rect(mx - 5, my + (mh * i) / 5, mw + 10, 1)
        .fill({ color: 0xffffff, alpha: 0.15 });
    }
    // Fill (bottom-up)
    const frac = Math.max(0, Math.min(1, meterFraction));
    const fillH = mh * frac;
    const fillY = my + mh - fillH;
    let tint: number;
    if (frac < 0.35) tint = 0x4a8bff;
    else if (frac < 0.7) tint = 0x7ee8c6;
    else if (frac < 0.9) tint = 0xffe27a;
    else tint = 0xe63946;
    meterFill.roundRect(mx + 1, fillY + 1, mw - 2, fillH - 2, 3)
      .fill({ color: tint });
    meterFill.roundRect(mx + 1, fillY + 1, mw - 2, Math.min(6, fillH - 2), 3)
      .fill({ color: 0xffffff, alpha: 0.4 });

    meterLabel.x = mx - 6;
    meterLabel.y = my + mh + 10;
    void w;
  }

  // Lay out the line-score panel: left label column (局 / 分) followed by
  // one column per inning (inning number on top, runs on bottom), then an
  // R total column. Current inning is highlighted in a distinct color.
  function drawScoreboard(w: number, h: number) {
    scoreboardBg.clear();

    // Update cell text + fill based on current state.
    let total = 0;
    for (let i = 0; i < sbInningTotal; i++) {
      const isCurrent = sbCurrentInning === i + 1;
      const header = inningHeaderCells[i];
      const value = inningValueCells[i];
      if (!header || !value) continue;
      header.text = String(i + 1);
      header.style = makeCellStyle(isCurrent ? COLOR_INNING_ACTIVE : COLOR_INNING_IDLE);
      const runs = sbInningRuns[i];
      if (runs == null) {
        value.text = '-';
      } else {
        value.text = String(runs);
        total += runs;
      }
      value.style = makeCellStyle(isCurrent ? COLOR_RUN_ACTIVE : COLOR_RUN_IDLE);
    }
    if (rValueText) rValueText.text = String(total);
    if (batValueText) {
      batValueText.text = sbCurrentBatter > 0 ? String(sbCurrentBatter) : '-';
    }

    // Per-cell column width: use the widest rendered glyph width plus a
    // fixed gap so columns stay crisp even if a value jumps from "-" to "9".
    let maxCellW = 0;
    for (const t of inningHeaderCells) maxCellW = Math.max(maxCellW, t.width);
    for (const t of inningValueCells) maxCellW = Math.max(maxCellW, t.width);
    if (rHeaderText) maxCellW = Math.max(maxCellW, rHeaderText.width);
    if (rValueText) maxCellW = Math.max(maxCellW, rValueText.width);
    if (batHeaderText) maxCellW = Math.max(maxCellW, batHeaderText.width);
    if (batValueText) maxCellW = Math.max(maxCellW, batValueText.width);
    const colGap = 22;
    const colStride = maxCellW + colGap;
    const totalCols = sbInningTotal + 2; // inning cells + R + 棒
    const lineScoreW = colStride * totalCols - colGap;

    const labelW = Math.max(innLabelText.width, runLabelText.width);

    const padX = 22;
    const labelGap = 18;
    const bw = Math.min(w - 40, padX * 2 + labelW + labelGap + 1 + labelGap + lineScoreW);
    const bh = 82;
    const bx = w * 0.5 - bw / 2;
    const by = 14;

    scoreboardBg.roundRect(bx, by, bw, bh, 12)
      .fill({ color: 0x0a0f1a, alpha: 0.82 });
    scoreboardBg.roundRect(bx + 1, by + 1, bw - 2, bh - 2, 11)
      .stroke({ width: 1, color: 0xffd166, alpha: 0.45 });

    // Divider between the label column and the line score
    const dividerX = bx + padX + labelW + labelGap;
    scoreboardBg.rect(dividerX, by + 12, 1, bh - 24)
      .fill({ color: 0xffffff, alpha: 0.22 });

    // Label column — 局 on top, 分 on bottom
    innLabelText.x = bx + padX;
    innLabelText.y = by + 16;
    runLabelText.x = bx + padX;
    runLabelText.y = by + 46;

    // Column positions: each cell is centered (anchor 0.5, 0) on its own
    // stride. The first column's center sits one half-stride right of the
    // divider + labelGap.
    const firstColCenter = dividerX + labelGap + maxCellW * 0.5;
    const headerY = by + 12;
    const valueY = by + 42;

    // Highlight strip behind the current column (full-height tinted bar so
    // the active column pops visually even without per-character color).
    if (sbCurrentInning >= 1 && sbCurrentInning <= sbInningTotal) {
      const hiX = firstColCenter + colStride * (sbCurrentInning - 1) - maxCellW * 0.5 - 6;
      scoreboardBg.roundRect(hiX, by + 8, maxCellW + 12, bh - 16, 6)
        .fill({ color: 0x7ee8c6, alpha: 0.12 });
    }

    for (let i = 0; i < sbInningTotal; i++) {
      const header = inningHeaderCells[i];
      const value = inningValueCells[i];
      if (!header || !value) continue;
      const cx2 = firstColCenter + colStride * i;
      header.x = cx2;
      header.y = headerY;
      value.x = cx2;
      value.y = valueY;
    }
    if (rHeaderText && rValueText) {
      const cxR = firstColCenter + colStride * sbInningTotal;
      rHeaderText.x = cxR;
      rHeaderText.y = headerY;
      rValueText.x = cxR;
      rValueText.y = valueY;
    }
    if (batHeaderText && batValueText) {
      const cxBat = firstColCenter + colStride * (sbInningTotal + 1);
      batHeaderText.x = cxBat;
      batHeaderText.y = headerY;
      batValueText.x = cxBat;
      batValueText.y = valueY;
    }

    // Wall distance marker over the center-field billboard
    wallText.anchor.set(0.5);
    wallText.x = w * 0.5;
    wallText.y = h * 0.40;
  }

  // ---------- LAYOUT ----------

  // init=true on first call (spawns clouds). init=false on resize calls —
  // existing cloud sprites stay in place to avoid the flash from destroy+recreate.
  function layout(w: number, h: number, init = false) {
    W = w;
    H = h;

    paintSky(w, h);
    paintSun(w, h);
    buildSunRays();
    paintHaze(w, h);
    paintVignette(w, h);

    if (mtnFarG) { mtnFarG.destroy(); mtnFarG = null; }
    if (mtnMidG) { mtnMidG.destroy(); mtnMidG = null; }
    if (standsG) { standsG.destroy(); standsG = null; }
    if (wallG) { wallG.destroy(); wallG = null; }
    if (outfieldG) { outfieldG.destroy(); outfieldG = null; }
    if (infieldG) { infieldG.destroy(); infieldG = null; }
    if (basesG) { basesG.destroy(); basesG = null; }

    mtnFarG = buildMountain(w, h, h * 0.32, h * 0.08, visual.mtnFar, 13);
    mtnMidG = buildMountain(w, h, h * 0.36, h * 0.10, visual.mtnMid, 29);
    standsG = buildStands(w, h);
    wallG = buildWall(w, h);
    outfieldG = buildOutfield(w, h);
    infieldG = buildInfield(w, h);
    basesG = buildBases(w, h);

    layers.mtnFar.addChild(mtnFarG);
    layers.mtnMid.addChild(mtnMidG);
    layers.stands.addChild(standsG);
    layers.wall.addChild(wallG);
    layers.outfield.addChild(outfieldG);
    layers.infield.addChild(infieldG);
    layers.bases.addChildAt(basesG, 0);

    // Spawn clouds only on initial layout — never on resize, to avoid the
    // destroy+recreate flash that appears as rapid flicker before training.
    if (init) {
      for (const c of clouds) c.g.destroy();
      clouds.length = 0;
      let seed = 1;
      for (let i = 0; i < 6; i++) {
        const g = buildCloud(seed++, 0.8, visual.cloudBright, visual.cloudShade);
        g.x = (i / 6) * w * 1.2 + Math.random() * 100;
        g.y = h * (0.05 + Math.random() * 0.14);
        g.alpha = 0.85;
        layers.cloudFar.addChild(g);
        clouds.push({ g, depth: 0.2 + Math.random() * 0.3 });
      }
    }

    // Diamond anchor points (must match buildInfield/buildBases)
    const cx = w * 0.5;
    plate = { x: cx, y: h * 0.92 };
    firstBase = { x: cx + w * 0.24, y: h * 0.74 };
    secondBase = { x: cx, y: h * 0.56 };
    thirdBase = { x: cx - w * 0.24, y: h * 0.74 };
    mound = { x: cx, y: h * 0.66 };
    void firstBase; void secondBase; void thirdBase;

    // Pitcher stands on the mound, facing the batter. Scaled large for
    // visibility given the TV-style camera distance.
    pitcher.x = mound.x;
    pitcher.y = mound.y - 14;
    pitcher.scale.set(1.45);
    drawPitcher();

    // Batter stands in the batter's box matching the current handedness.
    applyBatterHand();
    drawBatter();

    // Ball starts at pitcher's release point.
    drawBallShape();
    ball.x = mound.x;
    ball.y = mound.y - 18;
    ball.scale.set(0.8);
    ball.alpha = 1;

    drawMeter(w, h);
    drawScoreboard(w, h);
    drawRunners(w, h);

    // Countdown position
    countdownText.x = w * 0.5;
    countdownText.y = h * 0.38;

    // Result flash bg — covers middle third
    resultBg.clear();
    resultBg.roundRect(w * 0.18, h * 0.32, w * 0.64, h * 0.22, 16)
      .fill({ color: 0x0a0f1a, alpha: 0.72 });
    resultBg.roundRect(w * 0.18 + 2, h * 0.32 + 2, w * 0.64 - 4, h * 0.22 - 4, 14)
      .stroke({ width: 2, color: 0xffe27a, alpha: 0.5 });
    resultText.x = w * 0.5;
    resultText.y = h * 0.43;
  }

  // ---------- TICK ----------

  function tick(p: BaseballSceneTickParams) {
    const { now, dt, worldW, worldH } = p;
    // Sun rays slow rotation — transform-only update, no GPU buffer rebuild.
    sunRaysG.rotation = now * 0.0002;

    // Clouds drift
    for (const c of clouds) {
      c.g.x -= (0.2 + c.depth * 0.6) * dt;
      if (c.g.x < -180) c.g.x = worldW + 100 + Math.random() * 160;
    }

    // Pitcher wind-up animation (only when active)
    if (pitcherActive) {
      pitcherPhase += 0.015 * dt;
      if (pitcherPhase >= 1) {
        pitcherPhase = 1;
        pitcherActive = false;
      }
      drawPitcher();
    }

    // Swing impulse decays toward zero
    if (swingImpulse !== 0) {
      swingAngle += swingImpulse * dt;
      swingImpulse *= 0.82;
      if (Math.abs(swingImpulse) < 0.005) swingImpulse = 0;
      drawBatter();
    } else if (swingAngle !== 0) {
      swingAngle += (0 - swingAngle) * 0.08 * dt;
      if (Math.abs(swingAngle) < 0.01) swingAngle = 0;
      drawBatter();
    }

    // Batter switch-in animation: quick fade + scale pop so the therapist
    // sees the new at-bat is starting. Respects handedness mirror.
    if (batterAnimActive) {
      const elapsed = now - batterAnimStart;
      const t = Math.min(1, elapsed / BATTER_ANIM_MS);
      batter.alpha = t;
      const pop = 1 + (1 - t) * 0.35;
      const mirror = batterHand === 'L' ? -1 : 1;
      batter.scale.set(1.9 * mirror * pop, 1.9 * pop);
      if (t >= 1) {
        batterAnimActive = false;
        batter.alpha = 1;
        batter.scale.set(1.9 * mirror, 1.9);
      }
    }

    // Ball: either hit-flight or pitch-toward-plate
    if (hitActive) {
      updateBallHitFlight(now, worldW, worldH);
    } else {
      updateBallPitch(worldH);
    }

    // Countdown pulse — each new number snaps big + fades through the second
    if (countdownValue != null) {
      const phase = (now % 1000) / 1000; // 0..1 within the current second
      const scale = 1.35 - phase * 0.35;
      countdownText.scale.set(scale);
      countdownText.alpha = 1 - phase * 0.35;
    }

    // Result flash auto-hide
    if (resultFlash.visible && now >= resultFlashExpiry) {
      resultFlash.visible = false;
    }
  }

  function pitcherWindup(_now: number) {
    pitcherPhase = 0;
    pitcherActive = true;
  }

  function setBallProgress(progress: number) {
    currentBallProgress = Math.max(0, Math.min(1, progress));
  }

  function setMeter(fraction: number) {
    meterFraction = fraction;
    drawMeter(W, H);
  }

  function swingBat() {
    swingImpulse = 0.4;
  }

  function flashResult(kind: BaseballHitKind, lang: 'zh' | 'en') {
    const text = RESULT_TEXT[kind][lang];
    resultText.text = text;
    let fill = 0xffffff;
    if (kind === 'homeRun') fill = 0xffe27a;
    else if (kind === 'triple' || kind === 'double') fill = 0x7ee8c6;
    else if (kind === 'single') fill = 0xa0d8ff;
    else if (kind === 'whiff' || kind === 'calledStrike') fill = 0xf85149;
    else fill = 0xcccccc;
    resultText.style = new TextStyle({
      ...resultText.style,
      fill,
    });
    resultFlash.visible = true;
    resultFlashExpiry = performance.now() + 1500;
  }

  function setInningTotal(total: number) {
    const next = Math.max(1, total);
    if (next !== sbInningTotal) {
      sbInningTotal = next;
      rebuildScoreboardCells();
    }
    drawScoreboard(W, H);
  }

  function setLineScore(
    inningRuns: readonly number[],
    currentInning: number,
    currentBatter: number,
  ) {
    sbInningRuns = inningRuns.slice();
    sbCurrentInning = currentInning;
    sbCurrentBatter = currentBatter;
    drawScoreboard(W, H);
  }

  function switchBatter(hand: 'L' | 'R') {
    batterHand = hand;
    applyBatterHand();
    drawBatter();
    batterAnimActive = true;
    batterAnimStart = performance.now();
  }

  // Place the batter in the correct batter's box and mirror their sprite
  // so a left-handed batter faces the mound from the 1B-side box and a
  // right-handed batter from the 3B-side box. The offset is large enough
  // that the nearest base bag stays visible next to the batter.
  function applyBatterHand() {
    const mirror = batterHand === 'L' ? -1 : 1;
    const BATTER_BOX_OFFSET = 72;
    batter.x = plate.x + (batterHand === 'L' ? BATTER_BOX_OFFSET : -BATTER_BOX_OFFSET);
    batter.y = plate.y - 10;
    batter.scale.set(1.9 * mirror, 1.9);
  }

  function setRunners(runners: readonly boolean[]) {
    sceneRunners[0] = !!runners[0];
    sceneRunners[1] = !!runners[1];
    sceneRunners[2] = !!runners[2];
    drawRunners(W, H);
  }

  function setCountdown(value: number | null) {
    if (value === countdownValue) return;
    countdownValue = value;
    if (value == null) {
      countdownText.visible = false;
    } else {
      countdownText.text = String(value);
      countdownText.visible = true;
      countdownText.scale.set(1.35);
      countdownText.alpha = 1;
    }
  }

  function hitBall(kind: BaseballHitKind) {
    hitKind = kind;
    hitActive = true;
    hitStartMs = performance.now();
  }

  function hideScoreboard() {
    layers.scoreboard.visible = false;
  }

  // Team A = blue/white, Team B = red/pink
  const TEAM_A_JERSEY = 0xe4ecfa;
  const TEAM_A_STRIPE = 0x58a6ff;
  const TEAM_A_CAP    = 0x1a2a44;
  const TEAM_B_JERSEY = 0xe63946;
  const TEAM_B_STRIPE = 0xf28a93;
  const TEAM_B_CAP    = 0x4a1520;

  function setTeamColors(isBottom: boolean) {
    if (isBottom) {
      // Bottom half: Team B bats, Team A pitches
      pitcherJersey = TEAM_A_JERSEY; pitcherStripe = TEAM_A_STRIPE; pitcherCap = TEAM_A_CAP;
      batterJersey  = TEAM_B_JERSEY; batterStripe  = TEAM_B_STRIPE;
    } else {
      // Top half: Team A bats, Team B pitches
      pitcherJersey = TEAM_B_JERSEY; pitcherStripe = TEAM_B_STRIPE; pitcherCap = TEAM_B_CAP;
      batterJersey  = TEAM_A_JERSEY; batterStripe  = TEAM_A_STRIPE;
    }
    drawPitcher();
    drawBatter();
  }

  function showEndOverlay(teamA: string, scoreA: number, teamB: string, scoreB: number) {
    endBg.clear();
    endBg.rect(0, 0, W, H).fill({ color: 0x0a0f1a, alpha: 0.75 });
    endTitle.position.set(W / 2, H * 0.35);
    endScore.text = `${teamA}  ${scoreA}  —  ${scoreB}  ${teamB}`;
    endScore.position.set(W / 2, H * 0.5);
    endOverlay.visible = true;
  }

  function destroy() {
    root.removeFromParent();
    root.destroy({ children: true });
  }

  return {
    root,
    layout,
    tick,
    pitcherWindup,
    setBallProgress,
    setMeter,
    swingBat,
    flashResult,
    setInningTotal,
    setRunners,
    setCountdown,
    hitBall,
    setLineScore,
    switchBatter,
    hideScoreboard,
    setTeamColors,
    showEndOverlay,
    destroy,
  };
}

// ---------- RESULT TEXT ----------

const RESULT_TEXT: Record<BaseballHitKind, { zh: string; en: string }> = {
  whiff: { zh: '揮棒落空', en: 'WHIFF' },
  calledStrike: { zh: '好球', en: 'CALLED STRIKE' },
  groundOut: { zh: '滾地出局', en: 'GROUND OUT' },
  popFly: { zh: '高飛出局', en: 'POP OUT' },
  deepFlyOut: { zh: '深遠飛球接殺', en: 'DEEP FLY OUT' },
  single: { zh: '一壘安打', en: 'SINGLE' },
  double: { zh: '二壘安打', en: 'DOUBLE' },
  triple: { zh: '三壘安打', en: 'TRIPLE' },
  homeRun: { zh: '全壘打！', en: 'HOME RUN!' },
};

// ---------- CLOUD ----------

function buildCloud(seed: number, scale: number, bright: string, shade: string): Graphics {
  const rand = mulberry32(seed);
  const g = new Graphics();
  const blobs = 5 + Math.floor(rand() * 4);
  const parts: Array<{ dx: number; dy: number; r: number }> = [];
  for (let i = 0; i < blobs; i++) {
    const dx = (rand() - 0.5) * 80 * scale;
    const dy = (rand() - 0.3) * 22 * scale;
    const r = (18 + rand() * 24) * scale;
    parts.push({ dx, dy, r });
  }
  for (const p of parts) g.circle(p.dx, p.dy + p.r * 0.15, p.r).fill({ color: shade, alpha: 0.9 });
  for (const p of parts) g.circle(p.dx, p.dy, p.r).fill({ color: bright });
  for (const p of parts) g.circle(p.dx - p.r * 0.2, p.dy - p.r * 0.3, p.r * 0.55)
    .fill({ color: 0xffffff, alpha: 0.4 });
  return g;
}

// ---------- UTILS ----------

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h,
    16,
  );
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
