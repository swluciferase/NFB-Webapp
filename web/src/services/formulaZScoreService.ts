/**
 * formulaZScoreService.ts — Composite-formula Z-score for FormulaCard (EEG #5).
 *
 * Whitelist (only these three patterns yield a valid Z):
 *   1. A / B               → Z = (log10A − log10B − Δμ_log) / √(σ²_logA + σ²_logB)
 *   2. log(A / B)          → identical to (1)
 *   3. (A − B) / (A + B)   → asymmetry index, delta-method on log-normal
 *                            back-transformed raw stats.
 *
 * (μ_log, σ_log) are extracted from the WASM NormEngine via a probe trick
 * that avoids any rebuild: zscore_qeeg() with band_power=zeros and =ones
 * (in log10 µV² space) gives two Z values per (channel × band) from which
 * (μ_log, σ_log) can be solved exactly.
 *
 *     Z₀ = (0 − μ) / σ           ⇒ σ = 1/(Z₁ − Z₀),  μ = −Z₀·σ
 *     Z₁ = (1 − μ) / σ
 *
 * Saturation guard: NormEngine clamps Z to ±10. If either probe returns
 * ±10 we mark that (channel × band) entry null and computeFormulaZ() will
 * return null for any pattern that depends on it.
 */

import { normEngineService } from './normEngineService';
import { CHBMP_LABELS, labelToChbmpIdx, type BandDef } from './qeegZScoreService';

const N_CHBMP = CHBMP_LABELS.length; // 19
const SAT_EPSILON = 1e-3;            // |Z| > 10 - SAT_EPSILON ⇒ saturated probe
const LN10 = Math.LN10;

export interface BandStat {
  /** Mean of log10(µV²) for this (channel × band × age). */
  muLog: number;
  /** Std of log10(µV²) for this (channel × band × age). */
  sigmaLog: number;
}

export interface MuSigmaTable {
  age: number;
  dbKey: string;
  bands: BandDef[];
  /** stats[chbmpIdx][bandIdx] — null if probe saturated or singular. */
  stats: (BandStat | null)[][];
}

let cachedTable: MuSigmaTable | null = null;

function bandsEqual(a: readonly BandDef[], b: readonly BandDef[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.lo !== b[i]!.lo || a[i]!.hi !== b[i]!.hi) return false;
  }
  return true;
}

/**
 * Build (or reuse) the (μ_log, σ_log) lookup table for the given age + dbKey.
 * Returns null if the engine is not ready.
 */
export function ensureMuSigmaTable(
  age: number,
  dbKey: string,
  bands: BandDef[],
): MuSigmaTable | null {
  if (!normEngineService.isReady()) return null;
  if (
    cachedTable
    && cachedTable.age === age
    && cachedTable.dbKey === dbKey
    && bandsEqual(cachedTable.bands, bands)
  ) {
    return cachedTable;
  }

  const engine = normEngineService.getEngine();
  if (!engine) return null;
  const nBands = bands.length;

  const customBands = new Float32Array(nBands * 2);
  for (let b = 0; b < nBands; b++) {
    customBands[b * 2]     = bands[b]!.lo;
    customBands[b * 2 + 1] = bands[b]!.hi;
  }
  const cohEmpty  = new Float32Array(0);
  const asymEmpty = new Float32Array(0);

  // Probe inputs: log10(µV²) = 0 (raw=1) and = 1 (raw=10)
  const zeros = new Float32Array(N_CHBMP * nBands).fill(0);
  const ones  = new Float32Array(N_CHBMP * nBands).fill(1);

  let z0: Float32Array;
  let z1: Float32Array;
  try {
    const r0 = engine.zscore_qeeg(zeros, cohEmpty, asymEmpty, customBands, age);
    const r1 = engine.zscore_qeeg(ones,  cohEmpty, asymEmpty, customBands, age);
    z0 = r0.slice(0, N_CHBMP * nBands);
    z1 = r1.slice(0, N_CHBMP * nBands);
  } catch (err) {
    console.error('[FormulaZScoreService] probe failed:', err);
    return null;
  }

  const stats: (BandStat | null)[][] = [];
  for (let ci = 0; ci < N_CHBMP; ci++) {
    const row: (BandStat | null)[] = [];
    for (let b = 0; b < nBands; b++) {
      const idx = ci * nBands + b;
      const Z0 = z0[idx]!;
      const Z1 = z1[idx]!;
      const sat = (z: number) => Math.abs(Math.abs(z) - 10) < SAT_EPSILON;
      if (!isFinite(Z0) || !isFinite(Z1) || sat(Z0) || sat(Z1)) {
        row.push(null);
        continue;
      }
      const dz = Z1 - Z0;
      if (Math.abs(dz) < 1e-9) { row.push(null); continue; }
      const sigmaLog = 1 / dz;
      const muLog = -Z0 * sigmaLog;
      if (!isFinite(sigmaLog) || !isFinite(muLog) || sigmaLog <= 0) {
        row.push(null);
      } else {
        row.push({ muLog, sigmaLog });
      }
    }
    stats.push(row);
  }

  cachedTable = { age, dbKey, bands: bands.slice(), stats };
  return cachedTable;
}

export function invalidateMuSigmaTable(): void {
  cachedTable = null;
}

export function getBandStat(
  table: MuSigmaTable | null,
  channelLabel: string,
  bandIdx: number,
): BandStat | null {
  if (!table) return null;
  const ci = labelToChbmpIdx(channelLabel);
  if (ci < 0) return null;
  const row = table.stats[ci];
  if (!row) return null;
  return row[bandIdx] ?? null;
}

// ── Whitelist parser ───────────────────────────────────────────────────────

export type FormulaPattern =
  | { kind: 'ratio';     a: TermRef; b: TermRef }
  | { kind: 'logRatio';  a: TermRef; b: TermRef }
  | { kind: 'asymmetry'; a: TermRef; b: TermRef };

export interface TermRef {
  channel: string;
  band: string;     // canonical: 'Delta' | 'Theta' | 'Alpha' | 'SMR' | 'Beta' | 'Hi-Beta' | 'Gamma'
  raw: string;      // original token e.g. 'Fp1_Alpha'
}

const TOKEN = `[A-Za-z][A-Za-z0-9]*_[A-Za-z][A-Za-z0-9]*`;
const RE_LOG_RATIO = new RegExp(`^log\\((${TOKEN})\\/(${TOKEN})\\)$`);
const RE_ASYM      = new RegExp(`^\\((${TOKEN})\\-(${TOKEN})\\)\\/\\((${TOKEN})\\+(${TOKEN})\\)$`);
const RE_RATIO     = new RegExp(`^(${TOKEN})\\/(${TOKEN})$`);
const RE_TERM      = /^([A-Za-z][A-Za-z0-9]*)_([A-Za-z][A-Za-z0-9]*)$/;

function parseTerm(token: string): TermRef | null {
  const m = token.match(RE_TERM);
  if (!m) return null;
  const [, channel, bandRaw] = m;
  // Token spelling 'HiBeta' maps to canonical 'Hi-Beta'; everything else passes through.
  const band = bandRaw === 'HiBeta' ? 'Hi-Beta' : bandRaw!;
  return { channel: channel!, band, raw: token };
}

/** Parse formula and return the matched whitelist pattern, or null if not whitelisted. */
export function parseFormulaForZ(formula: string): FormulaPattern | null {
  const f = formula.replace(/\s+/g, '');
  if (!f) return null;

  const mLog = f.match(RE_LOG_RATIO);
  if (mLog) {
    const a = parseTerm(mLog[1]!);
    const b = parseTerm(mLog[2]!);
    return a && b ? { kind: 'logRatio', a, b } : null;
  }

  const mAsym = f.match(RE_ASYM);
  if (mAsym) {
    const [, t1, t2, t3, t4] = mAsym;
    if (t1 === t3 && t2 === t4) {
      const a = parseTerm(t1!);
      const b = parseTerm(t2!);
      if (a && b) return { kind: 'asymmetry', a, b };
    }
    return null;
  }

  const mRatio = f.match(RE_RATIO);
  if (mRatio) {
    const a = parseTerm(mRatio[1]!);
    const b = parseTerm(mRatio[2]!);
    return a && b ? { kind: 'ratio', a, b } : null;
  }

  return null;
}

// ── Z computation ─────────────────────────────────────────────────────────

export interface FormulaZContext {
  table: MuSigmaTable;
  /** Map a band name (canonical) to its column index in the band-power matrix. */
  bandIndexByName: (band: string) => number;
  /** Look up the live raw µV² value for a term (returns 0 if missing). */
  rawPowerByTerm: (term: TermRef) => number;
}

const clamp10 = (z: number) => Math.max(-10, Math.min(10, z));

export function computeFormulaZ(
  pattern: FormulaPattern,
  ctx: FormulaZContext,
): number | null {
  const { table, bandIndexByName, rawPowerByTerm } = ctx;

  const aBand = bandIndexByName(pattern.a.band);
  const bBand = bandIndexByName(pattern.b.band);
  if (aBand < 0 || bBand < 0) return null;

  const sA = getBandStat(table, pattern.a.channel, aBand);
  const sB = getBandStat(table, pattern.b.channel, bBand);
  if (!sA || !sB) return null;

  const rawA = rawPowerByTerm(pattern.a);
  const rawB = rawPowerByTerm(pattern.b);
  if (!(rawA > 0) || !(rawB > 0)) return null;

  if (pattern.kind === 'ratio' || pattern.kind === 'logRatio') {
    // Sample log10 ratio
    const sample = Math.log10(rawA) - Math.log10(rawB);
    const muDiff = sA.muLog - sB.muLog;
    const varDiff = sA.sigmaLog ** 2 + sB.sigmaLog ** 2;
    if (!(varDiff > 0)) return null;
    return clamp10((sample - muDiff) / Math.sqrt(varDiff));
  }

  // asymmetry: (A-B)/(A+B) — back-transform log-normal stats to raw, then delta method
  const sigA2 = (sA.sigmaLog * LN10) ** 2;
  const sigB2 = (sB.sigmaLog * LN10) ** 2;
  const meanA = Math.exp(sA.muLog * LN10 + 0.5 * sigA2);
  const meanB = Math.exp(sB.muLog * LN10 + 0.5 * sigB2);
  const varA  = meanA * meanA * (Math.exp(sigA2) - 1);
  const varB  = meanB * meanB * (Math.exp(sigB2) - 1);
  const sumMu = meanA + meanB;
  if (!(sumMu > 0) || !isFinite(meanA) || !isFinite(meanB)) return null;

  const muAi = (meanA - meanB) / sumMu;
  const denom4 = sumMu ** 4;
  const varAi = (4 * meanB * meanB * varA + 4 * meanA * meanA * varB) / denom4;
  const sigmaAi = Math.sqrt(Math.max(varAi, 0));
  if (!(sigmaAi > 0)) return null;

  const sample = (rawA - rawB) / (rawA + rawB);
  return clamp10((sample - muAi) / sigmaAi);
}
