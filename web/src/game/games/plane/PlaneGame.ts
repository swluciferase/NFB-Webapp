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
  const valley = generateValley({
    seed: Date.now() % 1e9,
    lengthPx: 50_000,
    sampleEveryPx: 20,
  });
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

    const speed = 2 + 2 * (oo / 100);
    scrollX += speed * ticker.deltaTime;
    distanceM = scrollX / 10;

    scene.plane.y += (targetY - scene.plane.y) * 0.04 * ticker.deltaTime;

    scene.updateTerrain(scrollX, app.screen.width, app.screen.height);
    scene.updateTrail(oo);

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
        qualityPercent: 0,
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
    onInput() {
      /* Plane has no primary input in M1 */
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    destroy() {
      app.ticker.remove(tick);
      if (scene) {
        scene.destroy();
        scene = null;
      }
      finishCb = null;
    },
  };
}
