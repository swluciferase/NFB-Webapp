// Pattern primitives + ten composed zentangle layouts.
// Each pattern returns an array of polylines in template-space (0..w, 0..h).
// The game scene samples these polylines into coverage points the user's
// brush strokes must "touch".

export interface Point {
  x: number;
  y: number;
}

export type Stroke = Point[];
export type PatternName =
  | 'mandala'
  | 'lattice'
  | 'ribbon'
  | 'sunflower'
  | 'snowflake'
  | 'celtic'
  | 'feather'
  | 'compass'
  | 'honeycomb'
  | 'lotus';

export const PATTERN_NAMES: readonly PatternName[] = [
  'mandala', 'lattice', 'ribbon',
  'sunflower', 'snowflake', 'celtic',
  'feather', 'compass', 'honeycomb', 'lotus',
];

// ── Primitive helpers ──────────────────────────────────────────────────────

function circleStroke(cx: number, cy: number, r: number, steps?: number): Stroke {
  const s = steps ?? Math.max(48, Math.round(r * 0.9));
  const pts: Stroke = [];
  for (let i = 0; i <= s; i++) {
    const a = (i / s) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function ellipseStroke(cx: number, cy: number, rx: number, ry: number, angle = 0, steps = 36): Stroke {
  const pts: Stroke = [];
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const lx = Math.cos(t) * rx;
    const ly = Math.sin(t) * ry;
    pts.push({ x: cx + cos * lx - sin * ly, y: cy + sin * lx + cos * ly });
  }
  return pts;
}

function arcStroke(cx: number, cy: number, r: number, a0: number, a1: number, steps?: number): Stroke {
  const s = steps ?? Math.max(12, Math.round(Math.abs(a1 - a0) * r * 0.5));
  const pts: Stroke = [];
  for (let i = 0; i <= s; i++) {
    const t = i / s;
    const a = a0 + (a1 - a0) * t;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function quadStroke(
  x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, steps = 28,
): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const it = 1 - t;
    pts.push({
      x: it * it * x1 + 2 * it * t * cx + t * t * x2,
      y: it * it * y1 + 2 * it * t * cy + t * t * y2,
    });
  }
  return pts;
}

function spiralStroke(
  cx: number, cy: number, rMin: number, rMax: number, turns: number, steps = 90,
): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = rMin + (rMax - rMin) * t;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

// ── Pattern 1: Mandala ─────────────────────────────────────────────────────
function patternMandala(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  strokes.push(circleStroke(cx, cy, R * 0.96));
  strokes.push(circleStroke(cx, cy, R * 0.22));
  strokes.push(circleStroke(cx, cy, R * 0.18));
  strokes.push(spiralStroke(cx, cy, R * 0.02, R * 0.16, 2.5));

  const P = 7;
  const innerR = R * 0.22;
  const outerR = R * 0.80;
  for (let i = 0; i < P; i++) {
    const a = (i / P) * Math.PI * 2 - Math.PI / 2;
    const spread = (Math.PI / P) * 0.88;
    const a1 = a - spread;
    const a2 = a + spread;
    const pIn  = { x: cx + Math.cos(a) * innerR, y: cy + Math.sin(a) * innerR };
    const pOut = { x: cx + Math.cos(a) * outerR, y: cy + Math.sin(a) * outerR };
    const mx = (pIn.x + pOut.x) / 2;
    const my = (pIn.y + pOut.y) / 2;
    const bulge = R * 0.13;
    strokes.push(quadStroke(pIn.x, pIn.y, mx + Math.cos(a1) * bulge, my + Math.sin(a1) * bulge, pOut.x, pOut.y));
    strokes.push(quadStroke(pIn.x, pIn.y, mx + Math.cos(a2) * bulge, my + Math.sin(a2) * bulge, pOut.x, pOut.y));
    for (let s = 1; s <= 3; s++) {
      const t = s / 4;
      const r = innerR + (outerR - innerR) * t;
      const shrink = 0.12 + t * 0.08;
      strokes.push(arcStroke(cx, cy, r, a1 + shrink, a2 - shrink));
    }
  }

  for (let i = 0; i < P; i++) {
    const a = ((i + 0.5) / P) * Math.PI * 2 - Math.PI / 2;
    const dx = cx + Math.cos(a) * R * 0.89;
    const dy = cy + Math.sin(a) * R * 0.89;
    strokes.push(circleStroke(dx, dy, R * 0.05));
    strokes.push(circleStroke(dx, dy, R * 0.022));
  }
  return strokes;
}

// ── Pattern 2: Lattice (fish-scale) ───────────────────────────────────────
function patternLattice(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  strokes.push(circleStroke(cx, cy, R * 0.96));

  const rows = 7;
  const cols = 7;
  const cellW = (R * 1.7) / cols;
  const startX = cx - R * 0.85 + cellW / 2;
  const startY = cy - R * 0.85 + cellW / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * cellW + (r % 2 ? cellW / 2 : 0);
      const y = startY + r * cellW * 0.72;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > R * 0.84 * (R * 0.84)) continue;
      strokes.push(arcStroke(x, y, cellW * 0.52, Math.PI * 0.08, Math.PI * 0.92));
      strokes.push(arcStroke(x, y, cellW * 0.32, Math.PI * 0.12, Math.PI * 0.88));
      strokes.push(circleStroke(x, y - cellW * 0.52, cellW * 0.07));
    }
  }

  strokes.push(circleStroke(cx, cy, R * 0.18));
  strokes.push(circleStroke(cx, cy, R * 0.14));
  strokes.push(spiralStroke(cx, cy, R * 0.02, R * 0.12, 2));
  return strokes;
}

// ── Pattern 3: Ribbon (crescent waves) ────────────────────────────────────
function patternRibbon(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));

  const waves = 5;
  for (let band = 0; band < 4; band++) {
    const y0 = cy - R * 0.6 + band * R * 0.4;
    for (let i = 0; i < waves; i++) {
      const x0 = cx - R * 0.8 + (i / waves) * R * 1.6;
      const x1 = x0 + (R * 1.6) / waves;
      const mid = (x0 + x1) / 2;
      const up = band % 2 === 0 ? -R * 0.12 : R * 0.12;
      strokes.push(quadStroke(x0, y0, mid, y0 + up, x1, y0));
    }
  }

  for (let band = 0; band < 3; band++) {
    const y0 = cy - R * 0.4 + band * R * 0.4;
    for (let i = 0; i < waves; i++) {
      const x0 = cx - R * 0.8 + (i / waves) * R * 1.6;
      const x1 = x0 + (R * 1.6) / waves;
      strokes.push(arcStroke((x0 + x1) / 2, y0, R * 0.07, Math.PI, Math.PI * 2));
      strokes.push(arcStroke((x0 + x1) / 2, y0, R * 0.035, Math.PI, Math.PI * 2));
    }
  }

  const corners = [
    { x: cx - R * 0.62, y: cy - R * 0.62 },
    { x: cx + R * 0.62, y: cy - R * 0.62 },
    { x: cx - R * 0.62, y: cy + R * 0.62 },
    { x: cx + R * 0.62, y: cy + R * 0.62 },
  ];
  for (const p of corners) {
    strokes.push(spiralStroke(p.x, p.y, R * 0.02, R * 0.13, 2));
    strokes.push(circleStroke(p.x, p.y, R * 0.15));
  }
  return strokes;
}

// ── Pattern 4: Sunflower (向日葵) ─────────────────────────────────────────
function patternSunflower(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  strokes.push(circleStroke(cx, cy, R * 0.36));
  strokes.push(circleStroke(cx, cy, R * 0.30));
  strokes.push(spiralStroke(cx, cy, R * 0.02, R * 0.28, 2.5));

  const P = 8;
  for (let i = 0; i < P; i++) {
    const a = (i / P) * Math.PI * 2;
    const pcx = cx + Math.cos(a) * R * 0.67;
    const pcy = cy + Math.sin(a) * R * 0.67;
    strokes.push(ellipseStroke(pcx, pcy, R * 0.30, R * 0.13, a));
    strokes.push(ellipseStroke(pcx, pcy, R * 0.22, R * 0.09, a));
  }
  // Secondary ring of small petals between main ones
  for (let i = 0; i < P; i++) {
    const a = ((i + 0.5) / P) * Math.PI * 2;
    const pcx = cx + Math.cos(a) * R * 0.50;
    const pcy = cy + Math.sin(a) * R * 0.50;
    strokes.push(ellipseStroke(pcx, pcy, R * 0.14, R * 0.07, a));
  }
  return strokes;
}

// ── Pattern 5: Snowflake (雪花) ────────────────────────────────────────────
function patternSnowflake(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  strokes.push(circleStroke(cx, cy, R * 0.96));
  strokes.push(circleStroke(cx, cy, R * 0.18));
  strokes.push(circleStroke(cx, cy, R * 0.12));

  const arms = 6;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2;
    const ax = Math.cos(a), ay = Math.sin(a);
    // Main arm
    strokes.push([
      { x: cx + ax * R * 0.18, y: cy + ay * R * 0.18 },
      { x: cx + ax * R * 0.90, y: cy + ay * R * 0.90 },
    ]);
    // Secondary branches at 40% and 65% of arm
    for (const t of [0.40, 0.65]) {
      const bx = cx + ax * R * t, by = cy + ay * R * t;
      const bLen = R * (0.22 - t * 0.06);
      const ba1 = a + Math.PI / 3;
      const ba2 = a - Math.PI / 3;
      strokes.push([
        { x: bx + Math.cos(ba1) * bLen, y: by + Math.sin(ba1) * bLen },
        { x: bx, y: by },
        { x: bx + Math.cos(ba2) * bLen, y: by + Math.sin(ba2) * bLen },
      ]);
    }
    // Small hexagons along arm
    strokes.push(circleStroke(cx + ax * R * 0.30, cy + ay * R * 0.30, R * 0.05, 6));
    strokes.push(circleStroke(cx + ax * R * 0.60, cy + ay * R * 0.60, R * 0.04, 6));
  }
  return strokes;
}

// ── Pattern 6: Celtic knot (凱爾特結) ────────────────────────────────────
function patternCeltic(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  strokes.push(circleStroke(cx, cy, R * 0.96));

  // Four overlapping large circles at cardinal points
  const offset = R * 0.50;
  const cr = R * 0.55;
  for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
    strokes.push(circleStroke(cx + dx * offset, cy + dy * offset, cr));
  }
  // Four diagonal medium circles
  const dOff = R * 0.36;
  const dR = R * 0.30;
  for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    strokes.push(circleStroke(cx + dx * dOff, cy + dy * dOff, dR));
  }
  // Center
  strokes.push(circleStroke(cx, cy, R * 0.22));
  strokes.push(circleStroke(cx, cy, R * 0.16));
  strokes.push(spiralStroke(cx, cy, R * 0.02, R * 0.14, 2.0));
  return strokes;
}

// ── Pattern 7: Feather (羽毛紋) ────────────────────────────────────────────
function patternFeather(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  // Vertical spine
  strokes.push([{ x: cx, y: cy - R * 0.85 }, { x: cx, y: cy + R * 0.85 }]);

  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const sy = cy - R * 0.75 + t * R * 1.5;
    const len = R * (0.55 - Math.abs(t - 0.5) * 0.25);
    const droop = len * 0.28;
    // Outer branches
    strokes.push(quadStroke(cx, sy, cx - len * 0.55, sy + droop * 0.4, cx - len, sy + droop));
    strokes.push(quadStroke(cx, sy, cx + len * 0.55, sy + droop * 0.4, cx + len, sy + droop));
    // Inner shorter branches
    strokes.push(quadStroke(cx, sy, cx - len * 0.30, sy + droop * 0.25, cx - len * 0.55, sy + droop * 0.55));
    strokes.push(quadStroke(cx, sy, cx + len * 0.30, sy + droop * 0.25, cx + len * 0.55, sy + droop * 0.55));
  }
  strokes.push(circleStroke(cx, cy - R * 0.88, R * 0.05));
  return strokes;
}

// ── Pattern 8: Compass Rose (羅盤) ─────────────────────────────────────────
function patternCompass(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  strokes.push(circleStroke(cx, cy, R * 0.96));
  strokes.push(circleStroke(cx, cy, R * 0.58));
  strokes.push(circleStroke(cx, cy, R * 0.20));
  strokes.push(circleStroke(cx, cy, R * 0.14));

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const isCard = i % 2 === 0;
    const outer  = isCard ? R * 0.92 : R * 0.56;
    const inner  = R * 0.20;
    const half   = Math.PI / 20;
    const tip = { x: cx + Math.cos(a) * outer, y: cy + Math.sin(a) * outer };
    const lft = { x: cx + Math.cos(a - half) * inner, y: cy + Math.sin(a - half) * inner };
    const rgt = { x: cx + Math.cos(a + half) * inner, y: cy + Math.sin(a + half) * inner };
    strokes.push([lft, tip, rgt]);
    // Radial spoke
    strokes.push([
      { x: cx + Math.cos(a) * inner, y: cy + Math.sin(a) * inner },
      { x: cx + Math.cos(a) * (isCard ? outer * 0.97 : outer), y: cy + Math.sin(a) * (isCard ? outer * 0.97 : outer) },
    ]);
  }
  // Arcs in cardinal quadrants
  for (let i = 0; i < 4; i++) {
    const a0 = (i * 2 / 8) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i * 2 + 1) / 8) * Math.PI * 2 - Math.PI / 2;
    strokes.push(arcStroke(cx, cy, R * 0.58, a0 + 0.05, a1 - 0.05));
    strokes.push(arcStroke(cx, cy, R * 0.38, a0 + 0.12, a1 - 0.12));
  }
  return strokes;
}

// ── Pattern 9: Honeycomb (蜂巢) ────────────────────────────────────────────
function patternHoneycomb(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  strokes.push(circleStroke(cx, cy, R * 0.96));

  const hexSize = R * 0.155;
  const hexW = hexSize * Math.sqrt(3);
  const hexH = hexSize * 1.5;

  for (let r = -5; r <= 5; r++) {
    for (let c = -5; c <= 5; c++) {
      const hx = cx + c * hexW + (r % 2 !== 0 ? hexW / 2 : 0);
      const hy = cy + r * hexH;
      if ((hx - cx) * (hx - cx) + (hy - cy) * (hy - cy) > (R * 0.86) * (R * 0.86)) continue;
      const pts: Stroke = [];
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 6;
        pts.push({ x: hx + Math.cos(a) * hexSize, y: hy + Math.sin(a) * hexSize });
      }
      strokes.push(pts);
    }
  }
  // Center decoration
  strokes.push(circleStroke(cx, cy, hexSize * 0.8));
  strokes.push(circleStroke(cx, cy, hexSize * 0.4));
  return strokes;
}

// ── Pattern 10: Lotus (蓮花) ───────────────────────────────────────────────
function patternLotus(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = [];
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;

  strokes.push(circleStroke(cx, cy, R));
  strokes.push(circleStroke(cx, cy, R * 0.26));
  strokes.push(circleStroke(cx, cy, R * 0.20));
  strokes.push(spiralStroke(cx, cy, R * 0.02, R * 0.18, 2.0));

  const P = 8;
  // Outer large petals
  for (let i = 0; i < P; i++) {
    const a    = (i / P) * Math.PI * 2;
    const baseR = R * 0.24;
    const petalLen = R * 0.72;
    const bx   = cx + Math.cos(a) * baseR, by = cy + Math.sin(a) * baseR;
    const tx   = cx + Math.cos(a) * petalLen, ty = cy + Math.sin(a) * petalLen;
    const midR = R * 0.52;
    const mx   = cx + Math.cos(a) * midR, my = cy + Math.sin(a) * midR;
    const spread = R * 0.15;
    const la   = a + Math.PI / 2;
    strokes.push(quadStroke(bx, by, mx + Math.cos(la) * spread, my + Math.sin(la) * spread, tx, ty));
    strokes.push(quadStroke(bx, by, mx - Math.cos(la) * spread, my - Math.sin(la) * spread, tx, ty));
    strokes.push([
      { x: cx + Math.cos(a) * R * 0.26, y: cy + Math.sin(a) * R * 0.26 },
      { x: cx + Math.cos(a) * R * 0.55, y: cy + Math.sin(a) * R * 0.55 },
    ]);
  }
  // Inner smaller petals (between outer ones)
  for (let i = 0; i < P; i++) {
    const a    = ((i + 0.5) / P) * Math.PI * 2;
    const baseR = R * 0.22;
    const petalLen = R * 0.50;
    const bx   = cx + Math.cos(a) * baseR, by = cy + Math.sin(a) * baseR;
    const tx   = cx + Math.cos(a) * petalLen, ty = cy + Math.sin(a) * petalLen;
    const midR = R * 0.38;
    const mx   = cx + Math.cos(a) * midR, my = cy + Math.sin(a) * midR;
    const spread = R * 0.10;
    const la   = a + Math.PI / 2;
    strokes.push(quadStroke(bx, by, mx + Math.cos(la) * spread, my + Math.sin(la) * spread, tx, ty));
    strokes.push(quadStroke(bx, by, mx - Math.cos(la) * spread, my - Math.sin(la) * spread, tx, ty));
  }
  return strokes;
}

// ── Dispatch ───────────────────────────────────────────────────────────────

export function generatePattern(w: number, h: number, name: PatternName): Stroke[] {
  switch (name) {
    case 'lattice':   return patternLattice(w, h);
    case 'ribbon':    return patternRibbon(w, h);
    case 'sunflower': return patternSunflower(w, h);
    case 'snowflake': return patternSnowflake(w, h);
    case 'celtic':    return patternCeltic(w, h);
    case 'feather':   return patternFeather(w, h);
    case 'compass':   return patternCompass(w, h);
    case 'honeycomb': return patternHoneycomb(w, h);
    case 'lotus':     return patternLotus(w, h);
    default:          return patternMandala(w, h);
  }
}

export interface Sample {
  x: number;
  y: number;
  covered: boolean;
}

export function buildSamples(strokes: Stroke[], spacing: number): Sample[] {
  const samples: Sample[] = [];
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    let acc = 0;
    let prev = stroke[0];
    samples.push({ x: prev.x, y: prev.y, covered: false });
    for (let i = 1; i < stroke.length; i++) {
      const p = stroke[i];
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      acc += d;
      if (acc >= spacing) {
        samples.push({ x: p.x, y: p.y, covered: false });
        acc = 0;
      }
      prev = p;
    }
  }
  return samples;
}
