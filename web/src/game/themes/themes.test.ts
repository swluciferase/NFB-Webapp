import { describe, it, expect } from 'vitest';
import { papercutTheme } from './papercut';
import { ghibliTheme } from './ghibli';
import { geometricTheme } from './geometric';
import type { Theme } from '../Game';

const ALL: Theme[] = [papercutTheme, ghibliTheme, geometricTheme];

describe('theme registry', () => {
  it('exposes all three themes with matching ids', () => {
    expect(papercutTheme.id).toBe('papercut');
    expect(ghibliTheme.id).toBe('ghibli');
    expect(geometricTheme.id).toBe('geometric');
  });

  it.each(ALL)('$id: declares zh + en names', (theme) => {
    expect(theme.name.zh.length).toBeGreaterThan(0);
    expect(theme.name.en.length).toBeGreaterThan(0);
  });

  it.each(ALL)('$id: defines visual config with non-empty parallax', (theme) => {
    expect(theme.visual).toBeDefined();
    expect(theme.visual.parallax.length).toBeGreaterThanOrEqual(2);
    expect(theme.visual.bgTop).toMatch(/^#/);
    expect(theme.visual.bgBottom).toMatch(/^#/);
  });

  it.each(ALL)('$id: parallax layers have valid scroll factors', (theme) => {
    for (const layer of theme.visual.parallax) {
      expect(layer.scrollFactor).toBeGreaterThan(0);
      expect(layer.scrollFactor).toBeLessThanOrEqual(1);
      expect(layer.amplitude).toBeGreaterThan(0);
      expect(layer.baselineY).toBeGreaterThan(0);
      expect(layer.baselineY).toBeLessThanOrEqual(1);
    }
  });

  it.each(ALL)('$id: plane visual style is fully specified', (theme) => {
    const p = theme.visual.plane;
    expect(p.bodyColor).toMatch(/^#/);
    expect(p.wingColor).toMatch(/^#/);
    expect(p.tailColor).toMatch(/^#/);
    expect(p.cockpitColor).toMatch(/^#/);
    expect(p.shadowColor).toMatch(/^#/);
    expect(p.trailColor).toMatch(/^#/);
  });
});
