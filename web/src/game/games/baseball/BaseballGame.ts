import type { Application, Container, Ticker } from 'pixi.js';
import type {
  BaseballHitKind,
  GameInstance,
  GameStatsListener,
  Lang,
  RunResult,
  Theme,
} from '../../Game';
import { buildBaseballScene, type BaseballScene } from './scene';
import { ballparkFor, type Ballpark } from './ballparks';

/**
 * One "run" = one inning. An inning is a fixed number of batters (not outs)
 * so the session duration stays predictable.
 * Each batter gets up to 3 strikes; any non-whiff pitch ends the at-bat
 * immediately, and the 3rd whiff is a strikeout out.
 * Each pitch = 18s split into three phases:
 *   PREP   (5s)  pitcher wind-up, 5→1 countdown overlay
 *   CHARGE (10s) ball approaches, power meter fills from mean OO
 *   POST   (3s)  ball-in-flight animation after the swing resolves
 * At the start of POST the mean OO drives the hit kind (via resolveHit),
 * runners advance around the bases, and runs score like real baseball.
 */

export interface BaseballGameArgs {
  app: Application;
  stage: Container;
  theme: Theme;
  lang: Lang;
  /** 'basic' | 'active' | 'dual' (default 'basic') */
  modeId?: string;
  onStats?: GameStatsListener;
  /** Total innings this session. Passed via loadGame so the scoreboard can
   *  render "INN 2/5" instead of just "INN 2". Default 9. */
  inningTotal?: number;
  /** Dual-mode team names (only relevant when modeId === 'dual'). */
  dualTeamA?: string;
  dualTeamB?: string;
}

const BATTERS_PER_INNING = 3;
const MAX_STRIKES = 3;
const MAX_PITCHES_PER_INNING = BATTERS_PER_INNING * MAX_STRIKES;
const PREP_MS = 5000;
const CHARGE_MS = 10000;
const POST_MS = 3000;
const PITCH_MS = PREP_MS + CHARGE_MS + POST_MS;

/**
 * Charge buckets. These thresholds are independent of ballpark — only the
 * homeRun bucket is further filtered by wall distance. Anything 88+ is
 * "trying for the fence"; whether it clears depends on the park.
 */
function resolveHit(charge: number, wallM: number): { kind: BaseballHitKind; distanceM: number } {
  const distanceM = Math.round(charge * 1.5);
  if (charge < 15) return { kind: 'whiff', distanceM: 0 };
  if (charge < 30) return { kind: 'groundOut', distanceM: 22 };
  if (charge < 45) return { kind: 'popFly', distanceM: 42 };
  if (charge < 60) return { kind: 'single', distanceM: 58 };
  if (charge < 75) return { kind: 'double', distanceM: 88 };
  if (charge < 88) return { kind: 'triple', distanceM: 112 };
  if (distanceM >= wallM) return { kind: 'homeRun', distanceM };
  return { kind: 'deepFlyOut', distanceM };
}

function baseValue(kind: BaseballHitKind): number {
  switch (kind) {
    case 'single': return 1;
    case 'double': return 2;
    case 'triple': return 3;
    case 'homeRun': return 4;
    default: return 0;
  }
}

function isOut(kind: BaseballHitKind): boolean {
  return kind === 'whiff' || kind === 'groundOut' || kind === 'popFly' || kind === 'deepFlyOut';
}

// Active mode: timing bonus/penalty thresholds (fraction of CHARGE_MS elapsed)
const ACTIVE_SWING_EARLY = 0.55;   // before this = too early → penalty
const ACTIVE_SWING_PERFECT_LO = 0.75; // 75–92% of charge phase = bonus window
const ACTIVE_SWING_PERFECT_HI = 0.92;
// Charge multiplier applied on top of the normal OO-time-weighted charge
const ACTIVE_BONUS_MULT   = 1.25;  // +25% → triple more likely to be homerun
const ACTIVE_PENALTY_MULT = 0.75;  // -25% → triple more likely to be double
const ACTIVE_NEUTRAL_MULT = 1.00;

export function createBaseballGame(args: BaseballGameArgs): GameInstance {
  const { app, stage, theme, lang, modeId = 'basic', onStats, inningTotal = 9,
    dualTeamA = 'Team A', dualTeamB = 'Team B' } = args;
  const ballpark: Ballpark = ballparkFor(theme.id);
  let scene: BaseballScene | null = buildBaseballScene(theme, ballpark);
  stage.addChild(scene.root);
  scene.layout(app.screen.width, app.screen.height);
  // In dual mode the scoreboard shows 2×N half-innings; each column = one half.
  scene.setInningTotal(modeId === 'dual' ? inningTotal * 2 : inningTotal);

  // ── Dual mode team tracking ──────────────────────────────────────────────
  // teamARuns[i] / teamBRuns[i]: runs scored in inning i (0-based). −1 = not yet played.
  const teamARuns: number[] = Array.from({ length: inningTotal }, () => -1);
  const teamBRuns: number[] = Array.from({ length: inningTotal }, () => -1);

  let oo = 0;
  let runIndex = -1;
  let runStartedAt = 0;
  let finishCb: ((r: RunResult) => void) | null = null;
  let paused = false;
  let pausedTotalMs = 0;
  let pausedAtMs = 0;

  // Charge accumulation for the CURRENT pitch. Time-weighted: we add
  // oo*dtSec each tick and divide by elapsed charge seconds when resolving.
  let chargeAccum = 0;
  let chargeSec = 0;
  let lastTickMs = 0;

  // Per-inning stats
  let pitchCount = 0;          // total pitches thrown this inning so far
  let batterIdx = 0;           // 0..BATTERS_PER_INNING-1
  let strikes = 0;             // strikes in the CURRENT at-bat (0..MAX_STRIKES)
  let batterHand: 'L' | 'R' = 'R';
  let whiffs = 0;
  let outs = 0;
  let hits = 0;
  let homeRuns = 0;
  let totalBases = 0;
  let runsScored = 0;
  let meanChargeSum = 0;
  let rlSeries: number[] = [];
  let lastResult: BaseballHitKind | null = null;
  let inningComplete = false;
  // resolvePitch() may determine the inning is over mid-POST, but we want
  // the ball-flight animation to finish first. Raising this flag defers the
  // actual inning termination until the current pitch cycle ends.
  let inningEndPending = false;
  // Same idea for batter changes: when an at-bat ends during POST, we wait
  // for the ball to finish its flight before swapping the batter sprite, so
  // the transition happens cleanly at the start of the next pitch.
  let pendingBatterSwitch = false;

  // Per-pitch sequencing — the tick is state-driven instead of slicing
  // elapsed time into fixed 18s buckets, because at-bats are variable length.
  let currentPitchStartedAt = 0;   // relative to runStartedAt, ms
  let pitchResolved = false;       // resolvePitch() ran for this pitch

  // Active mode — swing timing
  let activeSwingMult = ACTIVE_NEUTRAL_MULT; // set when Space is pressed during CHARGE
  let activePendingSwing = false;            // Space pressed, waiting for pitch to resolve

  // Per-session line score (cumulative, one entry per inning completed + the
  // in-progress inning). The scene re-derives the total from this array.
  const inningRuns: number[] = [];

  // Dual mode: which half-inning we are in (top = Team A, bottom = Team B)
  let isTopHalf = true;
  let inningNumber = 0;  // 0-based inning index

  // Base runner occupancy: index 0=1B, 1=2B, 2=3B. Cleared each inning.
  const runners: [boolean, boolean, boolean] = [false, false, false];

  // Full-run OO accumulator so the controller can compute session-wide avg.
  let lastOoAccumSec = 0;

  // Seedable RNG for batter handedness. Re-seeded on every new batter so
  // the sequence is deterministic within a session run but still mixed.
  function pickHand(): 'L' | 'R' {
    return Math.random() < 0.5 ? 'L' : 'R';
  }

  /**
   * Advance base runners for a hit of the given kind and return how many
   * runs scored. Outs do not advance runners in this simplified model.
   */
  function advanceBases(kind: BaseballHitKind): number {
    const bases =
      kind === 'single' ? 1
      : kind === 'double' ? 2
      : kind === 'triple' ? 3
      : kind === 'homeRun' ? 4
      : 0;
    if (bases === 0) return 0;
    let scored = 0;
    const next: [boolean, boolean, boolean] = [false, false, false];
    for (let i = 0; i < 3; i++) {
      if (!runners[i]) continue;
      const newPos = i + bases;
      if (newPos >= 3) scored += 1;
      else next[newPos] = true;
    }
    const batterPos = bases - 1;
    if (batterPos >= 3) scored += 1;
    else next[batterPos] = true;
    runners[0] = next[0];
    runners[1] = next[1];
    runners[2] = next[2];
    return scored;
  }

  let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const resizeListener = () => {
    if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      resizeDebounceTimer = null;
      if (!scene) return;
      scene.layout(app.screen.width, app.screen.height);
    }, 150);
  };
  app.renderer.on('resize', resizeListener);

  function emitStats() {
    if (!onStats) return;
    const isIdle = runIndex < 0;
    const stats = {
      rl: isIdle ? 0 : Math.round(oo),
      inning: isIdle ? 0 : runIndex + 1,
      pitch: isIdle ? 0 : pitchCount,
      charge: isIdle ? 0 : Math.round(chargeSec > 0 ? chargeAccum / chargeSec : 0),
      runs: isIdle ? 0 : runsScored,
      homeRuns: isIdle ? 0 : homeRuns,
      lastResult: isIdle ? null : lastResult,
      ballparkM: ballpark.wallM,
      ...(modeId === 'dual' && {
        dualTeamAName: dualTeamA,
        dualTeamBName: dualTeamB,
        dualTeamARuns: teamARuns.slice(),
        dualTeamBRuns: teamBRuns.slice(),
        dualIsBottomHalf: !isTopHalf,
        dualCurrentInning: inningNumber + 1,
        dualInningTotal: inningTotal,
      }),
    };
    onStats(stats);
  }

  function publishLineScore() {
    if (!scene) return;
    // The line score contains all completed innings + the current inning in
    // progress (so the current column updates live). runIndex is 0-based.
    const snapshot = inningRuns.slice(0, Math.max(runIndex + 1, inningRuns.length));
    snapshot[runIndex] = runsScored;
    const currentBatter = inningComplete ? 0 : Math.min(batterIdx + 1, BATTERS_PER_INNING);
    scene.setLineScore(snapshot, runIndex + 1, currentBatter);
  }

  /**
   * Begin a new at-bat: pick handedness, reset strikes, publish to scene.
   * Called at inning start and after each completed at-bat (unless inning
   * is already over).
   */
  function beginAtBat() {
    strikes = 0;
    batterHand = pickHand();
    if (scene) scene.switchBatter(batterHand);
    publishLineScore();
  }

  /**
   * Schedule the next pitch to start right now (relative to run time).
   * Resets the charge accumulators so the meter begins empty for the PREP
   * phase of the incoming pitch.
   */
  function scheduleNextPitch(elapsedMs: number) {
    currentPitchStartedAt = elapsedMs;
    pitchResolved = false;
    chargeAccum = 0;
    chargeSec = 0;
    if (scene) {
      scene.setBallProgress(0);
      scene.setMeter(0);
    }
  }

  const tick = (ticker: Ticker) => {
    if (!scene) return;
    const now = performance.now();
    const dt = ticker.deltaTime;

    if (paused) {
      scene.tick({ now, dt, worldW: app.screen.width, worldH: app.screen.height });
      return;
    }

    // Pre-run idle: just animate clouds/sun
    if (runIndex < 0) {
      scene.tick({ now, dt, worldW: app.screen.width, worldH: app.screen.height });
      emitStats();
      return;
    }

    const elapsedMs = now - runStartedAt - pausedTotalMs;

    if (!inningComplete) {
      const inPitchMs = elapsedMs - currentPitchStartedAt;

      if (inPitchMs < PREP_MS) {
        // PREP phase — pitcher wind-up + 5→1 countdown
        const prepProgress = inPitchMs / PREP_MS;
        if (prepProgress >= 0.55 && prepProgress <= 0.6) {
          scene.pitcherWindup(now);
        }
        scene.setBallProgress(0);
        scene.setMeter(0);
        const remainingSec = Math.max(1, Math.ceil((PREP_MS - inPitchMs) / 1000));
        scene.setCountdown(remainingSec);
      } else if (inPitchMs < PREP_MS + CHARGE_MS && !activePendingSwing) {
        // CHARGE phase — ball approaches, meter fills from time-weighted OO
        // (active mode: Space press sets activePendingSwing to jump to POST early)
        scene.setCountdown(null);
        const chargeMs = inPitchMs - PREP_MS;
        const chargeProgress = Math.min(1, chargeMs / CHARGE_MS);
        scene.setBallProgress(chargeProgress);

        const dtSec = lastTickMs === 0 ? 0 : (now - lastTickMs) / 1000;
        chargeAccum += oo * dtSec;
        chargeSec += dtSec;

        const meter = chargeSec > 0 ? (chargeAccum / chargeSec) / 100 : 0;
        scene.setMeter(meter);
      } else if (inPitchMs < PITCH_MS || activePendingSwing) {
        // POST phase — resolve once, then let the scene animate ball flight
        // active mode: activePendingSwing also enters POST phase early
        scene.setCountdown(null);
        if (!pitchResolved) {
          resolvePitch();
          pitchResolved = true;
          activePendingSwing = false;
        }
      } else {
        // Pitch fully elapsed — advance to the next pitch or end the inning.
        // Safety net: resolve if POST was skipped (pause edge case).
        if (!pitchResolved) {
          resolvePitch();
          pitchResolved = true;
        }
        if (
          inningEndPending ||
          batterIdx >= BATTERS_PER_INNING ||
          pitchCount >= MAX_PITCHES_PER_INNING
        ) {
          inningComplete = true;
        } else {
          if (pendingBatterSwitch) {
            beginAtBat();
            pendingBatterSwitch = false;
          }
          scheduleNextPitch(elapsedMs);
        }
      }
    }

    lastTickMs = now;

    scene.tick({ now, dt, worldW: app.screen.width, worldH: app.screen.height });

    // Emit telemetry every second
    const nowSec = Math.floor(elapsedMs / 1000);
    if (nowSec > lastOoAccumSec) {
      rlSeries.push(oo);
      lastOoAccumSec = nowSec;
    }
    emitStats();

    // End of inning? Wait until the inning is flagged complete AND the
    // post-flight animation has a chance to settle before handing back.
    if (inningComplete && finishCb) {
      inningRuns[runIndex] = runsScored;
      if (modeId === 'dual') {
        if (isTopHalf) teamARuns[inningNumber] = runsScored;
        else teamBRuns[inningNumber] = runsScored;
      }
      const pitches = Math.max(1, pitchCount);
      const result: RunResult = {
        runIndex,
        startedAt: runStartedAt,
        durationMs: elapsedMs,
        rlSeries: rlSeries.slice(),
        qualityPercent: 0,
        isValid: true,
        gameSpecific: {
          pitches,
          whiffs,
          outs,
          hits,
          homeRuns,
          totalBases,
          runsScored,
          meanCharge: Math.round(meanChargeSum / pitches),
          ballparkM: ballpark.wallM,
        },
      };
      const cb = finishCb;
      finishCb = null;
      cb(result);
    }
  };

  function resolvePitch() {
    if (!scene) return;
    const rawCharge = chargeSec > 0 ? chargeAccum / chargeSec : 0;
    // Active mode: apply swing-timing multiplier
    const mult = modeId === 'active' ? activeSwingMult : ACTIVE_NEUTRAL_MULT;
    const clamped = Math.max(0, Math.min(100, rawCharge * mult));
    meanChargeSum += clamped;
    pitchCount += 1;
    const result = resolveHit(clamped, ballpark.wallM);
    lastResult = result.kind;

    let atBatEnded = false;

    if (result.kind === 'whiff') {
      whiffs += 1;
      strikes += 1;
      if (strikes >= MAX_STRIKES) {
        // Strikeout — counted as an out, at-bat ends.
        outs += 1;
        atBatEnded = true;
      }
    } else if (isOut(result.kind)) {
      // Batted out — at-bat ends without incrementing strikes.
      outs += 1;
      atBatEnded = true;
    } else {
      hits += 1;
      totalBases += baseValue(result.kind);
      if (result.kind === 'homeRun') homeRuns += 1;
      runsScored += advanceBases(result.kind);
      atBatEnded = true;
      publishLineScore();
    }

    scene.setRunners(runners);
    scene.swingBat();
    scene.hitBall(result.kind);
    scene.flashResult(result.kind, lang);

    if (atBatEnded) {
      batterIdx += 1;
      if (batterIdx >= BATTERS_PER_INNING || pitchCount >= MAX_PITCHES_PER_INNING) {
        // Inning is over, but let the ball finish its flight first — the
        // tick fall-through branch promotes this to inningComplete once the
        // current pitch cycle elapses.
        inningEndPending = true;
      } else {
        // Defer the actual batter swap until the hit animation completes.
        // The tick fall-through will call beginAtBat() at the start of the
        // next pitch.
        pendingBatterSwitch = true;
      }
    }
  }

  app.ticker.add(tick);

  return {
    startRun(idx, onFinish) {
      runIndex = idx;
      isTopHalf = modeId === 'dual' ? (idx % 2 === 0) : true;
      inningNumber = modeId === 'dual' ? Math.floor(idx / 2) : idx;
      runStartedAt = performance.now();
      pausedTotalMs = 0;
      pausedAtMs = 0;
      pitchCount = 0;
      batterIdx = 0;
      strikes = 0;
      whiffs = 0;
      outs = 0;
      hits = 0;
      homeRuns = 0;
      totalBases = 0;
      runsScored = 0;
      meanChargeSum = 0;
      rlSeries = [];
      lastOoAccumSec = 0;
      chargeAccum = 0;
      chargeSec = 0;
      lastResult = null;
      lastTickMs = 0;
      inningComplete = false;
      inningEndPending = false;
      pendingBatterSwitch = false;
      runners[0] = false;
      runners[1] = false;
      runners[2] = false;
      currentPitchStartedAt = 0;
      pitchResolved = false;
      activeSwingMult = ACTIVE_NEUTRAL_MULT;
      activePendingSwing = false;
      // Ensure the line-score array has a slot for this inning (initialized
      // to 0 so it shows a "0" in the column even before any hit).
      while (inningRuns.length <= idx) inningRuns.push(0);
      inningRuns[idx] = 0;
      finishCb = onFinish;
      if (scene) {
        scene.setBallProgress(0);
        scene.setMeter(0);
        scene.setRunners(runners);
        scene.setCountdown(null);
        publishLineScore();
      }
      beginAtBat();
      scheduleNextPitch(0);
    },
    setRL(next) {
      oo = Math.max(0, Math.min(100, next));
    },
    onInput(event) {
      if (modeId !== 'active') return;
      if (event.type !== 'primary') return;
      if (runIndex < 0 || paused || pitchResolved || activePendingSwing) return;

      // Determine which phase we're currently in
      const elapsed = performance.now() - runStartedAt - pausedTotalMs;
      const inPitchMs = elapsed - currentPitchStartedAt;

      if (inPitchMs < PREP_MS || inPitchMs >= PREP_MS + CHARGE_MS) return; // only during CHARGE

      const chargeProgress = (inPitchMs - PREP_MS) / CHARGE_MS;
      if (chargeProgress < ACTIVE_SWING_EARLY) {
        activeSwingMult = ACTIVE_PENALTY_MULT;
      } else if (chargeProgress >= ACTIVE_SWING_PERFECT_LO && chargeProgress <= ACTIVE_SWING_PERFECT_HI) {
        activeSwingMult = ACTIVE_BONUS_MULT;
      } else {
        activeSwingMult = ACTIVE_NEUTRAL_MULT;
      }
      activePendingSwing = true;
      // Force pitch resolution at end of this frame (tick will fire POST next)
    },
    pause() {
      if (paused) return;
      paused = true;
      pausedAtMs = performance.now();
    },
    resume() {
      if (!paused) return;
      paused = false;
      pausedTotalMs += performance.now() - pausedAtMs;
      lastTickMs = 0; // avoid giant dt on first resumed frame
    },
    destroy() {
      if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
      app.ticker.remove(tick);
      app.renderer.off('resize', resizeListener);
      if (scene) {
        scene.destroy();
        scene = null;
      }
      finishCb = null;
    },
  };
}
