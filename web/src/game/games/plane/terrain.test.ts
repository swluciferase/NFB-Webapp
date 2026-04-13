import { describe, it, expect } from 'vitest';
import { generateValley, samplePoint } from './terrain';

describe('generateValley', () => {
  it('is deterministic for the same seed', () => {
    const a = generateValley({ seed: 42, lengthPx: 4000, sampleEveryPx: 20 });
    const b = generateValley({ seed: 42, lengthPx: 4000, sampleEveryPx: 20 });
    expect(a).toEqual(b);
  });

  it('produces different output for different seeds', () => {
    const a = generateValley({ seed: 1, lengthPx: 4000, sampleEveryPx: 20 });
    const b = generateValley({ seed: 2, lengthPx: 4000, sampleEveryPx: 20 });
    expect(a).not.toEqual(b);
  });

  it('has the correct sample count', () => {
    const v = generateValley({ seed: 1, lengthPx: 4000, sampleEveryPx: 20 });
    expect(v.samples.length).toBe(4000 / 20 + 1);
  });

  it('stays within height bounds', () => {
    const v = generateValley({ seed: 1, lengthPx: 4000, sampleEveryPx: 20 });
    for (const s of v.samples) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('samplePoint', () => {
  it('interpolates between samples', () => {
    const v = generateValley({ seed: 1, lengthPx: 1000, sampleEveryPx: 100 });
    const mid = samplePoint(v, 50);
    const expected = (v.samples[0]! + v.samples[1]!) / 2;
    expect(mid).toBeCloseTo(expected, 5);
  });
  it('clamps to 0 below the start', () => {
    const v = generateValley({ seed: 1, lengthPx: 1000, sampleEveryPx: 100 });
    expect(samplePoint(v, -100)).toBe(v.samples[0]);
  });
  it('clamps to the last sample beyond the end', () => {
    const v = generateValley({ seed: 1, lengthPx: 1000, sampleEveryPx: 100 });
    expect(samplePoint(v, 99999)).toBe(v.samples[v.samples.length - 1]);
  });
});
