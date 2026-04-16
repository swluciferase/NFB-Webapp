/**
 * Dynamic SVG preview thumbnails for the SelectGameStep wizard.
 * Each component re-renders when the user changes the selected option.
 */

// ─── Plane Preview ───────────────────────────────────────────────────────────

const PLANE_SKY: Record<string, [string, string]> = {
  day:    ['#3c6ea4', '#a8cce0'],
  dusk:   ['#a05020', '#e8b060'],
  sunset: ['#b03818', '#e87050'],
  night:  ['#050a18', '#0d1830'],
};
const PLANE_CLOUD: Record<string, string> = {
  day:    'rgba(255,255,255,0.72)',
  dusk:   'rgba(255,200,140,0.60)',
  sunset: 'rgba(255,160,100,0.55)',
  night:  'rgba(100,120,200,0.20)',
};
const PLANE_MTN: Record<string, [string, string]> = {
  day:    ['#2a5a30', '#3a7a40'],
  dusk:   ['#1a2a10', '#253a18'],
  sunset: ['#0e1808', '#18260e'],
  night:  ['#080c14', '#0c1420'],
};

const STARS = [[20,10],[50,6],[80,14],[110,8],[140,12],[170,7],[30,22],[90,18],[160,20]];

export function PlanePreview({ themeId = 'day' }: { themeId?: string }) {
  const [skyTop, skyBot] = PLANE_SKY[themeId] ?? PLANE_SKY.day;
  const cloudColor = PLANE_CLOUD[themeId] ?? PLANE_CLOUD.day;
  const [mtn1, mtn2] = PLANE_MTN[themeId] ?? PLANE_MTN.day;
  const isNight = themeId === 'night';
  const gid = `plSky_${themeId}`;
  return (
    <svg viewBox="0 0 200 120" width="200" height="120" style={{ borderRadius: 8 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skyTop}/>
          <stop offset="100%" stopColor={skyBot}/>
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill={`url(#${gid})`}/>
      {isNight && STARS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.9} fill="white" opacity={0.7}/>
      ))}
      <polygon points="0,90 35,52 65,80 100,45 140,72 180,50 200,65 200,120 0,120" fill={mtn1}/>
      <polygon points="0,92 35,54 65,82 100,47 140,74 180,52 200,67 200,120 0,120" fill={mtn2}/>
      <ellipse cx="40" cy="28" rx="24" ry="10" fill={cloudColor}/>
      <ellipse cx="55" cy="24" rx="18" ry="8" fill={cloudColor}/>
      <ellipse cx="150" cy="35" rx="20" ry="9" fill={cloudColor}/>
      <g transform="translate(100,58) rotate(-8)">
        <ellipse rx="22" ry="5.5" fill="white"/>
        <polygon points="-6,-4 -24,-20 -28,-4" fill="white"/>
        <polygon points="-6,4 -24,20 -28,4" fill="white"/>
        <polygon points="18,-3 26,-10 24,-3" fill="white"/>
        <polygon points="18,3 26,10 24,3" fill="white"/>
        <ellipse cx="4" cy="0" rx="4" ry="3" fill={isNight ? '#fff9a0' : '#a8d8f0'}/>
      </g>
    </svg>
  );
}

// ─── Baseball Preview — stadium SIZE variants ─────────────────────────────────

interface BBConfig {
  sky: string; outR: number; diagH: number;
  hasDome: boolean; lights: boolean;
}
const BB_CFG: Record<string, BBConfig> = {
  day:    { sky: '#87c3e8', outR: 46,  diagH: 16, hasDome: false, lights: false },
  dusk:   { sky: '#c08040', outR: 60,  diagH: 21, hasDome: false, lights: false },
  sunset: { sky: '#b03828', outR: 74,  diagH: 26, hasDome: false, lights: false },
  night:  { sky: '#06090e', outR: 88,  diagH: 31, hasDome: true,  lights: true  },
};

export function BaseballPreview({ themeId = 'day' }: { themeId?: string }) {
  const cfg = BB_CFG[themeId] ?? BB_CFG.day;
  const { sky, outR, diagH, hasDome, lights } = cfg;

  // Home plate at (100, 112); field extends upward.
  const hx = 100, hy = 112;
  const diag = diagH / Math.SQRT2;  // diagonal offset for 45°-rotated diamond

  // Outfield fair territory: foul lines to outR then arc
  const lx = hx - diag * (outR / diagH);
  const ry = hy - diag * (outR / diagH);
  // Actually: foul line goes at 45° from home for distance outR
  const foulDelta = outR / Math.SQRT2;
  const llx = hx - foulDelta, lly = hy - foulDelta;
  const rlx = hx + foulDelta, rly = hy - foulDelta;
  const fairPath = `M${hx},${hy} L${llx.toFixed(1)},${lly.toFixed(1)} A${outR},${outR},0,0,1,${rlx.toFixed(1)},${rly.toFixed(1)} Z`;

  // Infield diamond vertices
  const b1x = hx + diagH, b1y = hy - diagH;   // first base
  const b2x = hx,          b2y = hy - diagH*2; // second base (pitcher area)
  const b3x = hx - diagH, b3y = hy - diagH;   // third base

  // Pitcher mound roughly at 60% between home and second
  const pmx = hx, pmy = hy - diagH * 1.2;

  return (
    <svg viewBox="0 0 200 120" width="200" height="120" style={{ borderRadius: 8 }}>
      {/* Sky */}
      <rect width="200" height="120" fill={sky}/>
      {lights && [[30,8],[60,5],[100,4],[140,5],[170,8]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="#fff9a0" opacity={0.8}/>
      ))}
      {/* Outfield grass */}
      <path d={fairPath} fill="#3a7040"/>
      {/* Infield dirt */}
      <polygon
        points={`${hx},${hy} ${b1x},${b1y} ${b2x},${b2y} ${b3x},${b3y}`}
        fill="#c8a870"
      />
      {/* Pitcher's mound */}
      <ellipse cx={pmx} cy={pmy} rx={6} ry={4} fill="#b89060"/>
      {/* Bases */}
      {[[hx,hy],[b1x,b1y],[b2x,b2y],[b3x,b3y]].map(([bx,by],i) => (
        <rect key={i} x={bx-4} y={by-4} width={8} height={8} fill="white" transform={`rotate(45,${bx},${by})`}/>
      ))}
      {/* Foul lines */}
      <line x1={hx} y1={hy} x2={llx.toFixed(1)} y2={lly.toFixed(1)} stroke="white" strokeWidth="1" opacity="0.45"/>
      <line x1={hx} y1={hy} x2={rlx.toFixed(1)} y2={rly.toFixed(1)} stroke="white" strokeWidth="1" opacity="0.45"/>
      {/* Dome arc for 巨蛋 */}
      {hasDome && (
        <path
          d={`M15,112 Q100,${120 - outR * 1.15} 185,112`}
          fill="none" stroke="rgba(160,200,230,0.55)" strokeWidth="3"
        />
      )}
    </svg>
  );
}

// ─── Zentangle Preview — 10 pattern thumbnails ───────────────────────────────

function ZentPatternContent({ modeId }: { modeId: string }) {
  const cx = 100, cy = 60, R = 46;
  const str = '#2a1f14';
  const op = 0.65;

  if (modeId === 'mandala') {
    const petals = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
      const ir = R * 0.28, or = R * 0.88;
      const ix = cx + Math.cos(a) * ir, iy = cy + Math.sin(a) * ir;
      const ox = cx + Math.cos(a) * or, oy = cy + Math.sin(a) * or;
      return `M${ix.toFixed(1)},${iy.toFixed(1)} Q${(cx+Math.cos(a-0.5)*R*0.6).toFixed(1)},${(cy+Math.sin(a-0.5)*R*0.6).toFixed(1)} ${ox.toFixed(1)},${oy.toFixed(1)} Q${(cx+Math.cos(a+0.5)*R*0.6).toFixed(1)},${(cy+Math.sin(a+0.5)*R*0.6).toFixed(1)} ${ix.toFixed(1)},${iy.toFixed(1)}`;
    }).join(' ');
    return (
      <>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={str} strokeWidth="1.5" opacity="0.7"/>
        <path d={petals} fill="none" stroke={str} strokeWidth="1.2" opacity={op}/>
        <circle cx={cx} cy={cy} r={R*0.24} fill="none" stroke={str} strokeWidth="1" opacity="0.6"/>
        <circle cx={cx} cy={cy} r={R*0.10} fill="none" stroke={str} strokeWidth="0.8" opacity="0.5"/>
      </>
    );
  }

  if (modeId === 'lattice') {
    // Fish-scale: grid of overlapping semicircle arcs
    const r = 18;
    const rows = [[38,30,60,90,120,150,170],[56,15,45,75,105,135,165],[74,30,60,90,120,150,170],[92,15,45,75,105,135,165]];
    const arcs = rows.flatMap(([y,...xs]) =>
      xs.map(x => `M${x-r},${y} A${r},${r},0,0,1,${x+r},${y}`)
    );
    return <path d={arcs.join(' ')} fill="none" stroke={str} strokeWidth="1.3" opacity={op}/>;
  }

  if (modeId === 'ribbon') {
    // 6 crescents radiating from center
    const segments = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      const a1 = a - 0.35, a2 = a + 0.35;
      const inner = R * 0.38, outer = R * 0.90;
      const x1 = cx+Math.cos(a1)*inner, y1 = cy+Math.sin(a1)*inner;
      const x2 = cx+Math.cos(a2)*inner, y2 = cy+Math.sin(a2)*inner;
      const x3 = cx+Math.cos(a2)*outer, y3 = cy+Math.sin(a2)*outer;
      const x4 = cx+Math.cos(a1)*outer, y4 = cy+Math.sin(a1)*outer;
      // outer arc
      const oa = `A${outer},${outer},0,0,1,${x3.toFixed(1)},${y3.toFixed(1)}`;
      // inner arc reverse
      const ia = `A${inner},${inner},0,0,0,${x1.toFixed(1)},${y1.toFixed(1)}`;
      return `M${x1.toFixed(1)},${y1.toFixed(1)} L${x4.toFixed(1)},${y4.toFixed(1)} ${oa} L${x2.toFixed(1)},${y2.toFixed(1)} ${ia}`;
    }).join(' ');
    return (
      <>
        <path d={segments} fill="none" stroke={str} strokeWidth="1.2" opacity={op}/>
        <circle cx={cx} cy={cy} r={R*0.30} fill="none" stroke={str} strokeWidth="1" opacity="0.55"/>
      </>
    );
  }

  if (modeId === 'sunflower') {
    // Fibonacci-ish spiral of dots + outer petal ring
    const dots: [number,number][] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 30; i++) {
      const ra = Math.sqrt(i / 30) * R * 0.75;
      const theta = i * golden;
      dots.push([cx + Math.cos(theta)*ra, cy + Math.sin(theta)*ra]);
    }
    const petals = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const mx = cx+Math.cos(a)*R*0.80, my = cy+Math.sin(a)*R*0.80;
      const tip = R*0.96;
      return `M${cx},${cy} Q${(cx+Math.cos(a-0.3)*R*0.7).toFixed(1)},${(cy+Math.sin(a-0.3)*R*0.7).toFixed(1)} ${(cx+Math.cos(a)*tip).toFixed(1)},${(cy+Math.sin(a)*tip).toFixed(1)} Q${(cx+Math.cos(a+0.3)*R*0.7).toFixed(1)},${(cy+Math.sin(a+0.3)*R*0.7).toFixed(1)} ${cx},${cy}`;
    }).join(' ');
    return (
      <>
        <path d={petals} fill="none" stroke={str} strokeWidth="1" opacity="0.45"/>
        {dots.map(([x,y],i) => <circle key={i} cx={x} cy={y} r={1.4} fill={str} opacity={op}/>)}
      </>
    );
  }

  if (modeId === 'snowflake') {
    // 6 arms with two side branches each
    const arms = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const ex = cx+Math.cos(a)*R*0.92, ey = cy+Math.sin(a)*R*0.92;
      const m1x = cx+Math.cos(a)*R*0.5, m1y = cy+Math.sin(a)*R*0.5;
      const b1x = m1x+Math.cos(a+Math.PI/3)*R*0.22, b1y = m1y+Math.sin(a+Math.PI/3)*R*0.22;
      const b2x = m1x+Math.cos(a-Math.PI/3)*R*0.22, b2y = m1y+Math.sin(a-Math.PI/3)*R*0.22;
      return `M${cx},${cy} L${ex.toFixed(1)},${ey.toFixed(1)} M${m1x.toFixed(1)},${m1y.toFixed(1)} L${b1x.toFixed(1)},${b1y.toFixed(1)} M${m1x.toFixed(1)},${m1y.toFixed(1)} L${b2x.toFixed(1)},${b2y.toFixed(1)}`;
    }).join(' ');
    return (
      <>
        <path d={arms} fill="none" stroke={str} strokeWidth="1.4" opacity={op} strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r={R*0.88} fill="none" stroke={str} strokeWidth="0.8" opacity="0.30"
          strokeDasharray="4,6"/>
        <circle cx={cx} cy={cy} r={4} fill="none" stroke={str} strokeWidth="1.2" opacity="0.6"/>
      </>
    );
  }

  if (modeId === 'celtic') {
    // 3 interlocked ovals at 0°, 120°, 240°
    const loops = Array.from({ length: 3 }, (_, i) => {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const d = R * 0.40;
      const ox = cx + Math.cos(a) * d, oy = cy + Math.sin(a) * d;
      return (
        <ellipse
          key={i}
          cx={ox} cy={oy} rx={R * 0.52} ry={R * 0.26}
          transform={`rotate(${(a * 180 / Math.PI) + 90},${ox},${oy})`}
          fill="none" stroke={str} strokeWidth="1.6" opacity={op}
        />
      );
    });
    return <>{loops}<circle cx={cx} cy={cy} r={R*0.16} fill="none" stroke={str} strokeWidth="1" opacity="0.5"/></>;
  }

  if (modeId === 'feather') {
    // Central curved spine + angled barbs
    const spine = `M${cx+10},${cy+R*0.88} C${cx+5},${cy+R*0.40} ${cx-12},${cy-R*0.30} ${cx-8},${cy-R*0.88}`;
    const numBarbs = 12;
    const barbs = Array.from({ length: numBarbs }, (_, i) => {
      const t = i / (numBarbs - 1);
      // Interpolate spine: approximate parametric cubic bezier
      const spineX = (cx+10)*(1-t)**3 + (cx+5)*3*(1-t)**2*t + (cx-12)*3*(1-t)*t**2 + (cx-8)*t**3;
      const spineY = (cy+R*0.88)*(1-t)**3 + (cy+R*0.40)*3*(1-t)**2*t + (cy-R*0.30)*3*(1-t)*t**2 + (cy-R*0.88)*t**3;
      const spread = (1 - Math.abs(t - 0.5) * 2) * 0.7 + 0.3;
      const barbLen = R * 0.40 * spread;
      const angle = -Math.PI * 0.55;
      const rx1 = spineX + Math.cos(angle) * barbLen, ry1 = spineY + Math.sin(angle) * barbLen;
      const rx2 = spineX + Math.cos(angle + Math.PI) * barbLen * 0.85, ry2 = spineY + Math.sin(angle + Math.PI) * barbLen * 0.85;
      return `M${spineX.toFixed(1)},${spineY.toFixed(1)} L${rx1.toFixed(1)},${ry1.toFixed(1)} M${spineX.toFixed(1)},${spineY.toFixed(1)} L${rx2.toFixed(1)},${ry2.toFixed(1)}`;
    }).join(' ');
    return (
      <>
        <path d={spine} fill="none" stroke={str} strokeWidth="1.8" opacity="0.7" strokeLinecap="round"/>
        <path d={barbs} fill="none" stroke={str} strokeWidth="1" opacity={op} strokeLinecap="round"/>
      </>
    );
  }

  if (modeId === 'compass') {
    // 8-pointed star: 4 long + 4 short diamond points
    const longR = R * 0.92, shortR = R * 0.48, midR = R * 0.18;
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? longR : shortR;
      return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    });
    // Draw as diamond shapes (each consecutive 3-point set forms a kite)
    const kites = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? longR : shortR;
      const tipX = cx+Math.cos(a)*r, tipY = cy+Math.sin(a)*r;
      const sL = (i - 1 + 8) % 8;
      const sR = (i + 1) % 8;
      const aL = (sL / 8) * Math.PI * 2 - Math.PI / 2;
      const aR = (sR / 8) * Math.PI * 2 - Math.PI / 2;
      const rSide = sL % 2 === 0 ? longR : shortR;
      const side = midR;
      const lx2 = cx+Math.cos(aL)*side, ly2 = cy+Math.sin(aL)*side;
      const rx2 = cx+Math.cos(aR)*side, ry2 = cy+Math.sin(aR)*side;
      return `M${cx},${cy} L${lx2.toFixed(1)},${ly2.toFixed(1)} L${tipX.toFixed(1)},${tipY.toFixed(1)} L${rx2.toFixed(1)},${ry2.toFixed(1)} Z`;
    }).join(' ');
    return (
      <>
        <path d={kites} fill="none" stroke={str} strokeWidth="1.2" opacity={op}/>
        <circle cx={cx} cy={cy} r={R*0.60} fill="none" stroke={str} strokeWidth="0.9" opacity="0.40"/>
        <circle cx={cx} cy={cy} r={R*0.28} fill="none" stroke={str} strokeWidth="1" opacity="0.55"/>
        <circle cx={cx} cy={cy} r={R*0.10} fill="none" stroke={str} strokeWidth="1" opacity="0.65"/>
      </>
    );
  }

  if (modeId === 'honeycomb') {
    // Hexagonal tiling — 7 hexagons (1 center + 6 neighbors)
    const hr = 22; // hex radius (center to vertex)
    const hexPts = (hcx: number, hcy: number) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 3 + Math.PI / 6; // flat-top
        return `${(hcx+Math.cos(a)*hr).toFixed(1)},${(hcy+Math.sin(a)*hr).toFixed(1)}`;
      }).join(' ');
    const spacing = hr * Math.sqrt(3);
    const neighbors = Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3;
      return [cx + Math.cos(a) * spacing, cy + Math.sin(a) * spacing] as [number, number];
    });
    return (
      <>
        <polygon points={hexPts(cx, cy)} fill="none" stroke={str} strokeWidth="1.3" opacity={op}/>
        {neighbors.map(([nx, ny], i) => (
          <polygon key={i} points={hexPts(nx, ny)} fill="none" stroke={str} strokeWidth="1.3" opacity={op}/>
        ))}
      </>
    );
  }

  if (modeId === 'lotus') {
    // Nested concentric petal layers: 3 rings of petals
    const rings = [
      { n: 5, inner: R*0.12, outer: R*0.40, spread: 0.55 },
      { n: 7, inner: R*0.32, outer: R*0.68, spread: 0.42 },
      { n: 9, inner: R*0.58, outer: R*0.94, spread: 0.35 },
    ];
    const paths = rings.map(({ n, inner, outer, spread }, ri) =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + ri * 0.3;
        const tx = cx + Math.cos(a) * outer, ty = cy + Math.sin(a) * outer;
        const lx = cx + Math.cos(a - spread) * inner, ly = cy + Math.sin(a - spread) * inner;
        const rx = cx + Math.cos(a + spread) * inner, ry = cy + Math.sin(a + spread) * inner;
        const cl = cx + Math.cos(a - spread * 0.5) * (inner + outer) * 0.5;
        const cy2 = cy + Math.sin(a - spread * 0.5) * (inner + outer) * 0.5;
        const cr = cx + Math.cos(a + spread * 0.5) * (inner + outer) * 0.5;
        const cry = cy + Math.sin(a + spread * 0.5) * (inner + outer) * 0.5;
        return `M${lx.toFixed(1)},${ly.toFixed(1)} Q${cl.toFixed(1)},${cy2.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} Q${cr.toFixed(1)},${cry.toFixed(1)} ${rx.toFixed(1)},${ry.toFixed(1)}`;
      }).join(' ')
    ).join(' ');
    return (
      <>
        <path d={paths} fill="none" stroke={str} strokeWidth="1.1" opacity={op}/>
        <circle cx={cx} cy={cy} r={R*0.10} fill="none" stroke={str} strokeWidth="1" opacity="0.6"/>
      </>
    );
  }

  // Fallback: simple concentric circles
  return (
    <>
      {[1, 0.65, 0.38].map((f, i) => (
        <circle key={i} cx={cx} cy={cy} r={R*f} fill="none" stroke={str} strokeWidth="1.2" opacity={op}/>
      ))}
    </>
  );
}

export function ZentanglePreview({ modeId = 'mandala' }: { modeId?: string }) {
  return (
    <svg viewBox="0 0 200 120" width="200" height="120" style={{ borderRadius: 8 }}>
      <rect width="200" height="120" fill="#fffaf0"/>
      <ZentPatternContent modeId={modeId}/>
    </svg>
  );
}

// ─── Karesanzui Preview — season × sand-pattern ───────────────────────────────

interface KareSeason {
  sky: string; sandBg: string;
  treeTrunk: string; treeCanopy: string;
}
const KARE_SEASON: Record<string, KareSeason> = {
  spring: { sky: '#a8c8f0', sandBg: '#e8d8c0', treeTrunk: '#5a3a20', treeCanopy: '#f0a8c0' },
  summer: { sky: '#6ab8e8', sandBg: '#dcc8a0', treeTrunk: '#3a2810', treeCanopy: '#3a9040' },
  autumn: { sky: '#d49050', sandBg: '#d4bc96', treeTrunk: '#4a2a10', treeCanopy: '#d85820' },
  winter: { sky: '#b0bcd8', sandBg: '#ddd8d0', treeTrunk: '#3a2838', treeCanopy: '#9870b0' },
};

function KareSandLines({ patternId, sandTop }: { patternId: string; sandTop: number }) {
  const str = '#8a7050';
  const ow = 0.6;
  const sw = 1.4;

  if (patternId === 'waves') {
    const ys = [sandTop+12, sandTop+24, sandTop+36, sandTop+48, sandTop+60, sandTop+72, sandTop+82];
    const paths = ys.map((y, i) => {
      const amp = 8;
      const phase = i % 2 === 0 ? 0 : Math.PI;
      const off = Math.sin(phase) * amp;
      return `M10,${y} Q55,${y+amp*Math.sin(phase+Math.PI/2)} 100,${y} Q145,${y-amp*Math.sin(phase+Math.PI/2)} 190,${y}`;
    }).join(' ');
    return <path d={paths} fill="none" stroke={str} strokeWidth={sw} opacity={ow}/>;
  }

  if (patternId === 'ripples') {
    const arcs = [8,17,27,38,50,62,74].map((r, i) => {
      if (r > 80) return '';
      const ellipseH = r * 0.62;
      return `M${100-r},75 A${r},${ellipseH},0,0,1,${100+r},75`;
    }).join(' ');
    return (
      <>
        <path d={arcs} fill="none" stroke={str} strokeWidth={sw} opacity={ow}/>
        {/* lower halves as dashed */}
        {[8,17,27,38,50,62,74].map((r, i) => {
          const ellipseH = r * 0.62;
          return (
            <path
              key={i}
              d={`M${100-r},75 A${r},${ellipseH},0,0,0,${100+r},75`}
              fill="none" stroke={str} strokeWidth={sw * 0.7} opacity={ow * 0.5}
              strokeDasharray="3,4"
            />
          );
        })}
      </>
    );
  }

  if (patternId === 'cross') {
    // Diagonal cross-hatch lines
    const linesNE = [
      `M10,${sandTop+5} L${10+(120-sandTop-5)},120`,
      `M40,${sandTop} L${40+(120-sandTop)},120`,
      `M80,${sandTop} L${80+(120-sandTop)},120`,
      `M120,${sandTop} L${120+(120-sandTop)},120`,
      `M155,${sandTop} L190,${sandTop+35}`,
      `M10,${sandTop+30} L${10+(90)},120`,
    ].join(' ');
    const linesNW = [
      `M190,${sandTop+5} L${190-(120-sandTop-5)},120`,
      `M160,${sandTop} L${160-(120-sandTop)},120`,
      `M120,${sandTop} L${120-(120-sandTop)},120`,
      `M80,${sandTop} L${80-(120-sandTop)},120`,
      `M45,${sandTop} L10,${sandTop+35}`,
      `M190,${sandTop+30} L${190-90},120`,
    ].join(' ');
    return (
      <path d={linesNE + ' ' + linesNW} fill="none" stroke={str} strokeWidth={sw} opacity={ow}/>
    );
  }

  // Default: spiral — approximate with a shrinking quadratic bezier path
  const spiralPath = [
    `M100,${sandTop+8}`,
    `C150,${sandTop+8} 175,${sandTop+40} 175,75`,
    `C175,${sandTop+65} 150,${sandTop+80} 100,${sandTop+80}`,
    `C50,${sandTop+80} 25,${sandTop+65} 28,75`,
    `C28,${sandTop+44} 48,${sandTop+24} 100,${sandTop+25}`,
    `C140,${sandTop+25} 155,${sandTop+48} 155,75`,
    `C155,${sandTop+62} 140,${sandTop+70} 100,${sandTop+70}`,
    `C70,${sandTop+70} 55,${sandTop+60} 55,75`,
    `C55,${sandTop+55} 65,${sandTop+48} 100,${sandTop+48}`,
    `C120,${sandTop+48} 128,${sandTop+58} 125,75`,
    `C124,${sandTop+65} 115,${sandTop+70} 100,${sandTop+68}`,
  ].join(' ');
  return <path d={spiralPath} fill="none" stroke={str} strokeWidth={sw} opacity={ow}/>;
}

function KareTree({ x, season }: { x: number; season: string }) {
  const cfg = KARE_SEASON[season] ?? KARE_SEASON.spring;
  return (
    <>
      <rect x={x-2} y={16} width={4} height={10} fill={cfg.treeTrunk}/>
      <ellipse cx={x} cy={14} rx={9} ry={8} fill={cfg.treeCanopy} opacity={0.9}/>
    </>
  );
}

export function KaresanzuiPreview({ season = 'spring', patternId = 'spiral' }: { season?: string; patternId?: string }) {
  const cfg = KARE_SEASON[season] ?? KARE_SEASON.spring;
  const sandTop = 28;
  const gid = `kareSand_${season}`;
  return (
    <svg viewBox="0 0 200 120" width="200" height="120" style={{ borderRadius: 8 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.sandBg}/>
          <stop offset="100%" stopColor={cfg.sandBg} stopOpacity="0.8"/>
        </linearGradient>
        <clipPath id={`sandClip_${season}_${patternId}`}>
          <rect y={sandTop} width="200" height={120-sandTop}/>
        </clipPath>
      </defs>
      {/* Sky strip */}
      <rect width="200" height={sandTop} fill={cfg.sky}/>
      {/* Trees */}
      <KareTree x={30} season={season}/>
      <KareTree x={100} season={season}/>
      <KareTree x={170} season={season}/>
      {/* Sand background */}
      <rect y={sandTop} width="200" height={120-sandTop} fill={`url(#${gid})`}/>
      {/* Sand pattern, clipped to sand area */}
      <g clipPath={`url(#sandClip_${season}_${patternId})`}>
        <KareSandLines patternId={patternId} sandTop={sandTop}/>
      </g>
      {/* Rocks */}
      <ellipse cx="100" cy="80" rx="11" ry="8" fill="#2a221a"/>
      <ellipse cx="62" cy="62" rx="7" ry="5.5" fill="#1f1812"/>
      <ellipse cx="138" cy="90" rx="8" ry="6" fill="#251d14"/>
    </svg>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export interface GamePreviewProps {
  gameId: string;
  modeId: string;
  patternId: string;
  themeId: string;
}

export function GamePreview({ gameId, modeId, patternId, themeId }: GamePreviewProps) {
  if (gameId === 'plane')      return <PlanePreview themeId={themeId}/>;
  if (gameId === 'baseball')   return <BaseballPreview themeId={themeId}/>;
  if (gameId === 'zentangle')  return <ZentanglePreview modeId={modeId}/>;
  if (gameId === 'karesansui') return <KaresanzuiPreview season={modeId} patternId={patternId}/>;
  return null;
}
