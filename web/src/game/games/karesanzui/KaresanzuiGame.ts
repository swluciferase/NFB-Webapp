/**
 * KaresanzuiGame — 枯山水禪意庭園
 *
 * Phase 1 (pattern drawing):
 *   A zen pattern is drawn at constant speed. While drawing, the live tip
 *   jiggles according to OO (low OO → shaky tip; high OO → steady tip).
 *   Already-drawn segments keep the exact jitter they had at the moment
 *   they were laid down ("baked jitter").
 *
 *   Four patterns: spiral (螺旋), waves (橫紋), ripples (同心圓), cross (斜紋).
 *
 * Phase 2 (bloom, after pattern completes):
 *   When oo > threshold the foreground trees slowly blossom (treeBloom 0→1).
 *   When oo drops below threshold, petals fall. bloomPct is emitted as the
 *   primary NFB metric.
 *
 * Run end: event-driven — fires when treeBloom reaches 1.0 (full bloom).
 */

import {
  Application,
  BlurFilter,
  Container,
  FillGradient,
  Graphics,
  type Ticker,
} from 'pixi.js';
import type { GameInstance, GameStatsListener, RunResult, Theme } from '../../Game';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PatternId = 'spiral' | 'waves' | 'ripples' | 'cross';

export interface KaresanzuiGameArgs {
  app: Application;
  stage: Container;
  theme: Theme;
  /** Season id: 'spring' | 'summer' | 'autumn' | 'winter' */
  season: string;
  /** Rake pattern id: 'spiral' | 'waves' | 'ripples' | 'cross' */
  patternId?: string;
  onStats?: GameStatsListener;
}

type Season = 'spring' | 'summer' | 'autumn' | 'winter';

interface SeasonCfg {
  bare: number; leaf: number; leaf2: number; flower: number; label: string;
}
const SEASON_CONFIG: Record<Season, SeasonCfg> = {
  spring: { bare: 0x5a6a30, leaf: 0xffb7c5, leaf2: 0xff8fab, flower: 0xfff0f5, label: '春・桜' },
  summer: { bare: 0x3a5220, leaf: 0x3a7a28, leaf2: 0x4c9432, flower: 0xc8f5a0, label: '夏・緑' },
  autumn: { bare: 0x6a3c10, leaf: 0xc84b14, leaf2: 0xe07820, flower: 0xffe090, label: '秋・楓' },
  winter: { bare: 0x506050, leaf: 0xd8e8d0, leaf2: 0xf0f8ee, flower: 0xfff0f4, label: '冬・梅' },
};
const SEASON_TINTS: Record<Season, number[]> = {
  spring: [0xffb7c5, 0xff8fab, 0xffd6e0, 0xffe0eb],
  summer: [0x4caf50, 0x81c784, 0xa5d6a7, 0x2e7d32],
  autumn: [0xc84b14, 0xe07820, 0xd4400a, 0xffe090, 0xa83010],
  winter: [0xf5f5f5, 0xfff0f4, 0xe8d8e0, 0xffd0d8],
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PATTERN_SAMPLES  = 140;
const MAX_JITTER       = 6.5;    // px at OO=0
const IDX_PER_FRAME    = 0.047;  // ~50 s to complete at 60 fps

// Branch definitions for the foreground canopy
interface BranchDef {
  side: 'L' | 'R';
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  arc: number; segs: number;
}
const BRANCH_DEFS: BranchDef[] = [
  { side:'L', x0:-3.6, y0:1.94, z0:2.3, x1: 0.9, y1:1.70, z1:2.9, arc:0.16, segs:16 },
  { side:'L', x0:-3.1, y0:1.84, z0:2.6, x1: 0.3, y1:1.67, z1:3.2, arc:0.11, segs:14 },
  { side:'L', x0:-2.6, y0:1.76, z0:3.0, x1:-0.2, y1:1.65, z1:3.7, arc:0.07, segs:12 },
  { side:'R', x0: 3.6, y0:1.94, z0:2.3, x1:-0.9, y1:1.70, z1:2.9, arc:0.16, segs:16 },
  { side:'R', x0: 3.1, y0:1.84, z0:2.6, x1:-0.3, y1:1.67, z1:3.2, arc:0.11, segs:14 },
  { side:'R', x0: 2.6, y0:1.76, z0:3.0, x1: 0.2, y1:1.65, z1:3.7, arc:0.07, segs:12 },
];
const LEAF_ANCHORS = [
  { wx: -1.10, wy: 1.84, wz: 2.50 },
  { wx: -0.45, wy: 1.75, wz: 2.80 },
  { wx:  0.00, wy: 1.72, wz: 3.00 },
  { wx:  0.45, wy: 1.75, wz: 2.80 },
  { wx:  1.10, wy: 1.84, wz: 2.50 },
];

// ---------------------------------------------------------------------------
// Small deterministic PRNG (LCG)
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) & 0xffffff) / 0xffffff;
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createKaresanzuiGame(args: KaresanzuiGameArgs): GameInstance {
  const { app, stage, season: rawSeason, patternId: rawPatternId = 'spiral', onStats } = args;
  const season: Season = (['spring','summer','autumn','winter'].includes(rawSeason)
    ? rawSeason : 'spring') as Season;
  const patternId: PatternId = (['spiral','waves','ripples','cross'].includes(rawPatternId)
    ? rawPatternId : 'spiral') as PatternId;

  // ── Root container ───────────────────────────────────────────────────────
  const root = new Container();
  stage.addChild(root);

  // ── Layer stack (back → front) ───────────────────────────────────────────
  const layers = {
    sky:        new Container(),
    treeFar:    new Container(),
    wall:       new Container(),
    sandBed:    new Container(),
    sandGrain:  new Container(),
    rakeLines:  new Container(),
    rockShadow: new Container(),
    rocks:      new Container(),
    treeL:      new Container(),
    treeR:      new Container(),
    leaves:     new Container(),
  };
  for (const c of Object.values(layers)) root.addChild(c);
  // No BlurFilter on treeFar: container-level filters allocate a texture
  // the size of the full container bounds. On retina displays this becomes
  // a full-screen-width texture that can exhaust GPU memory and kill the
  // renderer process (Chrome Error code 5). The trees are small due to
  // perspective distance — no GPU blur needed.

  // Pre-allocated Graphics objects
  const skyGfx        = new Graphics(); layers.sky.addChild(skyGfx);
  const wallGfx       = new Graphics(); layers.wall.addChild(wallGfx);
  const sandGfx       = new Graphics(); layers.sandBed.addChild(sandGfx);
  const sandGrainGfx  = new Graphics(); layers.sandGrain.addChild(sandGrainGfx);
  const rakeGfx       = new Graphics(); layers.rakeLines.addChild(rakeGfx);
  const rockShadowGfx = new Graphics(); layers.rockShadow.addChild(rockShadowGfx);
  const rockGfx       = new Graphics(); layers.rocks.addChild(rockGfx);

  // ── Camera / projection state ────────────────────────────────────────────
  const camY = 1.65;
  let viewW = 0, viewH = 0, horizonY = 0, focalPx = 0;

  function recomputeCamera() {
    viewW    = app.screen.width;
    viewH    = app.screen.height;
    focalPx  = viewW * 0.78;
    horizonY = viewH * 0.20;
  }

  function project(wx: number, wy: number, wz: number) {
    const z  = Math.max(wz, 0.05);
    const sx = viewW * 0.5 + (wx * focalPx) / z;
    const sy = horizonY + ((camY - wy) * focalPx) / z;
    return { x: sx, y: sy, scale: focalPx / z };
  }

  // ── Pattern generators ────────────────────────────────────────────────────

  function buildSpiral(): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [];
    const turns = 2.6, rOuter = 2.30, rInner = 0.45;
    for (let s = 0; s <= PATTERN_SAMPLES; s++) {
      const t   = s / PATTERN_SAMPLES;
      const ang = -Math.PI * 0.5 + t * Math.PI * 2 * turns;
      const r   = rOuter + (rInner - rOuter) * Math.pow(t, 0.85);
      const wob = Math.sin(ang * 5.0 + 0.6) * 0.020;
      pts.push(project(
        Math.cos(ang) * (r + wob),
        0,
        5.0 + Math.sin(ang) * (r + wob),
      ));
    }
    return pts;
  }

  // 橫紋 — 7 serpentine sweeps across the sand, near to far
  function buildWaves(): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [];
    const N  = 7;
    const ppp = Math.floor(PATTERN_SAMPLES / N);
    for (let p = 0; p < N; p++) {
      const frac  = p / (N - 1);
      const wz    = 2.5 + frac * 4.5;           // near (2.5) → far (7.0)
      const count = p < N - 1 ? ppp : PATTERN_SAMPLES + 1 - p * ppp;
      for (let i = 0; i < Math.max(1, count); i++) {
        const t   = i / Math.max(1, count - 1);
        const tt  = p % 2 === 0 ? t : 1 - t;   // serpentine
        const wx  = -4.5 + tt * 9.0;
        const wzo = wz + Math.sin(tt * Math.PI * 2) * 0.30;
        pts.push(project(wx, 0, Math.max(1.90, wzo)));
      }
    }
    return pts;
  }

  // 同心圓 — 5 concentric ovals expanding from center stone
  function buildRipples(): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [];
    const N   = 5;
    const ppp = Math.floor(PATTERN_SAMPLES / N);
    const cx = 0.05, cz = 5.05;
    for (let ring = 0; ring < N; ring++) {
      const r     = 0.50 + ring * 0.45;
      const count = ring < N - 1 ? ppp : PATTERN_SAMPLES + 1 - ring * ppp;
      const dir   = ring % 2 === 0 ? 1 : -1;
      const start = ring % 2 === 0 ? -Math.PI * 0.5 : Math.PI * 1.5;
      for (let i = 0; i < Math.max(1, count); i++) {
        const t   = i / count;
        const ang = start + dir * t * Math.PI * 2;
        const wx  = cx + Math.cos(ang) * r * 1.55;  // wider in x due to perspective
        const wz  = cz + Math.sin(ang) * r;
        pts.push(project(wx, 0, Math.max(1.90, wz)));
      }
    }
    return pts;
  }

  // 斜紋 — two sets of diagonal parallel lines crossing each other
  function buildCross(): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [];
    const N    = 7;
    const HALF = Math.ceil(PATTERN_SAMPLES / 2);
    const ppp  = Math.max(1, Math.floor(HALF / N));

    // First set: NW→SE (wz increases as wx increases)
    for (let li = 0; li < N; li++) {
      const baseZ = 2.2 + li * 0.75;
      const count = li < N - 1 ? ppp : HALF - li * ppp;
      for (let i = 0; i < Math.max(1, count); i++) {
        const t  = i / Math.max(1, count - 1);
        const tt = li % 2 === 0 ? t : 1 - t;
        const wx = -4.5 + tt * 9.0;
        const wz = baseZ + tt * 2.8;
        pts.push(project(wx, 0, Math.max(1.90, Math.min(8.5, wz))));
      }
    }

    // Second set: NE→SW (wz decreases as wx increases — opposite diagonal)
    const HALF2 = PATTERN_SAMPLES + 1 - HALF;
    const ppp2  = Math.max(1, Math.floor(HALF2 / N));
    for (let li = 0; li < N; li++) {
      const baseZ = 2.2 + li * 0.75;
      const count = li < N - 1 ? ppp2 : HALF2 - li * ppp2;
      for (let i = 0; i < Math.max(1, count); i++) {
        const t  = i / Math.max(1, count - 1);
        const tt = li % 2 === 0 ? t : 1 - t;
        const wx = -4.5 + tt * 9.0;
        const wz = baseZ + (1 - tt) * 2.8;
        pts.push(project(wx, 0, Math.max(1.90, Math.min(8.5, wz))));
      }
    }

    return pts;
  }

  // ── Pattern state ────────────────────────────────────────────────────────
  let patternPts:   Array<{ x: number; y: number }> = [];
  let bakedPts:     Array<{ x: number; y: number }> = [];
  let lastBakedIdx  = -1;
  let progress      = 0;   // float index 0..PATTERN_SAMPLES
  let elapsedTime   = 0;   // seconds

  function buildPattern() {
    switch (patternId) {
      case 'waves':   patternPts = buildWaves();   break;
      case 'ripples': patternPts = buildRipples(); break;
      case 'cross':   patternPts = buildCross();   break;
      default:        patternPts = buildSpiral();  break;
    }
    // Rebake already-drawn points with current OO after a resize.
    bakedPts     = [];
    lastBakedIdx = -1;
    if (progress > 0) bakePointsUpTo(Math.floor(progress), oo, elapsedTime);
  }

  function bakePointsUpTo(upToIdx: number, ooVal: number, time: number) {
    const jitter = (1 - Math.max(0, Math.min(100, ooVal)) / 100) * MAX_JITTER;
    for (let k = lastBakedIdx + 1; k <= upToIdx && k < patternPts.length; k++) {
      const base  = patternPts[k];
      const phase = k * 0.55 + time * 5.5;
      bakedPts[k] = {
        x: base.x + Math.sin(phase)              * jitter * 1.6,
        y: base.y + Math.cos(phase * 1.3 + 1.1) * jitter * 0.7,
      };
      lastBakedIdx = k;
    }
  }

  function drawRake(idxFloat: number, ooVal: number, time: number) {
    rakeGfx.clear();
    if (patternPts.length === 0) return;
    const idx = Math.max(0, Math.min(PATTERN_SAMPLES, idxFloat));
    if (idx <= 0) return;

    const lastIdx = Math.floor(idx);
    const frac    = idx - lastIdx;
    bakePointsUpTo(lastIdx, ooVal, time);
    if (lastBakedIdx < 0) return;

    const endK = Math.min(lastIdx, lastBakedIdx);

    // Live tip — only the moving head carries time-based jitter
    let lx: number | null = null, ly: number | null = null;
    if (frac > 0 && lastIdx < PATTERN_SAMPLES && bakedPts[lastIdx]) {
      const p0 = bakedPts[lastIdx];
      const p1 = patternPts[lastIdx + 1];
      const tx = p0.x + (p1.x - p0.x) * frac;
      const ty = p0.y + (p1.y - p0.y) * frac;
      const j  = (1 - Math.max(0, Math.min(100, ooVal)) / 100) * MAX_JITTER;
      const ph = time * 5.5;
      lx = tx + Math.sin(ph) * j * 1.6;
      ly = ty + Math.cos(ph * 1.3 + 1.1) * j * 0.7;
    }

    // Two-pass stroke: dark groove + warm highlight
    rakeGfx.moveTo(bakedPts[0].x, bakedPts[0].y);
    for (let k = 1; k <= endK; k++) rakeGfx.lineTo(bakedPts[k].x, bakedPts[k].y);
    if (lx !== null) rakeGfx.lineTo(lx, ly!);
    rakeGfx.stroke({ color: 0x6e5128, alpha: 0.78, width: 3.6, cap: 'round', join: 'round' });

    rakeGfx.moveTo(bakedPts[0].x, bakedPts[0].y - 0.9);
    for (let k = 1; k <= endK; k++) rakeGfx.lineTo(bakedPts[k].x, bakedPts[k].y - 0.9);
    if (lx !== null) rakeGfx.lineTo(lx, ly! - 0.9);
    rakeGfx.stroke({ color: 0xfff4d4, alpha: 0.55, width: 1.4, cap: 'round' });
  }

  // ── Scene builders (sky, wall, sand, rocks) ──────────────────────────────
  function drawSky() {
    const grad = new FillGradient(0, 0, 0, horizonY + 80);
    grad.addColorStop(0.00, 0x3c6ea4);
    grad.addColorStop(0.55, 0x82a8d0);
    grad.addColorStop(1.00, 0xc8d8e2);
    skyGfx.clear();
    skyGfx.rect(0, 0, viewW, horizonY + 100).fill(grad);
  }

  function drawWall() {
    wallGfx.clear();
    const z = 9.0, halfW = 9.0, wallTopY = 1.05, capTopY = 1.18;
    const tl = project(-halfW, wallTopY, z), tr = project(halfW, wallTopY, z);
    const bl = project(-halfW, 0,        z), br = project(halfW, 0,        z);
    const grad = new FillGradient(0, tl.y, 0, bl.y);
    grad.addColorStop(0, 0xd9c89c); grad.addColorStop(0.5, 0xc6b380); grad.addColorStop(1, 0xa6926a);
    wallGfx.poly([tl.x,tl.y, tr.x,tr.y, br.x,br.y, bl.x,bl.y]).fill(grad).stroke({ color:0x6a5028, alpha:0.55, width:1 });
    const rng = makeRng(0x1a3c);
    for (let i = 0; i < 24; i++) {
      const t = rng(); const x = tl.x+(tr.x-tl.x)*t;
      wallGfx.moveTo(x, tl.y).lineTo(x+(rng()-0.5)*6, bl.y-rng()*(bl.y-tl.y)*0.35)
        .stroke({ color:0x7c6438, alpha:0.20, width:1 });
    }
    const cl=project(-halfW-0.18,capTopY,z), cr=project(halfW+0.18,capTopY,z);
    const cl2=project(-halfW-0.18,wallTopY,z), cr2=project(halfW+0.18,wallTopY,z);
    wallGfx.poly([cl.x,cl.y,cr.x,cr.y,cr2.x,cr2.y,cl2.x,cl2.y]).fill({ color:0x231b14, alpha:1 });
    void br; void cr2;
  }

  let farTreeGs: Graphics[] = [];
  function buildFarTrees() {
    for (const g of farTreeGs) g.destroy({ children: true });
    farTreeGs = []; layers.treeFar.removeChildren();
    const rng = makeRng(0x77c1);
    for (let i = 0; i < 9; i++) {
      const wx=(-7.5+i*1.7+(rng()-0.5)*0.6), wz=(11.0+rng()*2.0);
      const h=(1.95+rng()*0.55), fr=(0.55+rng()*0.20);
      const baseP=project(wx,0,wz), topP=project(wx,h,wz);
      const fpx=baseP.scale*fr, cy=topP.y+fpx*0.2;
      const g = new Graphics();
      g.circle(baseP.x-fpx*0.50,cy+fpx*0.10,fpx*0.85).fill({ color:0x2f4a26, alpha:0.94 });
      g.circle(baseP.x+fpx*0.45,cy+fpx*0.05,fpx*0.78).fill({ color:0x3a5a30, alpha:0.94 });
      g.circle(baseP.x,          cy-fpx*0.20,fpx*0.95).fill({ color:0x466a38, alpha:0.92 });
      g.circle(baseP.x+fpx*0.10,cy-fpx*0.45,fpx*0.50).fill({ color:0x537a3e, alpha:0.88 });
      layers.treeFar.addChild(g); farTreeGs.push(g);
    }
  }

  function drawSandBed() {
    sandGfx.clear();
    const halfW=5.5, zNear=1.80, zFar=8.55;
    const fl=project(-halfW,0,zFar), fr=project(halfW,0,zFar);
    const nr=project(halfW,0,zNear), nl=project(-halfW,0,zNear);
    const grad=new FillGradient(0,fl.y,0,nl.y);
    grad.addColorStop(0,0xe2d4ac); grad.addColorStop(0.55,0xf2e4be); grad.addColorStop(1,0xfaf0d6);
    sandGfx.poly([fl.x,fl.y,fr.x,fr.y,nr.x,nr.y,nl.x,nl.y]).fill(grad).stroke({ color:0x6c5430, alpha:0.45, width:1.2 });
    sandGrainGfx.clear();
    const rng=makeRng(0x13ab);
    for (let i=0;i<1300;i++) {
      const wx=-halfW+rng()*halfW*2, wz=zNear+rng()*(zFar-zNear);
      const p=project(wx,0,wz), sz=0.30+(p.scale/focalPx)*6;
      if (rng()<0.55) sandGrainGfx.circle(p.x,p.y,sz).fill({ color:0xc0a070, alpha:0.34 });
      else sandGrainGfx.circle(p.x+0.3,p.y-0.3,sz*0.85).fill({ color:0xfff8de, alpha:0.50 });
    }
    void fr; void nl;
  }

  function drawRocks() {
    rockGfx.clear(); rockShadowGfx.clear();
    const stones=[
      { wx:0.05,wz:5.05,h:0.42,w:0.46,c:0x2a221a },
      { wx:-1.55,wz:4.10,h:0.26,w:0.30,c:0x1f1812 },
      { wx:1.65,wz:6.00,h:0.30,w:0.32,c:0x251d14 },
    ];
    stones.sort((a,b)=>b.wz-a.wz);
    for (const r of stones) {
      const baseP=project(r.wx,0,r.wz), topP=project(r.wx,r.h,r.wz);
      const halfWPx=baseP.scale*r.w*0.5, halfHPx=baseP.y-topP.y;
      rockShadowGfx.ellipse(baseP.x+halfWPx*0.42,baseP.y+halfHPx*0.16,halfWPx*1.40,halfHPx*0.30)
        .fill({ color:0x000000, alpha:0.34 });
      const N=16, verts: number[]=[];
      const rng=makeRng(Math.floor((r.wx+10)*1000+(r.wz+10)*100));
      for (let i=0;i<N;i++) {
        const a=(i/N)*Math.PI*2, upper=Math.sin(a)>0;
        const radial=halfWPx*(upper?(0.55+rng()*0.28):(0.95+rng()*0.20));
        verts.push(baseP.x+Math.cos(a)*radial, baseP.y-halfHPx*(0.55+Math.sin(a)*0.55));
      }
      rockGfx.poly(verts).fill({ color:r.c, alpha:1 }).stroke({ color:0x05030a, alpha:0.92, width:1 });
      rockGfx.ellipse(baseP.x-halfWPx*0.30,topP.y+halfHPx*0.18,halfWPx*0.42,halfHPx*0.30)
        .fill({ color:0xe8c878, alpha:0.18 });
    }
  }

  // ── Canopy (bloom-driven) ─────────────────────────────────────────────────
  let treeBloom        = 0;
  let lastBuiltBloom   = -1;

  function buildCanopy() {
    layers.treeL.removeChildren();
    layers.treeR.removeChildren();
    const sc = SEASON_CONFIG[season];
    for (let bi = 0; bi < BRANCH_DEFS.length; bi++) {
      const br = BRANCH_DEFS[bi];
      const container = br.side === 'L' ? layers.treeL : layers.treeR;
      const g = new Graphics();
      container.addChild(g);

      const wp: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= br.segs; i++) {
        const t  = i / br.segs;
        const wx = br.x0+(br.x1-br.x0)*t;
        const wy = br.y0+(br.y1-br.y0)*t+Math.sin(t*Math.PI)*br.arc;
        const wz = br.z0+(br.z1-br.z0)*t;
        wp.push(project(wx,wy,wz));
      }

      const rootScale = project(br.x0,br.y0,br.z0).scale;
      for (let i=1;i<wp.length;i++) {
        const t=i/(wp.length-1);
        const w=(1-t)*rootScale*0.052+t*rootScale*0.010;
        g.moveTo(wp[i-1].x,wp[i-1].y).lineTo(wp[i].x,wp[i].y)
         .stroke({ color:0x251808, alpha:1, width:Math.max(1,w), cap:'round' });
      }
      const bRng=makeRng(bi*173+31);
      for (let i=2;i<wp.length-1;i+=3) {
        const len=rootScale*(0.04+bRng()*0.06);
        g.moveTo(wp[i].x,wp[i].y).lineTo(wp[i].x+(bRng()-0.5)*len*0.6,wp[i].y-len*(0.7+bRng()*0.5))
         .stroke({ color:0x251808, alpha:0.75, width:1, cap:'round' });
      }
      const bareRng=makeRng(bi*91+7);
      const bareAlpha=Math.max(0,0.65-treeBloom*0.55);
      for (let li=0;li<4;li++) {
        const idx=Math.max(0,Math.min(wp.length-1,Math.floor((0.2+li*0.2)*wp.length)));
        const cp=wp[idx];
        const lr=rootScale*0.020;
        g.ellipse(cp.x+(bareRng()-0.5)*lr*5,cp.y+(bareRng()-0.5)*lr*2-lr,lr*2.2,lr*0.9)
         .fill({ color:sc.bare, alpha:bareAlpha });
      }

      if (treeBloom < 0.02) continue;
      const nDots=Math.floor(treeBloom*65);
      const dotRng=makeRng(bi*317+13);
      const isFloral=season==='spring'||season==='winter';
      const alpha=Math.min(1,treeBloom*1.8)*0.90;
      for (let di=0;di<nDots;di++) {
        const t=dotRng();
        const idx=Math.max(0,Math.min(wp.length-1,Math.floor(t*wp.length)));
        const cp=wp[idx];
        const spread=rootScale*(0.14+treeBloom*0.22);
        const fx=cp.x+(dotRng()-0.5)*spread*2.8;
        const fy=cp.y+(dotRng()-0.72)*spread;
        const fr=rootScale*(0.012+dotRng()*0.022)*(0.6+treeBloom*0.4);
        const useFlower=dotRng()<(isFloral?0.70:0.25);
        const color=useFlower?sc.flower:(dotRng()<0.55?sc.leaf:sc.leaf2);
        g.circle(fx,fy,Math.max(1.5,fr)).fill({ color, alpha });
      }
    }
    lastBuiltBloom = treeBloom;
  }

  // ── Leaf / petal pool ─────────────────────────────────────────────────────
  interface Particle {
    g: Graphics; wx: number; wy: number; wz: number;
    vx: number; vy: number; vz: number;
    spin: number; swayPhase: number; swayAmp: number;
    isPetal: boolean;
  }
  const LEAF_POOL_CAP = 140;
  const leafPool: Particle[] = [];

  function spawnLeaf(isPetal: boolean) {
    if (leafPool.length >= LEAF_POOL_CAP) return;
    const a = LEAF_ANCHORS[(Math.random()*LEAF_ANCHORS.length)|0];
    const wx = a.wx+(Math.random()-0.5)*(isPetal?1.4:0.55);
    const wy = a.wy+(Math.random()-0.5)*0.15;
    const wz = a.wz+(Math.random()-0.5)*0.40;
    const tints = SEASON_TINTS[season] ?? SEASON_TINTS.spring;
    const tint  = tints[(Math.random()*tints.length)|0];
    const g = new Graphics();
    if (isPetal) g.circle(0,0,1).fill({ color:tint, alpha:0.92 });
    else g.ellipse(0,0,1,0.42).fill({ color:tint, alpha:0.90 });
    g.rotation = Math.random()*Math.PI*2;
    layers.leaves.addChild(g);
    leafPool.push({
      g, wx, wy, wz, isPetal,
      vx:(Math.random()-0.5)*(isPetal?0.025:0.018),
      vy:-(isPetal?(0.007+Math.random()*0.007):(0.010+Math.random()*0.012)),
      vz:(Math.random()-0.5)*0.007,
      spin:(Math.random()-0.5)*(isPetal?0.07:0.04),
      swayPhase:Math.random()*Math.PI*2,
      swayAmp:isPetal?(0.008+Math.random()*0.012):(0.005+Math.random()*0.010),
    });
  }

  // ── Full-scene layout ─────────────────────────────────────────────────────
  function layout() {
    recomputeCamera();
    drawSky(); buildFarTrees(); drawWall();
    drawSandBed(); drawRocks();
    buildPattern();
    drawRake(progress, oo, elapsedTime);
    buildCanopy();
  }

  // ── Game state ────────────────────────────────────────────────────────────
  let oo            = 0;
  let threshold     = 50;      // from ta channel message
  let runIndex      = -1;
  let runStarted    = 0;
  let runFinished   = false;
  let finishCb:     ((r: RunResult) => void) | null = null;
  let paused        = false;
  let rlSeries:     number[] = [];
  let lastAccumSec  = 0;
  let prevOO        = 0;
  let petalSpawnAccum  = 0;
  let leafSpawnAccum   = 0;
  let leafSpawnInterval = 70;

  // ── Tick ──────────────────────────────────────────────────────────────────
  const tick = (ticker: Ticker) => {
    if (paused) return;

    const dt = ticker.deltaTime;
    elapsedTime += dt / 60;

    // ── Pattern drawing ──────────────────────────────────────────────────
    if (progress < PATTERN_SAMPLES) {
      progress = Math.min(PATTERN_SAMPLES, progress + IDX_PER_FRAME * dt);
    }
    // Before training starts (runIndex < 0) use oo=100 so jitter is zero —
    // MAX_JITTER scales as (1 - oo/100), so oo=0 causes 6.5 px chaos every
    // frame while oo=100 draws perfectly stable preview lines.
    drawRake(progress, runIndex < 0 ? 100 : oo, elapsedTime);

    // ── Bloom (phase 2) ──────────────────────────────────────────────────
    const inBloomPhase = progress >= PATTERN_SAMPLES;
    if (inBloomPhase && oo > threshold) {
      const bloomRate = 0.00025 * (oo / 100);
      treeBloom = Math.min(1, treeBloom + bloomRate * dt);
      if (treeBloom - lastBuiltBloom > 0.02 || (treeBloom >= 1 && lastBuiltBloom < 1)) {
        buildCanopy();
      }
    }

    // ── Leaves / petals ──────────────────────────────────────────────────
    if (inBloomPhase) {
      leafSpawnAccum += dt;
      if (leafSpawnAccum >= leafSpawnInterval) {
        leafSpawnAccum = 0;
        spawnLeaf(false);
        leafSpawnInterval = 70 + Math.random() * 80;
      }
      const ooDrop = prevOO - oo;
      if (treeBloom > 0.15 && ooDrop > 0.4) petalSpawnAccum += ooDrop * treeBloom * 1.2;
      if (treeBloom > 0.15 && oo < threshold) petalSpawnAccum += (1 - oo/threshold) * treeBloom * 0.08 * dt;
      while (petalSpawnAccum >= 1) { spawnLeaf(true); petalSpawnAccum -= 1; }
    }
    prevOO = oo;

    // ── Update particle pool ─────────────────────────────────────────────
    for (let i = leafPool.length - 1; i >= 0; i--) {
      const l = leafPool[i];
      l.swayPhase += 0.05 * dt;
      l.wy += l.vy * dt;
      l.wx += (l.vx + Math.sin(l.swayPhase) * l.swayAmp) * dt;
      l.wz += l.vz * dt;
      l.g.rotation += l.spin * dt;
      if (l.wy <= 0.02) {
        layers.leaves.removeChild(l.g);
        l.g.destroy();
        leafPool.splice(i, 1);
        continue;
      }
      const p = project(l.wx, l.wy, l.wz);
      l.g.x = p.x; l.g.y = p.y;
      l.g.scale.set(p.scale * (l.isPetal ? 0.028 : 0.06));
    }

    // ── Stats ────────────────────────────────────────────────────────────
    if (runIndex < 0 || runFinished) { emitStats(); return; }

    const now       = performance.now();
    const elapsedMs = now - runStarted;
    const nowSec    = Math.floor(elapsedMs / 1000);
    if (nowSec > lastAccumSec) { rlSeries.push(oo); lastAccumSec = nowSec; }
    emitStats();

    // ── Run completion — full bloom reached ──────────────────────────────
    if (treeBloom >= 1.0 && !runFinished && finishCb) {
      runFinished = true;
      const result: RunResult = {
        runIndex,
        startedAt:      runStarted,
        durationMs:     now - runStarted,
        rlSeries,
        qualityPercent: rlSeries.length > 0
          ? Math.round(rlSeries.reduce((a, b) => a + b, 0) / rlSeries.length)
          : 0,
        isValid:        true,
        gameSpecific:   { bloomReached: true, patternId, season },
      };
      finishCb(result);
    }
  };

  function emitStats() {
    if (!onStats) return;
    onStats({
      rl: runIndex >= 0 ? Math.round(oo) : 0,
      bloomPct: Math.round(treeBloom * 100),
    });
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const resizeListener = () => {
    if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      resizeDebounceTimer = null;
      layout();
    }, 150);
  };
  app.renderer.on('resize', resizeListener);

  // Initial draw
  layout();
  app.ticker.add(tick);

  // ── GameInstance interface ────────────────────────────────────────────────
  return {
    startRun(idx: number, onFinish: (r: RunResult) => void) {
      runIndex    = idx;
      runStarted  = performance.now();
      runFinished = false;
      rlSeries    = [];
      lastAccumSec = 0;
      finishCb    = onFinish;
      // Reset drawing state for new run
      progress      = 0;
      treeBloom     = 0;
      lastBuiltBloom = -1;
      bakedPts       = [];
      lastBakedIdx   = -1;
      elapsedTime    = 0;
      prevOO         = 0;
      petalSpawnAccum = 0;
      for (const l of leafPool) { layers.leaves.removeChild(l.g); l.g.destroy(); }
      leafPool.length = 0;
      buildCanopy();
      drawRake(0, oo, 0);
    },

    setRL(next: number, ta?: number) {
      oo = Math.max(0, Math.min(100, next));
      if (ta !== undefined) threshold = Math.max(0, Math.min(100, ta));
    },

    pause()  { paused = true; },
    resume() { paused = false; },

    destroy() {
      if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
      app.ticker.remove(tick);
      app.renderer.off('resize', resizeListener);
      for (const l of leafPool) { layers.leaves.removeChild(l.g); l.g.destroy(); }
      leafPool.length = 0;
      for (const g of farTreeGs) g.destroy({ children: true });
      stage.removeChild(root);
      root.destroy({ children: true });
      finishCb = null;
    },
  };
}
