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
const SHAKE_OO_THRESHOLD = 70;

// Basic mode
const BASIC_LIVES = 3;
const GROUND_BOUNCE_VEL = -8;

// Alternating mode — missiles
const MISSILE_SPEED = 3.5;
const MISSILE_RADIUS = 10;
const PLANE_HIT_RADIUS = 22;
const MISSILE_SPAWN_INTERVAL_MS = 4000;

// Active mode — enemy plane + shooting
const ENEMY_X_FRACTION = 0.80;
const ENEMY_MOVE_INTERVAL_MS = 3500;
const MISSILE_FLY_SPEED = 6;
const AIM_ADJUST_PX = 18;
const AIM_MAX_OFFSET = 70;

interface TrailParticle {
  g: Graphics;
  bornMs: number;
}

interface Missile {
  g: Graphics;
  x: number;
  y: number;
  active: boolean;
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
  scene.layout(app.screen.width, app.screen.height);

  let oo = 0;
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

  // Basic mode — lives
  let lives = BASIC_LIVES;
  let groundBounceVel = 0;
  let planeVelY = 0;
  let livesLost = 0;

  // Alternating mode — incoming missiles
  const incomingMissiles: Missile[] = [];
  let lastMissileSpawn = 0;
  let altScore = 0;
  let altMisses = 0;

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

  function drawHud() {
    hudG.clear();
    if (runIndex < 0) return;

    if (modeId === 'basic') {
      // Draw life pips in top-left
      for (let i = 0; i < BASIC_LIVES; i++) {
        const full = i < lives;
        hudG.circle(24 + i * 22, 22, 8);
        if (full) hudG.fill({ color: 0x58a6ff });
        else hudG.fill({ color: 0x334455 });
      }
    } else if (modeId === 'alternating') {
      // Draw score in top-left
      hudG.rect(8, 8, 110, 24).fill({ color: 0, alpha: 0.4 });
    } else if (modeId === 'active') {
      // Draw aim indicator: horizontal line showing missile trajectory
      if (scene) {
        const px = scene.plane.x;
        const py = scene.plane.y + aimOffset;
        hudG.moveTo(px + 20, py).lineTo(px + 80, py);
        hudG.stroke({ color: 0xffaa00, width: 2, alpha: 0.7 });
        hudG.circle(px + 20, py, 4).fill({ color: 0xffaa00, alpha: 0.9 });
      }
    }
  }

  // ── Tick helper: spawn + animate incoming missiles (alternating mode) ─────

  function tickAlternating(now: number, w: number, h: number, dt: number) {
    if (!scene) return;
    const groundY = h * 0.78;
    const skyY = h * 0.22;

    // Spawn a new missile if slot is empty and enough time has passed
    if (incomingMissiles.length === 0 && now - lastMissileSpawn >= MISSILE_SPAWN_INTERVAL_MS) {
      const g = new Graphics();
      g.circle(0, 0, MISSILE_RADIUS).fill({ color: 0xff3333 });
      const spawnY = skyY + Math.random() * (groundY - skyY);
      g.x = w + MISSILE_RADIUS;
      g.y = spawnY;
      scene.trailLayer.addChild(g);
      incomingMissiles.push({ g, x: g.x, y: spawnY, active: true });
      lastMissileSpawn = now;
    }

    // Move missiles
    for (let i = incomingMissiles.length - 1; i >= 0; i--) {
      const m = incomingMissiles[i];
      if (!m.active) { incomingMissiles.splice(i, 1); continue; }

      m.x -= MISSILE_SPEED * dt;
      m.g.x = m.x;

      // Check collision with plane
      const planeX = scene.plane.x;
      const planeY = scene.plane.y;
      const dx = m.x - planeX;
      const dy = m.y - planeY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLANE_HIT_RADIUS + MISSILE_RADIUS) {
        // Hit!
        altMisses++;
        scene.trailLayer.removeChild(m.g);
        m.g.destroy();
        m.active = false;
        incomingMissiles.splice(i, 1);
        lastMissileSpawn = now - MISSILE_SPAWN_INTERVAL_MS * 0.5; // short cooldown
        continue;
      }

      // Passed behind the plane: successful dodge
      if (m.x < planeX - PLANE_HIT_RADIUS - MISSILE_RADIUS) {
        altScore++;
        scene.trailLayer.removeChild(m.g);
        m.g.destroy();
        m.active = false;
        incomingMissiles.splice(i, 1);
      }

      // Off screen left
      if (m.x < -MISSILE_RADIUS * 2) {
        scene.trailLayer.removeChild(m.g);
        m.g.destroy();
        m.active = false;
        incomingMissiles.splice(i, 1);
      }
    }
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

    const speed = 2 + 2 * (oo / 100);

    if (runIndex < 0) {
      scrollX += 0.6 * dt;
      scene.tick({ scrollX, speed: 1, dt, now, worldW: w, worldH: h });
      emitStats(h);
      drawHud();
      return;
    }

    const elapsedMs = now - runStarted;
    scrollX += speed * dt;
    distanceM = scrollX / 10;

    // Vertical target from OO
    const groundY = h * 0.78;
    const skyY = h * 0.22;
    targetY = skyY + (groundY - skyY) * (1 - oo / 100);

    // ── Basic mode: apply vertical velocity + life loss on ground touch ──
    if (modeId === 'basic') {
      if (groundBounceVel !== 0) {
        planeVelY += groundBounceVel;
        groundBounceVel = 0;
      }
      // Dampen vel, blend toward OO-target
      planeVelY *= 0.85;
      scene.plane.y += planeVelY * dt;
      scene.plane.y += (targetY - scene.plane.y) * 0.025 * dt;

      // Ground collision
      if (scene.plane.y >= groundY - 10) {
        scene.plane.y = groundY - 10;
        lives = Math.max(0, lives - 1);
        livesLost++;
        planeVelY = GROUND_BOUNCE_VEL;
        if (lives <= 0) {
          // End run early
          const result: RunResult = {
            runIndex,
            startedAt: runStarted,
            durationMs: elapsedMs,
            rlSeries,
            qualityPercent: 0,
            isValid: true,
            gameSpecific: { distanceM: Math.round(distanceM), livesLost, timeAboveMidSec },
          };
          const cb = finishCb;
          finishCb = null;
          cb?.(result);
          return;
        }
      }
      // Sky ceiling
      if (scene.plane.y <= skyY) scene.plane.y = skyY;
    } else {
      // Normal smooth movement for other modes
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
    propAngle += (PROP_BASE_RPS + oo * 0.012) * dt;
    scene.propHub.rotation = propAngle;
    const propSquash = 0.35 + Math.max(0, 1 - oo * 0.008);
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
    if (oo > SHAKE_OO_THRESHOLD) {
      const mag = (oo - SHAKE_OO_THRESHOLD) * 0.08;
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
      rlSeries.push(oo);
      if (oo >= 50) timeAboveMidSec++;
      lastAccumSec = nowSec;
    }

    emitStats(h);
    drawHud();

    if (elapsedMs >= RUN_DURATION_MS && finishCb && runIndex >= 0) {
      const gameSpecific: Record<string, number | boolean> =
        modeId === 'alternating' ? { score: altScore, misses: altMisses, distanceM: Math.round(distanceM) }
        : modeId === 'active'    ? { hits: activeHits, misses: activeMisses }
        : { distanceM: Math.round(distanceM), timeAboveMidSec, livesLost };
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
      rl: runIndex >= 0 ? Math.round(oo) : 0,
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
      lives = BASIC_LIVES;
      livesLost = 0;
      planeVelY = 0;
      groundBounceVel = 0;
      altScore = 0;
      altMisses = 0;
      activeHits = 0;
      activeMisses = 0;
      aimOffset = 0;
      canFire = true;
      lastMissileSpawn = performance.now() - MISSILE_SPAWN_INTERVAL_MS + 1000; // first missile after 1s
      lastEnemyMove = performance.now();
      if (enemyG) {
        enemyY = app.screen.height * 0.5;
        enemyTargetY = app.screen.height * 0.5;
        enemyG.y = enemyY;
      }
      // Clear any stale missiles
      for (const m of incomingMissiles) {
        scene?.trailLayer.removeChild(m.g);
        m.g.destroy();
      }
      incomingMissiles.length = 0;
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
      oo = Math.max(0, Math.min(100, next));
      const groundY = app.screen.height * 0.78;
      const skyY = app.screen.height * 0.22;
      targetY = skyY + (groundY - skyY) * (1 - oo / 100);
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
      for (const m of incomingMissiles) m.g.destroy();
      incomingMissiles.length = 0;
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
