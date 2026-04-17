import { Graphics, type Application, type Container, type Ticker } from 'pixi.js';
import type { GameInputEvent, GameInstance, GameStatsListener, RunResult, Theme } from '../../Game';
import { buildPlaneScene, type PlaneScene } from './scene';

export interface PlaneGameArgs {
  app: Application;
  stage: Container;
  theme: Theme;
  modeId?: string;
  onStats?: GameStatsListener;
}

const RUN_DURATION_MS = 90_000;
const TRAIL_LIFE_MS = 700;
const TRAIL_SPAWN_INTERVAL_MS = 28;
const MAX_TILT_RAD = 0.5;
const PROP_BASE_RPS = 0.6;
const SHAKE_RL_THRESHOLD = 70;

// Shared — fuel system
const MAX_FUEL = 5;
const FLICKER_DURATION_MS = 1500;
const FLICKER_HZ = 8;

// Basic mode
const GROUND_BOUNCE_VEL = -8;

// Alternating mode — balloons
const BALLOON_RADIUS = 18;
const BALLOON_HIT_RADIUS = 28;
const BALLOON_SPAWN_INTERVAL_MIN_MS = 3000;
const BALLOON_SPAWN_INTERVAL_MAX_MS = 5000;
const PICKUP_FUEL_THRESHOLD = 3;

// Active mode
const ENEMY_X_FRACTION = 0.80;
const MISSILE_FLY_SPEED = 9;
const AIM_ADJUST_PX = 12;
const AIM_MAX_OFFSET = 40;
const ENEMY_DRIFT_MS = 800;

interface TrailParticle {
  g: Graphics;
  bornMs: number;
}

interface PlayerMissile {
  g: Graphics;
  x: number;
  y: number;
  targetY: number;
  active: boolean;
}

export function createPlaneGame(args: PlaneGameArgs): GameInstance {
  const { app, stage, theme, modeId = 'basic', onStats } = args;
  let scene: PlaneScene | null = buildPlaneScene(theme);
  stage.addChild(scene.root);
  scene.layout(app.screen.width, app.screen.height, true);

  let rl = 0;
  let targetY = app.screen.height * 0.5;
  let runIndex = -1;
  let runStarted = 0;
  let finishCb: ((r: RunResult) => void) | null = null;
  let scrollX = 0;
  let distanceM = 0;
  let paused = false;
  let rlSeries: number[] = [];
  let timeAboveMidSec = 0;
  let lastAccumSec = 0;

  // Shared — fuel
  let fuel = MAX_FUEL;
  let fuelLost = 0;
  let flickerUntilMs = 0;

  // Basic mode
  let groundBounceVel = 0;
  let planeVelY = 0;

  // Alternating mode — balloons
  interface BalloonSprite {
    g: Graphics;
    x: number;
    y: number;
    isPickup: boolean;
    active: boolean;
  }
  const balloons: BalloonSprite[] = [];
  let nextBalloonSpawnMs = 0;
  let pickupsCollected = 0;

  // Active mode — enemy + player missiles
  let enemyG: Graphics | null = null;
  let enemyY = app.screen.height * 0.5;
  let enemyTargetY = app.screen.height * 0.5;
  let lastEnemyMove = 0;
  let playerMissile: PlayerMissile | null = null;
  let aimOffset = 0;
  let activeHits = 0;
  let activeMisses = 0;
  let canFire = true;

  // Active mode — drift
  let enemyDriftTarget = -1;
  let enemyDriftStartY = 0;
  let enemyDriftStartMs = 0;

  // HUD overlay for lives / score
  const hudG = new Graphics();
  stage.addChild(hudG);

  const particles: TrailParticle[] = [];
  let lastParticleSpawn = 0;
  let prevPlaneY = app.screen.height * 0.5;
  let propAngle = 0;
  let shakeX = 0;
  let shakeY = 0;

  scene.plane.x = app.screen.width * 0.28;
  scene.plane.y = app.screen.height * 0.5;
  prevPlaneY = scene.plane.y;

  // ── Mode-specific setup ────────────────────────────────────────────────────

  function setupActiveMode() {
    enemyG = new Graphics();
    // Simple enemy plane: a red diamond shape
    enemyG.poly([0, -14, 28, 0, 0, 14, 6, 0]).fill({ color: 0xff4444 });
    enemyG.alpha = 0.9;
    scene?.trailLayer.addChild(enemyG);
    enemyY = app.screen.height * 0.5;
    enemyTargetY = app.screen.height * 0.5;
    if (enemyG) {
      enemyG.x = app.screen.width * ENEMY_X_FRACTION;
      enemyG.y = enemyY;
    }
  }

  if (modeId === 'active') {
    setupActiveMode();
  }

  // ── Resize handler ─────────────────────────────────────────────────────────

  let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const resizeListener = () => {
    if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      resizeDebounceTimer = null;
      if (!scene) return;
      scene.layout(app.screen.width, app.screen.height);
      scene.plane.x = app.screen.width * 0.28;
      if (enemyG) enemyG.x = app.screen.width * ENEMY_X_FRACTION;
    }, 150);
  };
  app.renderer.on('resize', resizeListener);

  // ── HUD drawing ────────────────────────────────────────────────────────────

  function drawFuelHud() {
    if (runIndex < 0) return;
    if (modeId === 'active') return;   // active mode uses its own aim HUD

    hudG.clear();
    const barrelR = 9;
    const spacing = 24;
    const startX = 20;
    const cy = 22;

    for (let i = 0; i < MAX_FUEL; i++) {
      const cx = startX + i * spacing;
      const full = i < fuel;
      hudG.roundRect(cx - barrelR, cy - barrelR, barrelR * 2, barrelR * 2, 3);
      hudG.fill({ color: full ? 0xf0a93e : 0x334455 });
      // Top rim highlight
      hudG.rect(cx - barrelR + 2, cy - barrelR, (barrelR - 2) * 2, 2);
      hudG.fill({ color: full ? 0xffc966 : 0x445566 });
    }
  }

  function drawActiveHud() {
    if (modeId !== 'active' || runIndex < 0 || !scene) return;
    hudG.clear();
    const px = scene.plane.x;
    const py = scene.plane.y + aimOffset;
    hudG.moveTo(px + 20, py).lineTo(px + 80, py);
    hudG.stroke({ color: 0xffaa00, width: 2, alpha: 0.7 });
    hudG.circle(px + 20, py, 4).fill({ color: 0xffaa00, alpha: 0.9 });
  }

  // ── Tick helper: spawn balloon (alternating mode) ─────────────────────────

  function spawnBalloon(now: number, w: number, h: number) {
    if (!scene) return;
    const skyY = h * 0.22;
    const groundY = h * 0.78;
    const isPickup = fuel < PICKUP_FUEL_THRESHOLD && Math.random() < 0.4;
    const color = isPickup ? 0x44cc66 : 0xff4444;
    const y = skyY + Math.random() * (groundY - skyY);

    const g = new Graphics();
    g.circle(0, -BALLOON_RADIUS, BALLOON_RADIUS).fill({ color, alpha: 0.9 });
    g.moveTo(0, 0).lineTo(0, -BALLOON_RADIUS + 2);
    g.stroke({ color: 0x334455, width: 2 });
    g.x = w + BALLOON_RADIUS;
    g.y = y;
    scene.trailLayer.addChild(g);
    balloons.push({ g, x: g.x, y, isPickup, active: true });

    nextBalloonSpawnMs = now
      + BALLOON_SPAWN_INTERVAL_MIN_MS
      + Math.random() * (BALLOON_SPAWN_INTERVAL_MAX_MS - BALLOON_SPAWN_INTERVAL_MIN_MS);
  }

  // ── Tick helper: move + collide balloons (alternating mode) ───────────────

  function tickAlternating(now: number, w: number, h: number, dt: number) {
    if (!scene) return;

    // Spawn batch when timer fires
    if (now >= nextBalloonSpawnMs) {
      const count = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < count; i++) spawnBalloon(now, w, h);
    }

    const isFlickering = now < flickerUntilMs;
    const planeX = scene.plane.x;
    const planeY = scene.plane.y;
    const scrollSpeed = 2 + 2 * (rl / 100);

    for (let i = balloons.length - 1; i >= 0; i--) {
      const b = balloons[i];
      if (!b.active) { balloons.splice(i, 1); continue; }

      b.x -= scrollSpeed * dt;
      b.g.x = b.x;

      // Off-screen left
      if (b.x < -BALLOON_RADIUS * 2) {
        scene.trailLayer.removeChild(b.g);
        b.g.destroy();
        balloons.splice(i, 1);
        continue;
      }

      // Collision: compare plane center to balloon circle center
      const dx = b.x - planeX;
      const dy = (b.y - BALLOON_RADIUS) - planeY;
      if (Math.sqrt(dx * dx + dy * dy) < BALLOON_HIT_RADIUS) {
        scene.trailLayer.removeChild(b.g);
        b.g.destroy();
        b.active = false;
        balloons.splice(i, 1);

        if (b.isPickup) {
          fuel = Math.min(MAX_FUEL, fuel + 1);
          pickupsCollected++;
        } else if (!isFlickering) {
          fuel = Math.max(0, fuel - 1);
          fuelLost++;
          flickerUntilMs = now + FLICKER_DURATION_MS;
          if (fuel <= 0) {
            const result: RunResult = {
              runIndex,
              startedAt: runStarted,
              durationMs: now - runStarted,
              rlSeries,
              qualityPercent: 0,
              isValid: true,
              gameSpecific: { fuelLost, pickupsCollected, distanceM: Math.round(distanceM) },
            };
            const cb = finishCb;
            finishCb = null;
            runIndex = -1;
            cb?.(result);
            return;
          }
        }
      }
    }

    // Flicker plane alpha
    const isFlickeringNow = now < flickerUntilMs;
    scene.plane.alpha = isFlickeringNow
      ? 0.3 + 0.7 * Math.abs(Math.sin(now * FLICKER_HZ * Math.PI / 1000))
      : 1;
  }

  // ── Tick helper: enemy + player missiles (active mode) ────────────────────

  function tickActive(now: number, w: number, h: number, dt: number) {
    if (!scene || !enemyG) return;
    const skyY = h * 0.22;
    const groundY = h * 0.78;

    // Enemy plane drifts toward target
    if (now - lastEnemyMove > ENEMY_MOVE_INTERVAL_MS) {
      enemyTargetY = skyY + Math.random() * (groundY - skyY);
      lastEnemyMove = now;
    }
    enemyY += (enemyTargetY - enemyY) * 0.02 * dt;
    enemyG.y = enemyY;
    enemyG.x = w * ENEMY_X_FRACTION;

    // Player missile flight
    if (playerMissile?.active) {
      const pm = playerMissile;
      pm.x += MISSILE_FLY_SPEED * dt;
      pm.g.x = pm.x;

      // Gradually home toward targetY
      pm.y += (pm.targetY - pm.y) * 0.06 * dt;
      pm.g.y = pm.y;

      // Hit check
      const enemyX = enemyG.x;
      if (pm.x >= enemyX - 20 && pm.x <= enemyX + 40) {
        if (Math.abs(pm.y - enemyY) < 36) {
          // Hit!
          activeHits++;
          // Flash enemy red
          enemyG.alpha = 0.3;
          setTimeout(() => { if (enemyG) enemyG.alpha = 0.9; }, 200);
          // Respawn enemy
          enemyTargetY = skyY + Math.random() * (groundY - skyY);
          lastEnemyMove = now;
        } else {
          activeMisses++;
        }
        // Destroy missile
        scene.trailLayer.removeChild(pm.g);
        pm.g.destroy();
        playerMissile = null;
        canFire = true;
      }

      // Off-screen right
      if (pm.x > w + 40) {
        activeMisses++;
        scene.trailLayer.removeChild(pm.g);
        pm.g.destroy();
        playerMissile = null;
        canFire = true;
      }
    }
  }

  // ── Main tick ──────────────────────────────────────────────────────────────

  const tick = (ticker: Ticker) => {
    if (paused || !scene) return;

    const w = app.screen.width;
    const h = app.screen.height;
    const now = performance.now();
    const dt = ticker.deltaTime;

    const speed = 2 + 2 * (rl / 100);

    if (runIndex < 0) {
      scrollX += 0.6 * dt;
      scene.tick({ scrollX, speed: 1, dt, now, worldW: w, worldH: h });
      emitStats(h);
      drawFuelHud();
      return;
    }

    const elapsedMs = now - runStarted;
    scrollX += speed * dt;
    distanceM = scrollX / 10;

    // Vertical target from OO
    const groundY = h * 0.78;
    const skyY = h * 0.22;
    targetY = skyY + (groundY - skyY) * (1 - rl / 100);

    // ── Basic / alternating: vertical movement + fuel system ──────────────────
    if (modeId === 'basic') {
      if (groundBounceVel !== 0) {
        planeVelY += groundBounceVel;
        groundBounceVel = 0;
      }
      planeVelY *= 0.85;
      scene.plane.y += planeVelY * dt;
      scene.plane.y += (targetY - scene.plane.y) * 0.025 * dt;

      const isFlickering = now < flickerUntilMs;

      if (scene.plane.y >= groundY - 10) {
        scene.plane.y = groundY - 10;
        if (!isFlickering) {
          fuel = Math.max(0, fuel - 1);
          fuelLost++;
          flickerUntilMs = now + FLICKER_DURATION_MS;
          groundBounceVel = GROUND_BOUNCE_VEL;
        }
        if (fuel <= 0) {
          const result: RunResult = {
            runIndex,
            startedAt: runStarted,
            durationMs: now - runStarted,
            rlSeries,
            qualityPercent: 0,
            isValid: true,
            gameSpecific: { distanceM: Math.round(distanceM), timeAboveMidSec, fuelLost },
          };
          const cb = finishCb;
          finishCb = null;
          runIndex = -1;
          cb?.(result);
          return;
        }
      }

      // Flicker: oscillate plane alpha
      scene.plane.alpha = isFlickering
        ? 0.3 + 0.7 * Math.abs(Math.sin(now * FLICKER_HZ * Math.PI / 1000))
        : 1;

      if (scene.plane.y <= skyY) scene.plane.y = skyY;
    } else {
      scene.plane.alpha = 1;
      scene.plane.y += (targetY - scene.plane.y) * 0.045 * dt;
    }

    // ── Mode-specific updates ──
    if (modeId === 'alternating') tickAlternating(now, w, h, dt);
    if (modeId === 'active')      tickActive(now, w, h, dt);

    // Banking tilt from vertical velocity
    const dy = scene.plane.y - prevPlaneY;
    const targetAngle = Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, dy * 0.06));
    scene.plane.rotation += (targetAngle - scene.plane.rotation) * 0.15 * dt;
    prevPlaneY = scene.plane.y;

    // Propeller
    propAngle += (PROP_BASE_RPS + rl * 0.012) * dt;
    scene.propHub.rotation = propAngle;
    const propSquash = 0.35 + Math.max(0, 1 - rl * 0.008);
    scene.propHub.scale.x = Math.min(1, propSquash);

    // Exhaust particles
    if (now - lastParticleSpawn >= TRAIL_SPAWN_INTERVAL_MS) {
      const g = new Graphics();
      g.circle(0, 0, 6).fill({ color: 0xffffff });
      g.x = scene.plane.x - 30 + (Math.random() - 0.5) * 6;
      g.y = scene.plane.y + 2 + (Math.random() - 0.5) * 4;
      g.alpha = 0.9 * theme.visual.ambient;
      scene.trailLayer.addChild(g);
      particles.push({ g, bornMs: now });
      lastParticleSpawn = now;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.bornMs;
      if (age >= TRAIL_LIFE_MS) {
        scene.trailLayer.removeChild(p.g);
        p.g.destroy();
        particles.splice(i, 1);
        continue;
      }
      const t = age / TRAIL_LIFE_MS;
      p.g.x -= speed * 0.9 * dt;
      p.g.y += 0.15 * dt;
      p.g.alpha = (1 - t) * 0.8 * theme.visual.ambient;
      p.g.scale.set(0.8 + t * 1.4);
    }

    // Camera shake
    if (rl > SHAKE_RL_THRESHOLD) {
      const mag = (rl - SHAKE_RL_THRESHOLD) * 0.08;
      shakeX = (Math.random() - 0.5) * mag;
      shakeY = (Math.random() - 0.5) * mag;
    } else {
      shakeX *= 0.9;
      shakeY *= 0.9;
    }
    stage.x = shakeX;
    stage.y = shakeY;

    scene.tick({ scrollX, speed, dt, now, worldW: w, worldH: h });

    // Telemetry
    const nowSec = Math.floor(elapsedMs / 1000);
    if (nowSec > lastAccumSec) {
      rlSeries.push(rl);
      if (rl >= 50) timeAboveMidSec++;
      lastAccumSec = nowSec;
    }

    emitStats(h);
    drawFuelHud();
    drawActiveHud();

    if (elapsedMs >= RUN_DURATION_MS && finishCb && runIndex >= 0) {
      const gameSpecific: Record<string, number | boolean> =
        modeId === 'alternating' ? { fuelLost, pickupsCollected, distanceM: Math.round(distanceM) }
        : modeId === 'active'    ? { hits: activeHits, misses: activeMisses }
        : { distanceM: Math.round(distanceM), timeAboveMidSec, fuelLost };
      const result: RunResult = {
        runIndex,
        startedAt: runStarted,
        durationMs: elapsedMs,
        rlSeries,
        qualityPercent: 0,
        isValid: true,
        gameSpecific,
      };
      const cb = finishCb;
      finishCb = null;
      cb(result);
    }
  };

  function emitStats(h: number) {
    if (!onStats || !scene) return;
    const topY = h * 0.22;
    const botY = h * 0.78;
    const frac = 1 - (scene.plane.y - topY) / Math.max(1, botY - topY);
    const altitudeM = Math.max(0, Math.round(120 + frac * 440));
    onStats({
      rl: runIndex >= 0 ? Math.round(rl) : 0,
      altitudeM,
      distanceM: Math.round(distanceM),
    });
  }

  app.ticker.add(tick);

  // ── Public interface ──────────────────────────────────────────────────────

  return {
    startRun(idx, onFinish) {
      runIndex = idx;
      runStarted = performance.now();
      scrollX = 0;
      distanceM = 0;
      rlSeries = [];
      timeAboveMidSec = 0;
      lastAccumSec = 0;
      finishCb = onFinish;
      // Reset fuel state
      fuel = MAX_FUEL;
      fuelLost = 0;
      flickerUntilMs = 0;
      planeVelY = 0;
      groundBounceVel = 0;
      if (scene) scene.plane.alpha = 1;
      // Reset alternating mode state
      for (const b of balloons) {
        scene?.trailLayer.removeChild(b.g);
        b.g.destroy();
      }
      balloons.length = 0;
      nextBalloonSpawnMs = performance.now() + 1500; // first balloon after 1.5s
      pickupsCollected = 0;
      activeHits = 0;
      activeMisses = 0;
      aimOffset = 0;
      canFire = true;
      lastEnemyMove = performance.now();
      if (enemyG) {
        enemyY = app.screen.height * 0.5;
        enemyTargetY = app.screen.height * 0.5;
        enemyG.y = enemyY;
      }
      if (playerMissile) {
        scene?.trailLayer.removeChild(playerMissile.g);
        playerMissile.g.destroy();
        playerMissile = null;
      }
      for (const p of particles) {
        scene?.trailLayer.removeChild(p.g);
        p.g.destroy();
      }
      particles.length = 0;
      lastParticleSpawn = 0;
      if (scene) {
        scene.plane.x = app.screen.width * 0.28;
        scene.plane.rotation = 0;
        prevPlaneY = scene.plane.y;
      }
    },
    setRL(next) {
      rl = Math.max(0, Math.min(100, next));
      const groundY = app.screen.height * 0.78;
      const skyY = app.screen.height * 0.22;
      targetY = skyY + (groundY - skyY) * (1 - rl / 100);
    },
    onInput(event: GameInputEvent) {
      if (runIndex < 0 || paused) return;
      if (modeId === 'active') {
        if (event.type === 'primary' && canFire && !playerMissile && scene) {
          // Fire a missile
          const g = new Graphics();
          g.rect(-12, -3, 24, 6).fill({ color: 0xffcc00 });
          g.x = scene.plane.x + 20;
          g.y = scene.plane.y + aimOffset;
          scene.trailLayer.addChild(g);
          playerMissile = {
            g,
            x: scene.plane.x + 20,
            y: scene.plane.y + aimOffset,
            targetY: scene.plane.y + aimOffset,
            active: true,
          };
          canFire = false;
          setTimeout(() => { canFire = true; }, 400);
        } else if (event.type === 'direction') {
          if (event.dy === -1) aimOffset = Math.max(-AIM_MAX_OFFSET, aimOffset - AIM_ADJUST_PX);
          if (event.dy === 1)  aimOffset = Math.min(AIM_MAX_OFFSET,  aimOffset + AIM_ADJUST_PX);
        }
      }
    },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() {
      if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
      app.ticker.remove(tick);
      app.renderer.off('resize', resizeListener);
      for (const p of particles) p.g.destroy();
      particles.length = 0;
      for (const b of balloons) b.g.destroy();
      balloons.length = 0;
      if (playerMissile) { playerMissile.g.destroy(); playerMissile = null; }
      if (enemyG) { enemyG.destroy(); enemyG = null; }
      hudG.destroy();
      if (scene) {
        scene.destroy();
        scene = null;
      }
      stage.x = 0;
      stage.y = 0;
      finishCb = null;
    },
  };
}
