/**
 * qeegZScoreService.ts — Maps SoraMynd band-power data to CHBMP-indexed
 * Z-scores via the norm-engine WASM.
 *
 * Adaptation note:
 *   useBandPower returns BandPowerMatrix = number[][] indexed as
 *   [channelIdx][bandIdx] in µV² (NOT Float32Array, NOT row-major flat).
 *   This service accepts that native format directly and converts internally
 *   to the log10 Float32Array required by NormEngine.zscore_qeeg().
 *
 * SoraMynd channel labels (CHANNEL_LABELS from types/eeg):
 *   ['Fp1','Fp2','T7','T8','O1','O2','Fz','Pz']
 * Only channels that appear in CHBMP_LABELS will contribute to Z-scores.
 */

import { normEngineService } from './normEngineService';

export const CHBMP_LABELS = [
  'Fp1','Fp2','F7','F3','Fz','F4','F8',
  'T7','C3','Cz','C4','T8',
  'P7','P3','Pz','P4','P8','O1','O2',
] as const;

export type ChbmpLabel = typeof CHBMP_LABELS[number];

const N_CHBMP = CHBMP_LABELS.length; // 19

export interface BandDef {
  lo: number;
  hi: number;
}

export interface ZScoreResult {
  /**
   * Z-scores in CHBMP channel order, row-major [chbmpChannelIdx × nBands].
   * NaN for channels not present in the user's EEG configuration.
   * Length = N_CHBMP × nBands = 19 × nBands.
   */
  bandZ: Float32Array;
  /** Number of bands */
  nBands: number;
  /** Whether the result is valid (engine ready, age > 0, computation succeeded) */
  valid: boolean;
}

/**
 * Maps a channel label string to its CHBMP index (0–18).
 * Returns -1 for labels not in the CHBMP montage.
 */
export function labelToChbmpIdx(label: string): number {
  return CHBMP_LABELS.indexOf(label as ChbmpLabel);
}

/**
 * Compute per-channel per-band Z-scores using the norm-engine.
 *
 * Accepts band power in the native useBandPower format:
 *   bandPowerMatrix[channelIdx][bandIdx] — µV² (NOT log10, NOT per-Hz)
 *
 * Channel order must match `channelLabels` (same as CHANNEL_LABELS from types/eeg).
 * Band order must match `bands` (same as NFB_BANDS from useBandPower).
 *
 * @param channelLabels  EEG channel label strings (e.g. ['Fp1','Fp2','T7',...])
 * @param bandPowerMatrix  number[nChannels][nBands] µV² from useBandPower
 * @param bands  Band definitions [{lo, hi}] matching bandPowerMatrix columns
 * @param age  Subject age in years (must be > 0)
 * @returns ZScoreResult — bandZ is NaN for channels not in CHBMP
 */
export function computeQeegZScores(
  channelLabels: string[],
  bandPowerMatrix: number[][],
  bands: BandDef[],
  age: number,
): ZScoreResult {
  const nBands = bands.length;

  const empty = (): ZScoreResult => ({
    bandZ: new Float32Array(N_CHBMP * nBands).fill(NaN),
    nBands,
    valid: false,
  });

  if (age <= 0 || !normEngineService.isReady()) return empty();

  const engine = normEngineService.getEngine()!;

  // Build custom_bands: Float32Array [nBands × 2] — [lo, hi] Hz pairs
  const customBands = new Float32Array(nBands * 2);
  for (let b = 0; b < nBands; b++) {
    customBands[b * 2]     = bands[b].lo;
    customBands[b * 2 + 1] = bands[b].hi;
  }

  // Build band_power in CHBMP channel order: Float32Array [19 × nBands], log10 µV²
  // Channels not in CHBMP are skipped (their slots stay at 0 = log10(1 µV²)).
  // Channels present in CHBMP get log10-transformed µV² values.
  const logBandPower = new Float32Array(N_CHBMP * nBands).fill(0);
  const nChannels = channelLabels.length;

  for (let c = 0; c < nChannels; c++) {
    const ci = labelToChbmpIdx(channelLabels[c]!);
    if (ci < 0) continue; // channel not in CHBMP montage — skip

    const chPower = bandPowerMatrix[c];
    if (!chPower) continue;

    for (let b = 0; b < nBands; b++) {
      const rawPow = chPower[b] ?? 0;
      // log10 transform; floor at -6 (≈ 1 pV²/Hz) to avoid -Infinity
      logBandPower[ci * nBands + b] = rawPow > 0 ? Math.log10(rawPow) : -6;
    }
  }

  // Coherence and asymmetry: empty for now (future task will extend)
  const cohEmpty  = new Float32Array(0);
  const asymEmpty = new Float32Array(0);

  try {
    const result = engine.zscore_qeeg(
      logBandPower,
      cohEmpty,
      asymEmpty,
      customBands,
      age,
    );
    // result layout: [bandZ(19×nBands) | cohZ(0) | asymZ(0)]
    const bandZ = result.slice(0, N_CHBMP * nBands);

    // Mark channels NOT present in the user's EEG config as NaN
    const presentChbmpSet = new Set<number>();
    for (let c = 0; c < nChannels; c++) {
      const ci = labelToChbmpIdx(channelLabels[c]!);
      if (ci >= 0) presentChbmpSet.add(ci);
    }
    for (let ci = 0; ci < N_CHBMP; ci++) {
      if (!presentChbmpSet.has(ci)) {
        for (let b = 0; b < nBands; b++) {
          bandZ[ci * nBands + b] = NaN;
        }
      }
    }

    return { bandZ, nBands, valid: true };
  } catch (err) {
    console.error('[QeegZScoreService] zscore_qeeg failed:', err);
    return empty();
  }
}

/**
 * Get the Z-score for a specific channel label and band index.
 * Returns NaN if channel not in CHBMP, band index out of range, or result invalid.
 */
export function getChannelBandZ(
  result: ZScoreResult,
  channelLabel: string,
  bandIdx: number,
): number {
  if (!result.valid) return NaN;
  const ci = labelToChbmpIdx(channelLabel);
  if (ci < 0 || bandIdx < 0 || bandIdx >= result.nBands) return NaN;
  return result.bandZ[ci * result.nBands + bandIdx]!;
}
