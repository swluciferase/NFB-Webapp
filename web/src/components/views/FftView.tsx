import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import type { EegPacket, FilterParams, FilterBiquadState } from '../../types/eeg';
import { CHANNEL_LABELS, CHANNEL_COUNT, SAMPLE_RATE_HZ } from '../../types/eeg';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';

export interface FftViewProps {
  packets?: EegPacket[];
  filterParams: FilterParams;
  filterBiquadRef: MutableRefObject<FilterBiquadState>;
  lang: Lang;
}

const FFT_SIZE = 1024;

const MAX_FREQ_OPTIONS = [30, 60, 100] as const;
type MaxFreq = 30 | 60 | 100;

const DB_RANGE_OPTIONS = [
  { minDb: -30, maxDb: 10,  label: 'Narrow' },
  { minDb: -40, maxDb: 20,  label: 'Normal' },
  { minDb: -60, maxDb: 40,  label: 'Wide'   },
] as const;

const CHANNEL_COLORS = [
  'rgba(220, 100, 110, 0.85)',  // coral rose   — Fp1
  'rgba(100, 160, 215, 0.85)',  // dusty blue   — Fp2
  'rgba(90,  185, 130, 0.85)',  // sage green   — T7
  'rgba(220, 175, 75,  0.85)',  // warm amber   — T8
  'rgba(70,  185, 200, 0.85)',  // muted teal   — O1
  'rgba(185, 130, 215, 0.85)',  // soft lavender— O2
  'rgba(215, 135, 80,  0.85)',  // warm copper  — Fz
  'rgba(140, 105, 200, 0.85)',  // dusty violet — Pz
];

// ── Filter helpers ──

function compute1stOrderHP(f0: number, fs: number) {
  const K = Math.tan(Math.PI * f0 / fs);
  const a0inv = 1 / (1 + K);
  return { b0: a0inv, b1: -a0inv, b2: 0, a1: (K - 1) * a0inv, a2: 0 };
}
function compute1stOrderLP(f0: number, fs: number) {
  const K = Math.tan(Math.PI * f0 / fs);
  const a0inv = 1 / (1 + K);
  return { b0: K * a0inv, b1: K * a0inv, b2: 0, a1: (K - 1) * a0inv, a2: 0 };
}

function computeButterHP(f0: number, fs: number, q: number) {
  const w0 = 2 * Math.PI * f0 / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cosW) / 2 / a0, b1: -(1 + cosW) / a0, b2: (1 + cosW) / 2 / a0,
    a1: -2 * cosW / a0, a2: (1 - alpha) / a0,
  };
}

function computeButterLP(f0: number, fs: number, q: number) {
  const w0 = 2 * Math.PI * f0 / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosW) / 2 / a0, b1: (1 - cosW) / a0, b2: (1 - cosW) / 2 / a0,
    a1: -2 * cosW / a0, a2: (1 - alpha) / a0,
  };
}

// Comb notch: 50 Hz + 60 Hz (fundamental) + 120 Hz (2nd harmonic), Q=30 each
const NOTCH_Q = 30;
function computeCombNotch(fs: number) {
  const makeCoeff = (f0: number) => {
    const w0    = 2 * Math.PI * f0 / fs;
    const alpha = Math.sin(w0) / (2 * NOTCH_Q);
    const cosW  = Math.cos(w0);
    const a0    = 1 + alpha;
    return { b0: 1/a0, b1: -2*cosW/a0, b2: 1/a0, a1: -2*cosW/a0, a2: (1-alpha)/a0 };
  };
  return { c50: makeCoeff(50), c60: makeCoeff(60), c120: makeCoeff(120) };
}

function applyBiquad(
  x: number,
  stateArr: Float64Array,
  stateBase: number,
  b0: number, b1: number, b2: number, a1: number, a2: number,
): number {
  const y = b0 * x + stateArr[stateBase]!;
  stateArr[stateBase]     = b1 * x - a1 * y + stateArr[stateBase + 1]!;
  stateArr[stateBase + 1] = b2 * x - a2 * y;
  return y;
}

function applyFilterChain(
  x: number,
  ch: number,
  biquad: FilterBiquadState,
  params: FilterParams,
  hpCoeffs: ReturnType<typeof computeButterHP>[],
  lpCoeffs: ReturnType<typeof computeButterLP>[],
  notchCoeffs: ReturnType<typeof computeCombNotch>,
): number {
  let s = x;
  // ① Saturation gate
  const SAT_THRESH_UV = 356_250; // ADS1299: VREF=4.5V, Gain=12 → 375,000 µV × 95%
  if (Math.abs(s) > SAT_THRESH_UV) {
    s = biquad.lastValidSample[ch] ?? 0;
  } else {
    biquad.lastValidSample[ch] = s;
  }
  // ② Adaptive DC blocker
  const DC_ALPHA_SLOW = 0.9985;
  const DC_ALPHA_FAST = 0.95;
  const LARGE_DRIFT_THRESH = 150;
  const dcPrev = biquad.dcState[ch] ?? 0;
  const instDrift = Math.abs(s - dcPrev);
  biquad.dcDriftRate[ch] = 0.9 * (biquad.dcDriftRate[ch] ?? 0) + 0.1 * instDrift;
  const dcAlpha = biquad.dcDriftRate[ch] > LARGE_DRIFT_THRESH ? DC_ALPHA_FAST : DC_ALPHA_SLOW;
  const dcOut = s - dcPrev;
  biquad.dcState[ch] = dcAlpha * dcPrev + (1 - dcAlpha) * s;
  s = dcOut;

  if (params.bandpassEnabled) {
    // LP first (limits broadband amplitude entering HP states)
    s = applyBiquad(s, biquad.lpState1, ch * 2, lpCoeffs[0]!.b0, lpCoeffs[0]!.b1, lpCoeffs[0]!.b2, lpCoeffs[0]!.a1, lpCoeffs[0]!.a2);
    s = applyBiquad(s, biquad.lpState2, ch * 2, lpCoeffs[1]!.b0, lpCoeffs[1]!.b1, lpCoeffs[1]!.b2, lpCoeffs[1]!.a1, lpCoeffs[1]!.a2);
    s = applyBiquad(s, biquad.hpState1, ch * 2, hpCoeffs[0]!.b0, hpCoeffs[0]!.b1, hpCoeffs[0]!.b2, hpCoeffs[0]!.a1, hpCoeffs[0]!.a2);
    s = applyBiquad(s, biquad.hpState2, ch * 2, hpCoeffs[1]!.b0, hpCoeffs[1]!.b1, hpCoeffs[1]!.b2, hpCoeffs[1]!.a1, hpCoeffs[1]!.a2);
  }

  if (params.notchFreq !== 0) {
    // Comb notch: 50 Hz (ch*6+0/1) + 60 Hz (ch*6+2/3) + 120 Hz (ch*6+4/5)
    const { c50, c60, c120 } = notchCoeffs;
    s = applyBiquad(s, biquad.notchState, ch * 6,     c50.b0,  c50.b1,  c50.b2,  c50.a1,  c50.a2);
    s = applyBiquad(s, biquad.notchState, ch * 6 + 2, c60.b0,  c60.b1,  c60.b2,  c60.a1,  c60.a2);
    s = applyBiquad(s, biquad.notchState, ch * 6 + 4, c120.b0, c120.b1, c120.b2, c120.a1, c120.a2);
  }

  return s;
}

// ── FFT ──

function bitReverse(value: number, bits: number): number {
  let reversed = 0;
  for (let bit = 0; bit < bits; bit++) {
    reversed = (reversed << 1) | (value & 1);
    value >>= 1;
  }
  return reversed;
}

function fftReal(input: Float64Array): { re: Float64Array; im: Float64Array } {
  const size = input.length;
  const bits = Math.log2(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    re[bitReverse(i, bits)] = input[i]!;
  }
  for (let blockSize = 2; blockSize <= size; blockSize <<= 1) {
    const half = blockSize >> 1;
    const step = (-2 * Math.PI) / blockSize;
    for (let start = 0; start < size; start += blockSize) {
      for (let k = 0; k < half; k++) {
        const ei = start + k, oi = ei + half;
        const angle = step * k;
        const tRe = Math.cos(angle), tIm = Math.sin(angle);
        const oRe = re[oi]!, oIm = im[oi]!;
        const tmpRe = tRe * oRe - tIm * oIm;
        const tmpIm = tRe * oIm + tIm * oRe;
        re[oi] = re[ei]! - tmpRe; im[oi] = im[ei]! - tmpIm;
        re[ei] = re[ei]! + tmpRe; im[ei] = im[ei]! + tmpIm;
      }
    }
  }
  return { re, im };
}

function computePsdWithSize(samples: number[], fftSize: number, windowFn: Float64Array): Float64Array {
  const padded = new Float64Array(fftSize);
  const offset = Math.max(0, fftSize - samples.length);
  const readStart = Math.max(0, samples.length - fftSize);
  for (let i = 0; i < fftSize - offset; i++) {
    padded[i + offset] = (samples[readStart + i] ?? 0) * (windowFn[i + offset] ?? 1);
  }
  const { re, im } = fftReal(padded);
  const limit = fftSize / 2;
  const psd = new Float64Array(limit + 1);
  for (let bin = 0; bin <= limit; bin++) {
    psd[bin] = (re[bin]! * re[bin]! + im[bin]! * im[bin]!) / fftSize;
  }
  return psd;
}

// ── Per-panel histogram draw ──

function drawPanelHistogram(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spectrum: Float64Array,
  maxFreq: number,
  minDb: number,
  maxDb: number,
  chColor: string,
  chLabel: string,
) {
  ctx.fillStyle = 'rgba(18,14,24,0.97)';
  ctx.fillRect(0, 0, width, height);

  const PAD_LEFT = 6, PAD_RIGHT = 6, PAD_TOP = 20, PAD_BOTTOM = 18;
  const cw = width - PAD_LEFT - PAD_RIGHT;
  const ch = height - PAD_TOP - PAD_BOTTOM;

  const MIN_DB = minDb, MAX_DB = maxDb, DB_RANGE = MAX_DB - MIN_DB;

  const freqToX = (hz: number) => PAD_LEFT + (Math.min(hz, maxFreq) / maxFreq) * cw;
  const dbToY = (db: number) => PAD_TOP + ch - ((Math.max(MIN_DB, Math.min(MAX_DB, db)) - MIN_DB) / DB_RANGE) * ch;
  const frequencyToBin = (hz: number) =>
    Math.max(0, Math.min(FFT_SIZE / 2, Math.round((hz / SAMPLE_RATE_HZ) * FFT_SIZE)));

  const EEG_BANDS = [
    { name: 'δ', startHz: 0.5, endHz: 4,  tint: 'rgba(100,80,180,0.10)' },
    { name: 'θ', startHz: 4,   endHz: 8,  tint: 'rgba(155,95,200,0.09)' },
    { name: 'α', startHz: 8,   endHz: 13, tint: 'rgba(80,175,120,0.09)' },
    { name: 'β', startHz: 13,  endHz: 30, tint: 'rgba(200,160,60,0.08)' },
    { name: 'γ', startHz: 30,  endHz: 60, tint: 'rgba(200,80,100,0.08)' },
  ];
  for (const band of EEG_BANDS) {
    if (band.startHz >= maxFreq) continue;
    const x0 = freqToX(band.startHz);
    const x1 = freqToX(Math.min(band.endHz, maxFreq));
    ctx.fillStyle = band.tint;
    ctx.fillRect(x0, PAD_TOP, Math.max(1, x1 - x0), ch);
    ctx.fillStyle = 'rgba(180,165,200,0.55)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(band.name, x0 + (x1 - x0) / 2, PAD_TOP - 3);
  }

  const startBin = frequencyToBin(0);
  const endBin = frequencyToBin(maxFreq);
  const totalBins = endBin - startBin;
  if (totalBins > 0) {
    const groupSize = Math.max(1, Math.ceil(totalBins / 80));
    let groupStart = startBin;
    while (groupStart < endBin) {
      const groupEnd = Math.min(groupStart + groupSize, endBin);
      let maxPower = 0;
      for (let bin = groupStart; bin < groupEnd; bin++) {
        if (spectrum[bin] !== undefined) maxPower = Math.max(maxPower, spectrum[bin]!);
      }
      const db = 10 * Math.log10(Math.max(maxPower, 1e-10));
      const startHz = (groupStart * SAMPLE_RATE_HZ) / FFT_SIZE;
      const endHz = (groupEnd * SAMPLE_RATE_HZ) / FFT_SIZE;
      const x0 = freqToX(startHz);
      const x1 = freqToX(endHz);
      const barW = Math.max(1, x1 - x0 - 1);
      const barH = Math.max(0, dbToY(MIN_DB) - dbToY(db));
      const barY = dbToY(db);
      ctx.fillStyle = chColor;
      ctx.fillRect(x0, barY, barW, barH);
      groupStart = groupEnd;
    }
  }

  ctx.fillStyle = 'rgba(140,120,165,0.7)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const hzStep = maxFreq <= 30 ? 5 : maxFreq <= 60 ? 10 : 20;
  for (let hz = 0; hz <= maxFreq; hz += hzStep) {
    const x = freqToX(hz);
    ctx.fillText(`${hz}`, x, height - 3);
  }

  ctx.fillStyle = chColor;
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(chLabel, PAD_LEFT + 2, PAD_TOP - 4);
}

// ── Component ──

export const FftView = ({
  packets,
  filterParams,
  filterBiquadRef,
  lang,
}: FftViewProps) => {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>(Array(CHANNEL_COUNT).fill(null));
  const packetQueueRef = useRef<EegPacket[]>([]);
  const channelBuffersRef = useRef<number[][]>(Array.from({ length: CHANNEL_COUNT }, () => []));

  const [maxFreq, setMaxFreq] = useState<MaxFreq>(60);
  const maxFreqRef = useRef<MaxFreq>(60);

  const [minDb, setMinDb] = useState(-60);
  const [maxDb, setMaxDb] = useState(40);
  const minDbRef = useRef(-60);
  const maxDbRef = useRef(40);
  const [minDbInput, setMinDbInput] = useState('-60');
  const [maxDbInput, setMaxDbInput] = useState('40');

  const filterParamsRef = useRef(filterParams);
  useEffect(() => { filterParamsRef.current = filterParams; }, [filterParams]);

  const windowFnRef = useRef<Float64Array>(new Float64Array(0));

  // 3rd-order: 1st-order section cascaded with 2nd-order Q=1.0 Butterworth
  const filterCoeffs = useMemo(() => ({
    hp: [
      compute1stOrderHP(filterParams.hpFreq, SAMPLE_RATE_HZ),
      computeButterHP(filterParams.hpFreq, SAMPLE_RATE_HZ, 1.0),
    ],
    lp: [
      compute1stOrderLP(filterParams.lpFreq, SAMPLE_RATE_HZ),
      computeButterLP(filterParams.lpFreq, SAMPLE_RATE_HZ, 1.0),
    ],
    notch: computeCombNotch(SAMPLE_RATE_HZ),
  }), [filterParams.hpFreq, filterParams.lpFreq]);

  const filterCoeffsRef = useRef(filterCoeffs);
  useEffect(() => { filterCoeffsRef.current = filterCoeffs; }, [filterCoeffs]);

  useEffect(() => {
    if (!packets || packets.length === 0) return;
    packetQueueRef.current.push(...packets);
    if (packetQueueRef.current.length > 8192)
      packetQueueRef.current.splice(0, packetQueueRef.current.length - 8192);
  }, [packets]);

  // Initialize windowFn on mount (fixed FFT_SIZE = 1024)
  useEffect(() => {
    windowFnRef.current = Float64Array.from({ length: FFT_SIZE }, (_, i) =>
      0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1))),
    );
  }, []);

  // Render loop
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    const render = () => {
      const queue = packetQueueRef.current.splice(0, packetQueueRef.current.length);
      const fp = filterParamsRef.current;
      const biquad = filterBiquadRef.current;
      const { hp, lp, notch } = filterCoeffsRef.current;
      const windowFn = windowFnRef.current;
      const dbRange = { minDb: minDbRef.current, maxDb: maxDbRef.current };

      for (const packet of queue) {
        const channels = packet.eegChannels;
        if (!channels || channels.length < CHANNEL_COUNT) continue;
        for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
          let sample = channels[ch] ?? 0;
          sample = applyFilterChain(sample, ch, biquad, fp, hp, lp, notch);
          const buf = channelBuffersRef.current[ch]!;
          buf.push(sample);
          if (buf.length > FFT_SIZE * 2) buf.splice(0, buf.length - FFT_SIZE * 2);
        }
      }

      for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
        const canvas = canvasRefs.current[ch];
        if (!canvas) continue;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        const buf = channelBuffersRef.current[ch]!;
        const psd = computePsdWithSize(buf, FFT_SIZE, windowFn);

        drawPanelHistogram(
          ctx,
          canvas.clientWidth,
          canvas.clientHeight,
          psd,
          maxFreqRef.current,
          dbRange.minDb,
          dbRange.maxDb,
          CHANNEL_COLORS[ch] ?? 'rgba(255,255,255,0.8)',
          CHANNEL_LABELS[ch]!,
        );
      }
    };

    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const canvas = canvasRefs.current[ch];
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      cleanups.push(() => ro.disconnect());
    }

    render();
    const id = window.setInterval(render, 250);
    return () => {
      window.clearInterval(id);
      cleanups.forEach(fn => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBiquadRef]);

  const hasData = packets && packets.length > 0;

  const btnStyle = (active: boolean): CSSProperties => ({
    background: active ? 'rgba(120,80,160,0.3)' : 'transparent',
    border: `1px solid ${active ? 'rgba(150,105,200,0.55)' : 'rgba(94,88,112,0.4)'}`,
    borderRadius: 5,
    color: active ? '#ccc4d4' : 'rgba(152,136,168,0.5)',
    fontSize: 11,
    padding: '3px 9px',
    cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'rgba(18,14,22,0.9)',
        border: '1px solid rgba(94,88,112,0.35)',
        borderRadius: 10,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Y-axis dB range — manual inputs */}
          <span style={{ fontSize: 12, color: 'rgba(152,136,168,0.7)' }}>Y (dB):</span>
          <input
            type="number"
            value={minDbInput}
            onChange={e => setMinDbInput(e.target.value)}
            onBlur={() => {
              const v = parseInt(minDbInput);
              if (!isNaN(v) && v < maxDb) { minDbRef.current = v; setMinDb(v); }
              else setMinDbInput(String(minDb));
            }}
            style={{ width: 52, background: 'rgba(22,18,28,0.9)', border: '1px solid rgba(94,88,112,0.5)', borderRadius: 4, color: '#ccc4d4', fontSize: 11, padding: '3px 5px', outline: 'none', textAlign: 'right', fontFamily: 'ui-monospace,monospace' }}
          />
          <span style={{ fontSize: 11, color: 'rgba(152,136,168,0.5)' }}>~</span>
          <input
            type="number"
            value={maxDbInput}
            onChange={e => setMaxDbInput(e.target.value)}
            onBlur={() => {
              const v = parseInt(maxDbInput);
              if (!isNaN(v) && v > minDb) { maxDbRef.current = v; setMaxDb(v); }
              else setMaxDbInput(String(maxDb));
            }}
            style={{ width: 52, background: 'rgba(22,18,28,0.9)', border: '1px solid rgba(94,88,112,0.5)', borderRadius: 4, color: '#ccc4d4', fontSize: 11, padding: '3px 5px', outline: 'none', textAlign: 'right', fontFamily: 'ui-monospace,monospace' }}
          />
          <span style={{ fontSize: 11, color: 'rgba(152,136,168,0.5)' }}>dB</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Max freq */}
          <span style={{ fontSize: 12, color: 'rgba(152,136,168,0.7)' }}>{T(lang, 'fftMaxFreq')}:</span>
          {MAX_FREQ_OPTIONS.map(f => (
            <button key={f} onClick={() => { maxFreqRef.current = f; setMaxFreq(f); }} style={btnStyle(maxFreq === f)}>
              {f} Hz
            </button>
          ))}
        </div>
      </div>

      {/* 8 panel grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, minHeight: 0 }}>
        {Array.from({ length: CHANNEL_COUNT }, (_, ch) => (
          <div key={ch} style={{
            position: 'relative',
            border: '1px solid rgba(94,88,112,0.3)',
            borderRadius: 8,
            overflow: 'hidden',
            minHeight: 120,
          }}>
            {!hasData && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(18,14,22,0.7)',
                zIndex: 10,
              }}>
                <span style={{ fontSize: 12, color: 'rgba(120,105,140,0.5)' }}>
                  {CHANNEL_LABELS[ch]}
                </span>
              </div>
            )}
            <canvas
              ref={el => { canvasRefs.current[ch] = el; }}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
