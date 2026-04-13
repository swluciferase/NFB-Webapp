import { Container, Graphics } from 'pixi.js';
import type { Theme, ThemeVisual } from '../../Game';
import { generateValley, samplePoint, type Valley } from './terrain';

export interface PlaneScene {
  root: Container;
  plane: Graphics;
  trail: Graphics;
  updateBackground(scrollX: number, worldWidth: number, worldHeight: number): void;
  updatePlane(y: number): void;
  updateTrail(particles: ReadonlyArray<{ x: number; y: number; t: number }>, color: string): void;
  destroy(): void;
}

interface ParallaxLayer {
  cfg: ThemeVisual['parallax'][number];
  valley: Valley;
  gfx: Graphics;
}

export function buildPlaneScene(theme: Theme): PlaneScene {
  const visual = theme.visual;
  const root = new Container();

  // Background gradient (top → bottom). Pixi v8 has no built-in gradient
  // for fill so we paint two stacked rects in updateBackground.
  const bgGfx = new Graphics();
  root.addChild(bgGfx);

  // Paper grain overlay — sparse semi-transparent dots, generated once.
  const grainGfx = new Graphics();
  root.addChild(grainGfx);
  let grainSeeded = false;

  // Parallax layers — each has its own valley and Graphics.
  const layers: ParallaxLayer[] = visual.parallax.map((cfg) => {
    const gfx = new Graphics();
    root.addChild(gfx);
    return {
      cfg,
      valley: generateValley({ seed: cfg.seed, lengthPx: 50_000, sampleEveryPx: 20 }),
      gfx,
    };
  });

  // Trail Graphics (particles drawn by PlaneGame each tick).
  const trail = new Graphics();
  root.addChild(trail);

  // Layered cut-out plane (papercut style).
  const plane = buildPapercutPlane(visual.plane);
  root.addChild(plane);

  function paintBackground(w: number, h: number) {
    bgGfx.clear();
    // Approximate gradient with 16 horizontal bands.
    const bands = 16;
    const top = hexToRgb(visual.bgTop);
    const bot = hexToRgb(visual.bgBottom);
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(top.r + (bot.r - top.r) * t);
      const g = Math.round(top.g + (bot.g - top.g) * t);
      const b = Math.round(top.b + (bot.b - top.b) * t);
      const color = (r << 16) | (g << 8) | b;
      bgGfx.rect(0, (h * i) / bands, w, h / bands + 1).fill(color);
    }
  }

  function paintGrain(w: number, h: number) {
    grainGfx.clear();
    const count = Math.max(1, Math.floor((w * h) / 1000 * visual.paperGrainDensity));
    // Deterministic-ish PRNG so grain is stable on resize.
    let s = 0x9e3779b9;
    const rand = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 0.4 + rand() * 0.6;
      grainGfx
        .circle(x, y, r)
        .fill({ color: visual.paperGrainColor, alpha: visual.paperGrainAlpha });
    }
  }

  function paintLayer(layer: ParallaxLayer, scrollX: number, w: number, h: number) {
    const gfx = layer.gfx;
    gfx.clear();
    const baseY = h * layer.cfg.baselineY;
    const amp = h * layer.cfg.amplitude;
    gfx.moveTo(0, h);
    const step = 20;
    for (let x = 0; x <= w; x += step) {
      const wx = scrollX * layer.cfg.scrollFactor + x;
      const sample = samplePoint(layer.valley, wx);
      gfx.lineTo(x, baseY - sample * amp);
    }
    gfx.lineTo(w, h);
    gfx.closePath();
    gfx.fill(layer.cfg.fillColor);
  }

  function updateBackground(scrollX: number, w: number, h: number) {
    paintBackground(w, h);
    if (!grainSeeded) {
      paintGrain(w, h);
      grainSeeded = true;
    }
    for (const layer of layers) paintLayer(layer, scrollX, w, h);
  }

  function updatePlane(y: number) {
    plane.y = y;
  }

  function updateTrail(
    particles: ReadonlyArray<{ x: number; y: number; t: number }>,
    color: string,
  ) {
    trail.clear();
    for (const p of particles) {
      const r = 1 + 4 * p.t;
      trail.circle(p.x, p.y, r).fill({ color, alpha: 0.55 * p.t });
    }
  }

  function destroy() {
    root.removeFromParent();
    root.destroy({ children: true });
  }

  return { root, plane, trail, updateBackground, updatePlane, updateTrail, destroy };
}

function buildPapercutPlane(style: ThemeVisual['plane']): Graphics {
  const root = new Graphics();

  // Drop shadow — same silhouette offset down-right.
  const sx = style.shadowOffsetX;
  const sy = style.shadowOffsetY;
  root
    .roundRect(-22 + sx, -7 + sy, 40, 14, 5)
    .fill({ color: style.shadowColor, alpha: 0.35 });
  root
    .poly([14 + sx, sy, 26 + sx, -10 + sy, 26 + sx, 10 + sy])
    .fill({ color: style.shadowColor, alpha: 0.35 });

  // Body — rounded fuselage.
  root.roundRect(-22, -7, 40, 14, 5).fill(style.bodyColor);

  // Top wing — trapezoid above the body.
  root.poly([-10, -7, 12, -7, 6, -18, -4, -18]).fill(style.wingColor);

  // Bottom wing hint (smaller, darker).
  root
    .poly([-6, 7, 8, 7, 4, 13, -2, 13])
    .fill({ color: style.wingColor, alpha: 0.7 });

  // Tail fin.
  root.poly([14, 0, 26, -10, 26, 10]).fill(style.tailColor);

  // Cockpit window — small rounded rect near the front.
  root.roundRect(0, -4, 10, 5, 1).fill(style.cockpitColor);

  // Propeller stub at the nose.
  root.rect(-23, -1, 2, 2).fill(style.shadowColor);

  return root;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
