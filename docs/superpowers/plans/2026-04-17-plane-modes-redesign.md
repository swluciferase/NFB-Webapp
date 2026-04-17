# PlaneGame Modes Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `PlaneGame.ts` to implement three redesigned modes: basic (5 fuel barrels, ground-touch deduction + flicker), alternating (red/green balloon obstacles), active (±40px aim, missile fires on Space, enemy drifts on miss).

**Architecture:** Single-file rewrite of `PlaneGame.ts`. Rename internal `oo` → `rl`. Replace the three mode-specific blocks in-place; shared fuel system (`fuel`, `flickerUntilMs`, `drawFuelHud()`) spans basic and alternating. Active mode keeps the enemy-plane + missile framework but removes timer-based drift in favour of miss-triggered drift.

**Tech Stack:** PIXI.js v8, TypeScript, Bun

---

### Task 1: Rename internal variable `oo` → `rl`

**Files:**
- Modify: `web/src/game/games/plane/PlaneGame.ts`

- [ ] **Step 1: Rename the declaration and all references**

Open `PlaneGame.ts`. Apply these exact string replacements (use `replace_all` for the repeated patterns):

| Old | New |
|-----|-----|
| `let oo = 0;` | `let rl = 0;` |
| `2 + 2 * (oo / 100)` | `2 + 2 * (rl / 100)` |
| `(1 - oo / 100)` | `(1 - rl / 100)` |
| `rlSeries.push(oo)` | `rlSeries.push(rl)` |
| `if (oo >= 50)` | `if (rl >= 50)` |
| `PROP_BASE_RPS + oo * 0.012` | `PROP_BASE_RPS + rl * 0.012` |
| `1 - oo * 0.008` | `1 - rl * 0.008` |
| `SHAKE_OO_THRESHOLD` | `SHAKE_RL_THRESHOLD` (rename constant too) |
| `Math.round(oo)` | `Math.round(rl)` |
| `oo = Math.max(0` | `rl = Math.max(0` |
| `(1 - oo / 100)` (in `setRL`) | `(1 - rl / 100)` |

Also rename the constant at the top:
```ts
// Before:
const SHAKE_OO_THRESHOLD = 70;
// After:
const SHAKE_RL_THRESHOLD = 70;
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run build 2>&1 | tail -20
```
Expected: clean build, zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/swryociao/NFB-Webapp && git add web/src/game/games/plane/PlaneGame.ts
git commit -m "refactor(plane): rename internal oo→rl variable"
```

---

### Task 2: Replace stale constants + state; add fuel system scaffolding

**Files:**
- Modify: `web/src/game/games/plane/PlaneGame.ts`

- [ ] **Step 1: Replace constants block**

Remove all constants from `// Basic mode` through `// Active mode` (the old `BASIC_LIVES`, `MISSILE_*`, `ENEMY_*`, `AIM_*`) and replace with:

```ts
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
const MISSILE_FLY_SPEED = 9;          // ≈ 1.5× scroll speed at rl=100
const AIM_ADJUST_PX = 12;
const AIM_MAX_OFFSET = 40;
const ENEMY_DRIFT_MS = 800;
```

- [ ] **Step 2: Replace stale state variables**

Remove the `// Basic mode — lives` block and the `// Alternating mode — incoming missiles` block (including the `interface Missile` and `interface PlayerMissile` blocks if present only for those modes).

Replace with:

```ts
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

// Active mode (keep existing: enemyG, enemyY, enemyTargetY, playerMissile, aimOffset, activeHits, activeMisses, canFire)
// Add drift state:
let enemyDriftTarget = -1;     // -1 = not drifting
let enemyDriftStartY = 0;
let enemyDriftStartMs = 0;
```

Remove `lastEnemyMove`, `ENEMY_MOVE_INTERVAL_MS` references (no longer used).

- [ ] **Step 3: Verify build (will have errors — that's expected)**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run build 2>&1 | grep "error" | head -20
```
Errors expected where old variables (`lives`, `altScore`, etc.) are still referenced in tick/helper functions. These are fixed in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp && git add web/src/game/games/plane/PlaneGame.ts
git commit -m "refactor(plane): replace stale constants/state with fuel system scaffolding"
```

---

### Task 3: Implement `drawFuelHud()` — oil barrel HUD

**Files:**
- Modify: `web/src/game/games/plane/PlaneGame.ts`

- [ ] **Step 1: Replace `drawHud()` with `drawFuelHud()`**

Find the existing `function drawHud()` block and replace it entirely:

```ts
function drawFuelHud() {
  hudG.clear();
  if (runIndex < 0) return;
  if (modeId === 'active') return;   // active mode uses its own aim HUD

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
```

- [ ] **Step 2: Replace `drawHud()` call sites in `tick()`**

Find all `drawHud()` calls in `tick()` and replace with:
```ts
drawFuelHud();
// Active mode aim indicator
if (modeId === 'active' && runIndex >= 0 && scene) {
  hudG.clear();
  const px = scene.plane.x;
  const py = scene.plane.y + aimOffset;
  hudG.moveTo(px + 20, py).lineTo(px + 80, py);
  hudG.stroke({ color: 0xffaa00, width: 2, alpha: 0.7 });
  hudG.circle(px + 20, py, 4).fill({ color: 0xffaa00, alpha: 0.9 });
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp && git add web/src/game/games/plane/PlaneGame.ts
git commit -m "feat(plane): add drawFuelHud() — 5 oil barrel HUD for basic/alternating"
```

---

### Task 4: Rewrite basic mode — fuel deduction + flicker

**Files:**
- Modify: `web/src/game/games/plane/PlaneGame.ts`

- [ ] **Step 1: Replace the basic mode block inside `tick()`**

Find the comment `// ── Basic mode: apply vertical velocity + life loss on ground touch ──` and replace that entire `if (modeId === 'basic') { ... } else { ... }` block with:

```ts
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
```

- [ ] **Step 2: Verify build — clean**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/swryociao/NFB-Webapp && git add web/src/game/games/plane/PlaneGame.ts
git commit -m "feat(plane): rewrite basic mode — 5 fuel barrels + flicker invincibility"
```

---

### Task 5: Rewrite alternating mode — red/green balloon system

**Files:**
- Modify: `web/src/game/games/plane/PlaneGame.ts`

- [ ] **Step 1: Delete old `tickAlternating()` and `Missile` interface**

Remove the `interface Missile { ... }` block and the entire old `function tickAlternating(...)` function body.

- [ ] **Step 2: Add `spawnBalloon()` helper** (before `tick()`)

```ts
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
```

- [ ] **Step 3: Add new `tickAlternating()` function** (before `tick()`)

```ts
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
          cb?.(result);
          return;
        }
      }
    }
  }

  // Flicker plane alpha (shared with basic mode variable)
  scene.plane.alpha = isFlickering
    ? 0.3 + 0.7 * Math.abs(Math.sin(now * FLICKER_HZ * Math.PI / 1000))
    : 1;
}
```

- [ ] **Step 4: Update `startRun()` — reset fuel + balloon state**

Inside `startRun()`, after `particles.length = 0;`, add:

```ts
// Reset fuel state (basic + alternating)
fuel = MAX_FUEL;
fuelLost = 0;
flickerUntilMs = 0;
pickupsCollected = 0;
// Clear any stale balloons
for (const b of balloons) {
  scene?.trailLayer.removeChild(b.g);
  b.g.destroy();
}
balloons.length = 0;
nextBalloonSpawnMs = performance.now() + 1500; // first balloon after 1.5s
```

Also remove the old `lives = BASIC_LIVES; livesLost = 0;` lines if still present.

- [ ] **Step 5: Add balloon cleanup in `destroy()`**

Inside `destroy()`, before `hudG.destroy();`:
```ts
for (const b of balloons) b.g.destroy();
balloons.length = 0;
```

- [ ] **Step 6: Verify build — clean**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run build 2>&1 | tail -20
```
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/swryociao/NFB-Webapp && git add web/src/game/games/plane/PlaneGame.ts
git commit -m "feat(plane): rewrite alternating mode — red/green balloon obstacles"
```

---

### Task 6: Adjust active mode — ±40px aim + miss-triggered enemy drift

**Files:**
- Modify: `web/src/game/games/plane/PlaneGame.ts`

Note: `AIM_MAX_OFFSET = 40`, `AIM_ADJUST_PX = 12`, `ENEMY_DRIFT_MS = 800`, and the drift state variables (`enemyDriftTarget`, `enemyDriftStartY`, `enemyDriftStartMs`) were already declared in Task 2.

- [ ] **Step 1: Add `startEnemyDrift()` helper** (before `tick()`)

```ts
function startEnemyDrift(skyY: number, groundY: number, now: number) {
  enemyDriftStartY = enemyY;
  enemyDriftTarget = skyY + Math.random() * (groundY - skyY);
  enemyDriftStartMs = now;
}
```

- [ ] **Step 2: Replace `tickActive()` entirely**

Find the existing `function tickActive(...)` and replace it:

```ts
function tickActive(now: number, w: number, h: number, dt: number) {
  if (!scene || !enemyG) return;
  const skyY = h * 0.22;
  const groundY = h * 0.78;

  // Smooth drift animation when missile missed
  if (enemyDriftTarget >= 0) {
    const elapsed = now - enemyDriftStartMs;
    const t = Math.min(1, elapsed / ENEMY_DRIFT_MS);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    enemyY = enemyDriftStartY + (enemyDriftTarget - enemyDriftStartY) * ease;
    if (t >= 1) { enemyY = enemyDriftTarget; enemyDriftTarget = -1; }
  }
  enemyG.y = enemyY;
  enemyG.x = w * ENEMY_X_FRACTION;

  // Player missile flight
  if (playerMissile?.active) {
    const pm = playerMissile;
    pm.x += MISSILE_FLY_SPEED * dt;
    pm.g.x = pm.x;

    const enemyX = enemyG.x;
    // Hit zone: missile x overlaps enemy x band
    if (pm.x >= enemyX - 20 && pm.x <= enemyX + 40) {
      if (Math.abs(pm.y - enemyY) < 36) {
        // Direct hit
        activeHits++;
        enemyG.alpha = 0.3;
        setTimeout(() => { if (enemyG) enemyG.alpha = 0.9; }, 200);
        // Teleport enemy to new random Y instantly (no drift on hit)
        enemyY = skyY + Math.random() * (groundY - skyY);
        enemyDriftTarget = -1;
        enemyG.y = enemyY;
      } else {
        // Missile passed but wrong height — miss
        activeMisses++;
        startEnemyDrift(skyY, groundY, now);
      }
      scene.trailLayer.removeChild(pm.g);
      pm.g.destroy();
      playerMissile = null;
      canFire = true;
    } else if (pm.x > w + 40) {
      // Off-screen — miss
      activeMisses++;
      startEnemyDrift(skyY, groundY, now);
      scene.trailLayer.removeChild(pm.g);
      pm.g.destroy();
      playerMissile = null;
      canFire = true;
    }
  }
}
```

- [ ] **Step 3: Clean up `setupActiveMode()` and `startRun()`**

In `setupActiveMode()`, remove any reference to `lastEnemyMove` (no longer used).

In `startRun()`, replace the active-mode reset block with:
```ts
activeHits = 0;
activeMisses = 0;
aimOffset = 0;
canFire = true;
enemyDriftTarget = -1;
if (enemyG) {
  enemyY = app.screen.height * 0.5;
  enemyG.y = enemyY;
}
if (playerMissile) {
  scene?.trailLayer.removeChild(playerMissile.g);
  playerMissile.g.destroy();
  playerMissile = null;
}
```

- [ ] **Step 4: Verify build — clean**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run build 2>&1 | tail -20
```
Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp && git add web/src/game/games/plane/PlaneGame.ts
git commit -m "feat(plane): adjust active mode — ±40px aim, miss triggers enemy drift"
```

---

### Task 7: Update `gameSpecific` outputs + `emitStats()`

**Files:**
- Modify: `web/src/game/games/plane/PlaneGame.ts`

- [ ] **Step 1: Update the run-end `gameSpecific` block in `tick()`**

Find the block near the end of `tick()` where `gameSpecific` is assembled before calling `cb(result)`:

```ts
const gameSpecific: Record<string, number | boolean> =
  modeId === 'alternating' ? { fuelLost, pickupsCollected, distanceM: Math.round(distanceM) }
  : modeId === 'active'    ? { hits: activeHits, misses: activeMisses }
  :                          { distanceM: Math.round(distanceM), timeAboveMidSec, fuelLost };
```

- [ ] **Step 2: Confirm `emitStats()` uses `rl`**

Verify the `emitStats()` function reads:
```ts
rl: runIndex >= 0 ? Math.round(rl) : 0,
```
(Should already be correct after Task 1 rename. Fix if not.)

- [ ] **Step 3: Final build — must be clean**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run build 2>&1 | tail -20
```
Expected: zero errors, zero unused-variable warnings for the removed state.

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp && git add web/src/game/games/plane/PlaneGame.ts
git commit -m "feat(plane): update gameSpecific outputs per mode"
```

---

### Task 8: Manual browser test + version bump

**Files:**
- Modify: `web/vite.config.ts`

- [ ] **Step 1: Start dev server**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run dev
```

- [ ] **Step 2: Test basic mode**

1. `http://localhost:5173` → Games tab → PlaneFlight → Basic
2. Open subject window
3. Verify: 5 orange barrel icons top-left
4. Drop RL to 0 → plane reaches ground → one barrel dims → plane flickers ~1.5s
5. During flicker: touching ground again must NOT deduct a second barrel
6. Lose all 5 barrels → run ends early

- [ ] **Step 3: Test alternating mode**

1. PlaneFlight → Alternating
2. Red balloons appear from right, scroll left at world speed
3. Fly into red balloon → barrel dims + flicker
4. Reduce to < 3 barrels → green balloons start appearing
5. Catch green balloon → barrel count increases (capped at 5)
6. All 5 barrels lost → run ends early

- [ ] **Step 4: Test active mode**

1. PlaneFlight → Active
2. Enemy (red diamond) appears right side at random height, stationary
3. Press Space → missile fires from plane position + aimOffset
4. Up/Down → aim line shifts (cannot exceed ±40px)
5. Hit enemy → brief red flash → enemy instantly jumps to new random height
6. Miss (missile off-screen) → enemy smoothly drifts to new height over ~0.8s
7. One missile at a time: Space before current missile clears has no effect

- [ ] **Step 5: Bump version**

In `web/vite.config.ts`:
```ts
// Before:
const APP_VERSION = '1.1.0'
// After:
const APP_VERSION = '1.2.0'
```

- [ ] **Step 6: Final commit**

```bash
cd /Users/swryociao/NFB-Webapp && git add web/vite.config.ts
git commit -m "feat: v1.2.0 — plane game modes redesign (basic/alternating/active)"
```
