/**
 * useBandPower — computes EEG band power from raw packets.
 *
 * Returns bandPower[channelIdx][bandIdx] in µV²  (or null when no data yet).
 * Uses its own independent biquad filter state so it does not interfere with
 * WaveformView / FftView filter states.
 *
 * Channel order matches CHANNEL_LABELS: Fp1 Fp2 T7 T8 O1 O2 Fz Pz
 * Band order matches NFB_BANDS below.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EegPacket, FilterParams, FilterBiquadState } from '../types/eeg';
import { CHANNEL_COUNT, SAMPLE_RATE_HZ, makeFilterBiquadState } from '../types/eeg';

// ── Band definitions ───────────────────────────────────────────────────────
export const NFB_BANDS = [
  { name: 'Delta',   startHz: 0.5, endHz: 4   },
  { name: 'Theta',   startHz: 4,   endHz: 8   },
  { name: 'Alpha',   startHz: 8,   endHz: 13  },
  { name: 'SMR',     startHz: 12,  endHz: 15  },
  { name: 'Beta',    startHz: 13,  endHz: 30  },
  { name: 'Hi-Beta', startHz: 20,  endHz: 30  },
  { name: 'Gamma',   startHz: 30,  endHz: 45  },
] as const;

export type NfbBandName = typeof NFB_BANDS[number]['name'];

/** bandPower[channelIdx][bandIdx] in µV² */
export type BandPowerMatrix = number[][];

// ── Filter helpers (self-contained copy from FftView) ─────────────────────

const BW_Q = [1.3066, 0.5412] as const;
const NOTCH_Q = 30;
const FFT_SIZE = 1024;

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

// Comb notch: fundamental (f0) + 2nd harmonic (f0×2) + fundamental again
// Stage layout: ch*6+0/1 = f0, ch*6+2/3 = f0×2, ch*6+4/5 = f0 (extra depth)
// Matches notchState slot layout in FilterBiquadState (3 stages × 2 states × 8 ch = 48)
function computeNotchStages(f0: number, fs: number) {
  const makeCoeff = (freq: number) => {
    const w0    = 2 * Math.PI * freq / fs;
    const alpha = Math.sin(w0) / (2 * NOTCH_Q);
    const cosW  = Math.cos(w0);
    const a0    = 1 + alpha;
    return { b0: 1/a0, b1: -2*cosW/a0, b2: 1/a0, a1: -2*cosW/a0, a2: (1-alpha)/a0 };
  };
  const fundamental = makeCoeff(f0);
  const harmonic2   = makeCoeff(f0 * 2);
  return [fundamental, harmonic2, fundamental] as const;
}

function applyBiquad(
  x: number, stateArr: Float64Array, base: number,
  b0: number, b1: number, b2: number, a1: number, a2: number,
): number {
  const y = b0 * x + stateArr[base]!;
  stateArr[base]     = b1 * x - a1 * y + stateArr[base + 1]!;
  stateArr[base + 1] = b2 * x - a2 * y;
  return y;
}

function applyFilterChain(
  x: number, ch: number, biquad: FilterBiquadState, params: FilterParams,
  hp: ReturnType<typeof computeButterHP>[],
  lp: ReturnType<typeof computeButterLP>[],
  notch: ReturnType<typeof computeNotchStages>,
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
    s = applyBiquad(s, biquad.hpState1, ch*2, hp[0]!.b0, hp[0]!.b1, hp[0]!.b2, hp[0]!.a1, hp[0]!.a2);
    s = applyBiquad(s, biquad.hpState2, ch*2, hp[1]!.b0, hp[1]!.b1, hp[1]!.b2, hp[1]!.a1, hp[1]!.a2);
    s = applyBiquad(s, biquad.lpState1, ch*2, lp[0]!.b0, lp[0]!.b1, lp[0]!.b2, lp[0]!.a1, lp[0]!.a2);
    s = applyBiquad(s, biquad.lpState2, ch*2, lp[1]!.b0, lp[1]!.b1, lp[1]!.b2, lp[1]!.a1, lp[1]!.a2);
  }
  if (params.notchFreq !== 0) {
    for (let stage = 0; stage < 3; stage++) {
      const base = ch * 6 + stage * 2;
      const c = notch[stage]!;
      s = applyBiquad(s, biquad.notchState, base, c.b0, c.b1, c.b2, c.a1, c.a2);
    }
  }
  return s;
}

// ── FFT ───────────────────────────────────────────────────────────────────

function bitReverse(v: number, bits: number): number {
  let r = 0;
  for (let b = 0; b < bits; b++) { r = (r << 1) | (v & 1); v >>= 1; }
  return r;
}

function fftReal(input: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = input.length;
  const bits = Math.log2(n);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[bitReverse(i, bits)] = input[i]!;
  for (let bs = 2; bs <= n; bs <<= 1) {
    const half = bs >> 1;
    const step = (-2 * Math.PI) / bs;
    for (let start = 0; start < n; start += bs) {
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

function computePsd(samples: number[], windowFn: Float64Array): Float64Array {
  const padded = new Float64Array(FFT_SIZE);
  const offset = Math.max(0, FFT_SIZE - samples.length);
  const readStart = Math.max(0, samples.length - FFT_SIZE);
  for (let i = 0; i < FFT_SIZE - offset; i++) {
    padded[i + offset] = (samples[readStart + i] ?? 0) * (windowFn[i + offset] ?? 1);
  }
  const { re, im } = fftReal(padded);
  const psd = new Float64Array(FFT_SIZE / 2 + 1);
  for (let bin = 0; bin <= FFT_SIZE / 2; bin++) {
    psd[bin] = (re[bin]! * re[bin]! + im[bin]! * im[bin]!) / FFT_SIZE;
  }
  return psd;
}

/** Integrate PSD over a frequency range, return µV² */
function bandPowerFromPsd(psd: Float64Array, startHz: number, endHz: number): number {
  const startBin = Math.max(0, Math.round((startHz / SAMPLE_RATE_HZ) * FFT_SIZE));
  const endBin   = Math.min(FFT_SIZE / 2, Math.round((endHz  / SAMPLE_RATE_HZ) * FFT_SIZE));
  let power = 0;
  for (let bin = startBin; bin <= endBin; bin++) power += psd[bin] ?? 0;
  return power * (SAMPLE_RATE_HZ / FFT_SIZE); // scale by frequency resolution
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useBandPower(
  packets: EegPacket[] | undefined,
  filterParams: FilterParams,
): BandPowerMatrix | null {
  // Own independent filter state — never share with WaveformView/FftView
  const biquadRef = useRef<FilterBiquadState>(makeFilterBiquadState());
  const channelBuffersRef = useRef<number[][]>(
    Array.from({ length: CHANNEL_COUNT }, () => []),
  );
  const packetQueueRef = useRef<EegPacket[]>([]);
  const windowFnRef = useRef<Float64Array>(new Float64Array(0));
  const hasDataRef = useRef(false);

  const [bandPower, setBandPower] = useState<BandPowerMatrix | null>(null);

  const filterCoeffs = useMemo(() => ({
    hp:    BW_Q.map(q => computeButterHP(filterParams.hpFreq, SAMPLE_RATE_HZ, q)),
    lp:    BW_Q.map(q => computeButterLP(filterParams.lpFreq, SAMPLE_RATE_HZ, q)),
    notch: filterParams.notchFreq !== 0
      ? computeNotchStages(filterParams.notchFreq, SAMPLE_RATE_HZ)
      : computeNotchStages(50, SAMPLE_RATE_HZ),
  }), [filterParams.hpFreq, filterParams.lpFreq, filterParams.notchFreq]);
  const filterCoeffsRef = useRef(filterCoeffs);
  useEffect(() => { filterCoeffsRef.current = filterCoeffs; }, [filterCoeffs]);

  // Hann window
  useEffect(() => {
    windowFnRef.current = Float64Array.from({ length: FFT_SIZE }, (_, i) =>
      0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1))),
    );
  }, []);

  // Enqueue new packets
  useEffect(() => {
    if (!packets || packets.length === 0) return;
    packetQueueRef.current.push(...packets);
    if (packetQueueRef.current.length > FFT_SIZE * 4)
      packetQueueRef.current.splice(0, packetQueueRef.current.length - FFT_SIZE * 4);
  }, [packets]);

  // Compute loop — 250 ms interval (matches FftView)
  useEffect(() => {
    const id = window.setInterval(() => {
      const queue = packetQueueRef.current.splice(0);
      if (queue.length === 0) return;

      const { hp, lp, notch } = filterCoeffsRef.current;

      for (const pkt of queue) {
        const ch8 = pkt.eegChannels;
        if (!ch8 || ch8.length < CHANNEL_COUNT) continue;
        hasDataRef.current = true;
        for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
          const s = applyFilterChain(ch8[ch] ?? 0, ch, biquadRef.current, filterParams, hp, lp, notch);
          const buf = channelBuffersRef.current[ch]!;
          buf.push(s);
          if (buf.length > FFT_SIZE * 2) buf.splice(0, buf.length - FFT_SIZE * 2);
        }
      }

      if (!hasDataRef.current) return;

      const win = windowFnRef.current;
      const matrix: BandPowerMatrix = [];
      for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
        const buf = channelBuffersRef.current[ch]!;
        if (buf.length < 64) {
          matrix.push(NFB_BANDS.map(() => 0));
          continue;
        }
        const psd = computePsd(buf, win);
        matrix.push(NFB_BANDS.map(b => bandPowerFromPsd(psd, b.startHz, b.endHz)));
      }
      setBandPower(matrix);
    }, 250);
    return () => window.clearInterval(id);
    // filterParams intentionally excluded — coeffs updated via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return bandPower;
}
