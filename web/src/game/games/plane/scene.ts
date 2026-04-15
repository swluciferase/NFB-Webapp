import { BlurFilter, Container, Graphics } from 'pixi.js';
import type { Theme, ThemeVisual } from '../../Game';

export interface SceneTickParams {
  scrollX: number;
  speed: number;
  dt: number;
  now: number;
  worldW: number;
  worldH: number;
}

export interface PlaneScene {
  root: Container;
  plane: Container;
  propHub: Container;
  trailLayer: Container;
  layout(w: number, h: number): void;
  tick(params: SceneTickParams): void;
  destroy(): void;
}

interface CloudSprite {
  g: Graphics;
  depth: number;
}

interface BirdSprite {
  c: Container;
  g: Graphics;
  speed: number;
  phase: number;
}

interface SparkleSprite {
  g: Graphics;
  vx: number;
  vy: number;
  phase: number;
}

export function buildPlaneScene(theme: Theme): PlaneScene {
  const visual = theme.visual;
  const root = new Container();

  // Layers (back → front)
  const layers = {
    sky: new Container(),
    sun: new Container(),
    cloudFar: new Container(),
    mtnFar: new Container(),
    mtnMid: new Container(),
    cloudMid: new Container(),
    mtnNear: new Container(),
    haze: new Container(),
    grass: new Container(),
    birds: new Container(),
    cloudNear: new Container(),
    trail: new Container(),
    plane: new Container(),
    sparkle: new Container(),
    vignette: new Container(),
  };
  for (const k of Object.keys(layers) as Array<keyof typeof layers>) {
    root.addChild(layers[k]);
  }
  // Far-cloud blur is applied per-sprite (see spawnClouds) rather than on the
  // container, so each filter's texture is sized to the sprite's local bounds
  // and doesn't get re-allocated every frame as the cloud scrolls.

  // Static / slow-updating graphics
  const skyG = new Graphics();
  layers.sky.addChild(skyG);

  const sunG = new Graphics();
  const sunGlowG = new Graphics();
  const sunRaysG = new Graphics();
  sunGlowG.filters = [new BlurFilter({ strength: 30, quality: 4 })];
  layers.sun.addChild(sunGlowG, sunRaysG, sunG);

  const hazeG = new Graphics();
  layers.haze.addChild(hazeG);

  const vignetteG = new Graphics();
  layers.vignette.addChild(vignetteG);

  // Parallax content rebuilt on layout()
  let mtnFarG: Graphics | null = null;
  let mtnMidG: Graphics | null = null;
  let mtnNearG: Graphics | null = null;
  let grassG: Graphics | null = null;
  // Widths used for infinite-scroll modulo wrapping.
  let mtnFarW = 0;
  let mtnMidW = 0;
  let mtnNearW = 0;
  let grassW = 0;

  const clouds: { far: CloudSprite[]; mid: CloudSprite[]; near: CloudSprite[] } = {
    far: [],
    mid: [],
    near: [],
  };
  const birds: BirdSprite[] = [];
  const sparkles: SparkleSprite[] = [];

  // ---- PLANE (built once, reused) ----
  const plane = new Container();
  const propHub = buildPlane(plane);
  layers.plane.addChild(plane);

  let sunCenterX = 0;
  let sunCenterY = 0;
  let sunRadius = 0;

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

  function paintSunCoreAndGlow(w: number, h: number) {
    sunCenterX = w * 0.72;
    sunCenterY = h * 0.28;
    sunRadius = Math.min(w, h) * 0.075;
    sunG.clear();
    sunG.circle(sunCenterX, sunCenterY, sunRadius).fill({ color: visual.sun });
    sunG.circle(sunCenterX, sunCenterY, sunRadius * 0.7)
      .fill({ color: 0xffffff, alpha: 0.5 });

    sunGlowG.clear();
    for (let i = 0; i < 4; i++) {
      sunGlowG.circle(sunCenterX, sunCenterY, sunRadius * (1.4 + i * 0.6))
        .fill({ color: visual.sunGlow, alpha: 0.15 - i * 0.03 });
    }
  }

  // Build sun rays once (or on layout) as geometry centered at origin,
  // then rotate the sprite in tick() — avoids per-frame clear()+redraw
  // while sunGlowG's heavy BlurFilter is present in the same container.
  function buildSunRays() {
    if (sunRadius <= 0) return;
    sunRaysG.clear();
    sunRaysG.position.set(sunCenterX, sunCenterY);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const x1 = Math.cos(a) * sunRadius * 1.2;
      const y1 = Math.sin(a) * sunRadius * 1.2;
      const x2 = Math.cos(a) * sunRadius * 2.4;
      const y2 = Math.sin(a) * sunRadius * 2.4;
      sunRaysG.moveTo(x1, y1).lineTo(x2, y2)
        .stroke({ width: 3, color: visual.sun, alpha: 0.35 });
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

  // Bezier silhouette for a mountain range. Drawn wide enough to
  // tile: width = w * 2 so a single modulo wrap is enough.
  function buildMountain(
    w: number,
    h: number,
    baseY: number,
    amplitude: number,
    color: string,
    seed: number,
  ): { g: Graphics; tileW: number } {
    const tileW = Math.round(w * 2);
    const g = new Graphics();
    const rand = mulberry32(seed);
    const points: Array<{ x: number; y: number }> = [];
    const steps = Math.max(24, Math.round(tileW / 80));
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * tileW;
      const noise = rand() * amplitude + amplitude * 0.3;
      const y = baseY - noise;
      points.push({ x, y });
    }
    g.moveTo(-50, h + 10);
    g.lineTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      g.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    g.lineTo(points[points.length - 1].x, h + 10);
    g.lineTo(-50, h + 10);
    g.fill({ color });

    // Soft snow/haze highlights on the crests.
    for (let i = 1; i < points.length - 1; i += 2) {
      const p = points[i];
      g.circle(p.x, p.y + 4, 8 + rand() * 6)
        .fill({ color: 0xffffff, alpha: 0.18 });
    }
    return { g, tileW };
  }

  function buildGrass(w: number, h: number) {
    const tileW = Math.round(w * 2);
    const g = new Graphics();
    g.rect(-50, h * 0.88, tileW + 100, h * 0.2)
      .fill({ color: visual.grass });
    const rand = mulberry32(91);
    const tufts = Math.max(120, Math.round(tileW / 10));
    for (let i = 0; i < tufts; i++) {
      const x = rand() * tileW;
      const y = h * 0.88 + rand() * (h * 0.08);
      const hgt = 6 + rand() * 14;
      g.moveTo(x, y)
        .lineTo(x - 2, y - hgt)
        .lineTo(x + 2, y - hgt)
        .lineTo(x + 4, y)
        .fill({ color: visual.grassTip, alpha: 0.7 });
    }
    return { g, tileW };
  }

  function buildCloud(seed: number, scale: number): Graphics {
    const rand = mulberry32(seed);
    const g = new Graphics();
    const blobs = 6 + Math.floor(rand() * 5);
    const parts: Array<{ dx: number; dy: number; r: number }> = [];
    for (let i = 0; i < blobs; i++) {
      const dx = (rand() - 0.5) * 90 * scale;
      const dy = (rand() - 0.3) * 26 * scale;
      const r = (22 + rand() * 28) * scale;
      parts.push({ dx, dy, r });
    }
    for (const p of parts) {
      g.circle(p.dx, p.dy + p.r * 0.15, p.r)
        .fill({ color: visual.cloudShade, alpha: 0.9 });
    }
    for (const p of parts) {
      g.circle(p.dx, p.dy, p.r).fill({ color: visual.cloudBright });
    }
    for (const p of parts) {
      g.circle(p.dx - p.r * 0.2, p.dy - p.r * 0.3, p.r * 0.55)
        .fill({ color: 0xffffff, alpha: 0.4 });
    }
    return g;
  }

  function spawnClouds(w: number, h: number) {
    for (const key of ['far', 'mid', 'near'] as const) {
      for (const c of clouds[key]) c.g.destroy();
      clouds[key] = [];
    }
    const bands = [
      { layer: layers.cloudFar,  group: 'far'  as const, count: 6, yMin: 0.08, yMax: 0.35, scale: 0.65, depth: 0.15, alpha: 0.7, blur: true },
      { layer: layers.cloudMid,  group: 'mid'  as const, count: 5, yMin: 0.12, yMax: 0.42, scale: 1.0,  depth: 0.35, alpha: 0.85, blur: false },
      { layer: layers.cloudNear, group: 'near' as const, count: 3, yMin: 0.05, yMax: 0.30, scale: 1.55, depth: 0.7,  alpha: 1.0,  blur: false },
    ];
    let seed = 1;
    for (const b of bands) {
      for (let i = 0; i < b.count; i++) {
        const g = buildCloud(seed++, b.scale);
        g.x = (i / b.count) * w * 1.4 + Math.random() * 120;
        g.y = h * (b.yMin + Math.random() * (b.yMax - b.yMin));
        g.alpha = b.alpha;
        // One BlurFilter per sprite: local bounds never change as the cloud
        // scrolls, so PIXI doesn't reallocate the filter texture each frame.
        if (b.blur) g.filters = [new BlurFilter({ strength: 3, quality: 2 })];
        b.layer.addChild(g);
        clouds[b.group].push({ g, depth: b.depth });
      }
    }
  }

  function spawnBirds(w: number, h: number) {
    for (const b of birds) b.c.destroy();
    birds.length = 0;
    for (let i = 0; i < 8; i++) {
      const g = new Graphics();
      const c = new Container();
      c.addChild(g);
      c.x = Math.random() * w;
      c.y = h * (0.18 + Math.random() * 0.25);
      layers.birds.addChild(c);
      birds.push({ c, g, speed: 0.4 + Math.random() * 0.6, phase: Math.random() * Math.PI * 2 });
    }
  }

  function drawBird(b: BirdSprite) {
    const flap = Math.sin(b.phase) * 6;
    b.g.clear();
    b.g.moveTo(-6, 0)
      .quadraticCurveTo(-3, -flap, 0, 0)
      .quadraticCurveTo(3, -flap, 6, 0)
      .stroke({ width: 1.5, color: 0x1a1a2a });
  }

  function spawnSparkles(w: number, h: number) {
    for (const s of sparkles) s.g.destroy();
    sparkles.length = 0;
    for (let i = 0; i < 40; i++) {
      const g = new Graphics();
      g.circle(0, 0, 1.5).fill({ color: 0xffffff });
      g.x = Math.random() * w;
      g.y = Math.random() * h;
      g.alpha = 0;
      layers.sparkle.addChild(g);
      sparkles.push({
        g,
        vx: -0.3 - Math.random() * 0.5,
        vy: (Math.random() - 0.5) * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ---------- LAYOUT ----------

  function layout(w: number, h: number) {
    paintSky(w, h);
    paintSunCoreAndGlow(w, h);
    buildSunRays();
    paintHaze(w, h);
    paintVignette(w, h);

    if (mtnFarG) { mtnFarG.destroy(); mtnFarG = null; }
    if (mtnMidG) { mtnMidG.destroy(); mtnMidG = null; }
    if (mtnNearG) { mtnNearG.destroy(); mtnNearG = null; }
    if (grassG)  { grassG.destroy();  grassG  = null; }

    const far = buildMountain(w, h, h * 0.60, h * 0.14, visual.mtnFar, 11);
    const mid = buildMountain(w, h, h * 0.70, h * 0.18, visual.mtnMid, 23);
    const near = buildMountain(w, h, h * 0.82, h * 0.22, visual.mtnNear, 47);
    const gr  = buildGrass(w, h);
    mtnFarG = far.g;   mtnFarW = far.tileW;
    mtnMidG = mid.g;   mtnMidW = mid.tileW;
    mtnNearG = near.g; mtnNearW = near.tileW;
    grassG = gr.g;     grassW = gr.tileW;
    layers.mtnFar.addChild(mtnFarG);
    layers.mtnMid.addChild(mtnMidG);
    layers.mtnNear.addChild(mtnNearG);
    layers.grass.addChild(grassG);

    spawnClouds(w, h);
    spawnBirds(w, h);
    spawnSparkles(w, h);
  }

  // ---------- TICK ----------

  function tick(p: SceneTickParams) {
    const { scrollX, speed, dt, now, worldW, worldH } = p;

    // Sun rays slow rotation — just update the transform, no GPU buffer rebuild.
    sunRaysG.rotation = now * 0.0002;

    // Parallax scroll — wrap with modulo so pattern repeats seamlessly.
    layers.mtnFar.x  = -((scrollX * 0.08) % mtnFarW);
    layers.mtnMid.x  = -((scrollX * 0.18) % mtnMidW);
    layers.mtnNear.x = -((scrollX * 0.32) % mtnNearW);
    layers.grass.x   = -((scrollX * 0.85) % grassW);

    // Clouds drift independently at each depth.
    const driftScale = 0.4 + speed * 0.1;
    for (const c of clouds.far)  { c.g.x -= (0.15 + c.depth * driftScale) * dt; if (c.g.x < -200) c.g.x = worldW + 100 + Math.random() * 200; }
    for (const c of clouds.mid)  { c.g.x -= (0.30 + c.depth * driftScale) * dt; if (c.g.x < -200) c.g.x = worldW + 100 + Math.random() * 200; }
    for (const c of clouds.near) { c.g.x -= (0.60 + c.depth * driftScale) * dt; if (c.g.x < -200) c.g.x = worldW + 100 + Math.random() * 200; }

    // Birds
    for (const b of birds) {
      b.c.x -= (0.5 + b.speed) * dt;
      b.c.y += Math.sin(now * 0.002 + b.phase) * 0.2;
      b.phase += 0.25 * dt;
      drawBird(b);
      if (b.c.x < -30) {
        b.c.x = worldW + 20;
        b.c.y = worldH * (0.18 + Math.random() * 0.25);
      }
    }

    // Sparkles
    for (const s of sparkles) {
      s.g.x += s.vx * dt;
      s.g.y += s.vy * dt;
      s.phase += 0.08 * dt;
      s.g.alpha = (Math.sin(s.phase) * 0.5 + 0.5) * 0.8 * visual.ambient;
      if (s.g.x < -5) {
        s.g.x = worldW + 5;
        s.g.y = Math.random() * worldH;
      }
    }
  }

  function destroy() {
    root.removeFromParent();
    root.destroy({ children: true });
  }

  return {
    root,
    plane,
    propHub,
    trailLayer: layers.trail,
    layout,
    tick,
    destroy,
  };
}

// ---------- PLANE BUILDER ----------

function buildPlane(root: Container): Container {
  // Shadow
  const shadow = new Graphics();
  shadow.ellipse(4, 3, 48, 14).fill({ color: 0x000000, alpha: 0.25 });
  shadow.filters = [new BlurFilter({ strength: 4, quality: 2 })];
  root.addChild(shadow);

  // Rear tail fin
  const tailFin = new Graphics();
  tailFin.moveTo(-38, -4).lineTo(-50, -22).lineTo(-32, -6).closePath()
    .fill({ color: 0xe63946 });
  tailFin.moveTo(-38, -4).lineTo(-50, -22).lineTo(-42, -18).closePath()
    .fill({ color: 0xffffff, alpha: 0.25 });
  root.addChild(tailFin);

  // Rear horizontal tail
  const tailH = new Graphics();
  tailH.moveTo(-42, 0).lineTo(-58, -6).lineTo(-58, 6).closePath()
    .fill({ color: 0xc81d30 });
  root.addChild(tailH);

  // Lower wing
  const wingBack = new Graphics();
  wingBack.moveTo(-4, 4).lineTo(-20, 22).lineTo(20, 22).lineTo(14, 4).closePath()
    .fill({ color: 0xc81d30 });
  root.addChild(wingBack);

  // Body
  const body = new Graphics();
  body.ellipse(0, 0, 44, 13).fill({ color: 0xe63946 });
  body.ellipse(0, -2, 44, 10).fill({ color: 0xf28a93, alpha: 0.5 });
  body.ellipse(-8, 4, 30, 5).fill({ color: 0x9c1524, alpha: 0.5 });
  root.addChild(body);

  // Top wing
  const wingTop = new Graphics();
  wingTop.roundRect(-26, -22, 58, 9, 4).fill({ color: 0xf1faee });
  wingTop.roundRect(-26, -22, 58, 3, 2).fill({ color: 0xffffff });
  wingTop.roundRect(-26, -16, 58, 3, 2).fill({ color: 0xc4d0c8, alpha: 0.6 });
  root.addChild(wingTop);

  // Wing struts
  const struts = new Graphics();
  struts.moveTo(-14, -13).lineTo(-12, 2).stroke({ width: 2, color: 0x6a4a1a });
  struts.moveTo(14, -13).lineTo(12, 2).stroke({ width: 2, color: 0x6a4a1a });
  root.addChild(struts);

  // Cockpit
  const cockpit = new Graphics();
  cockpit.roundRect(-6, -11, 18, 8, 4).fill({ color: 0x4a8bff });
  cockpit.roundRect(-4, -10, 14, 3, 2).fill({ color: 0xcfe4ff });
  root.addChild(cockpit);

  // Nose cone
  const nose = new Graphics();
  nose.ellipse(42, 0, 8, 10).fill({ color: 0x9c1524 });
  nose.circle(44, -1, 4).fill({ color: 0xe63946 });
  root.addChild(nose);

  // Propeller (rotating hub)
  const propHub = new Container();
  propHub.x = 48;
  const propG = new Graphics();
  propG.roundRect(-2, -24, 4, 48, 2).fill({ color: 0x2a2a38, alpha: 0.85 });
  propG.circle(0, 0, 3).fill({ color: 0x44444a });
  propHub.addChild(propG);
  root.addChild(propHub);

  return propHub;
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

// Keep the named-export for consumers that want to look up the visual type.
export type { ThemeVisual };
