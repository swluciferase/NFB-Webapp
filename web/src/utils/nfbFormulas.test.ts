import { describe, it, expect } from 'vitest';
import {
  K_VALUES,
  W_VALUES,
  computeTA,
  computeOO,
  computeTickBool,
} from './nfbFormulas';

describe('K_VALUES / W_VALUES constants', () => {
  it('matches the documented TrainingView values', () => {
    expect(K_VALUES).toEqual([16.67, 14.29, 12.70, 11.55, 10.66]);
    expect(W_VALUES).toEqual([5, 8, 12, 17, 23]);
  });
});

describe('computeTA', () => {
  it('returns 0 for empty window', () => {
    expect(computeTA([])).toBe(0);
  });
  it('returns 100 when every tick is true', () => {
    expect(computeTA([true, true, true, true])).toBe(100);
  });
  it('returns 0 when every tick is false', () => {
    expect(computeTA([false, false, false])).toBe(0);
  });
  it('returns 50 for a half-met window', () => {
    expect(computeTA([true, false, true, false])).toBe(50);
  });
  it('normalises by the actual window length (pre-warmup)', () => {
    expect(computeTA([true, true])).toBe(100);
  });
});

describe('computeOO', () => {
  it('returns 0 when TA is 0', () => {
    expect(computeOO(0, 3)).toBe(0);
  });
  it('caps at 100', () => {
    expect(computeOO(100, 1)).toBe(100);
  });
  it('matches K[diff] * sqrt(TA) for diff=3, TA=50', () => {
    // K[2] = 12.70, sqrt(50) ≈ 7.0710678
    expect(computeOO(50, 3)).toBeCloseTo(12.70 * Math.sqrt(50), 5);
  });
  it('rejects invalid difficulty levels', () => {
    expect(() => computeOO(50, 0 as unknown as 1)).toThrow();
    expect(() => computeOO(50, 6 as unknown as 1)).toThrow();
  });
});

describe('computeTickBool', () => {
  it('returns false when no indicators are provided', () => {
    expect(computeTickBool([], {})).toBe(false);
  });
  it('returns true only if every indicator meets its condition (AND semantics)', () => {
    const result = computeTickBool(
      [
        { id: 'a', direction: 'up', threshold: 10, metricKey: 'Fz_Beta' },
        { id: 'b', direction: 'down', threshold: 5, metricKey: 'Fz_Theta' },
      ],
      { Fz_Beta: 15, Fz_Theta: 3 },
    );
    expect(result).toBe(true);
  });
  it('returns false when any indicator fails (direction up)', () => {
    const result = computeTickBool(
      [{ id: 'a', direction: 'up', threshold: 10, metricKey: 'Fz_Beta' }],
      { Fz_Beta: 9 },
    );
    expect(result).toBe(false);
  });
  it('returns false when the metric value is missing', () => {
    const result = computeTickBool(
      [{ id: 'a', direction: 'up', threshold: 10, metricKey: 'Fz_Beta' }],
      {},
    );
    expect(result).toBe(false);
  });
});
