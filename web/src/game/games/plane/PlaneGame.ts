import type { Application, Container, Ticker } from 'pixi.js';
import type { GameInstance, RunResult, Theme } from '../../Game';
import { buildPlaneScene, type PlaneScene } from './scene';

export interface PlaneGameArgs {
  app: Application;
  stage: Container;
  theme: Theme;
}

const RUN_DURATION_MS = 90_000;
const PARTICLE_LIFE_MS = 600;
const PARTICLE_SPAWN_INTERVAL_MS = 35;
const MAX_TILT_RAD = 0.45;

interface TrailParticle {
  x: number;
  y: number;
  bornMs: number;
}

export function createPlaneGame(args: PlaneGameArgs): GameInstance {
  const { app, stage, theme } = args;
  let scene: PlaneScene | null = buildPlaneScene(theme);
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

  const particles: TrailParticle[] = [];
  let lastParticleSpawn = 0;
  let prevPlaneY = app.screen.height * 0.5;

  scene.plane.x = 120;
  scene.plane.y = targetY;
  scene.updateBackground(scrollX, app.screen.width, app.screen.height);

  const tick = (ticker: Ticker) => {
    if (paused || !scene) return;

    const w = app.screen.width;
    const h = app.screen.height;
    const now = performance.now();

    if (runIndex < 0) {
      // Idle pre-run: keep the background painted but plane stays put.
      scene.updateBackground(scrollX, w, h);
      return;
    }

    const elapsedMs = now - runStarted;

    const speed = 2 + 2 * (oo / 100);
    scrollX += speed * ticker.deltaTime;
    distanceM = scrollX / 10;

    scene.plane.y += (targetY - scene.plane.y) * 0.04 * ticker.deltaTime;

    // Tilt: rotation lerps toward angle derived from vertical velocity.
    const dy = scene.plane.y - prevPlaneY;
    const targetAngle = Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, dy * 0.05));
    scene.plane.rotation += (targetAngle - scene.plane.rotation) * 0.15;
    prevPlaneY = scene.plane.y;

    // Spawn exhaust particles behind the plane.
    if (now - lastParticleSpawn >= PARTICLE_SPAWN_INTERVAL_MS) {
      particles.push({ x: scene.plane.x - 22, y: scene.plane.y + 1, bornMs: now });
      lastParticleSpawn = now;
    }
    // Cull dead particles.
    for (let i = particles.length - 1; i >= 0; i--) {
      if (now - particles[i].bornMs >= PARTICLE_LIFE_MS) particles.splice(i, 1);
    }

    scene.updateBackground(scrollX, w, h);
    scene.updateTrail(
      particles.map((p) => ({
        x: p.x - (now - p.bornMs) * 0.04,
        y: p.y,
        t: 1 - (now - p.bornMs) / PARTICLE_LIFE_MS,
      })),
      theme.visual.plane.trailColor,
    );

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
      particles.length = 0;
      lastParticleSpawn = 0;
      if (scene) {
        scene.plane.x = 120;
        scene.plane.rotation = 0;
        prevPlaneY = scene.plane.y;
      }
    },
    setOO(next) {
      oo = Math.max(0, Math.min(100, next));
      const groundY = app.screen.height * 0.78;
      const skyY = app.screen.height * 0.22;
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
      particles.length = 0;
      finishCb = null;
    },
  };
}
