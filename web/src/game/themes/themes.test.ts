import { describe, it, expect } from 'vitest';
import { dayTheme } from './day';
import { duskTheme } from './dusk';
import { sunsetTheme } from './sunset';
import { nightTheme } from './night';
import { ALL_THEMES, THEMES, resolveAutoTheme, resolveThemeForHour } from './registry';
import type { Theme, ThemeId } from '../Game';

const ALL: Theme[] = [dayTheme, duskTheme, sunsetTheme, nightTheme];

describe('theme registry', () => {
  it('exposes all four themes with matching ids', () => {
    expect(dayTheme.id).toBe('day');
    expect(duskTheme.id).toBe('dusk');
    expect(sunsetTheme.id).toBe('sunset');
    expect(nightTheme.id).toBe('night');
  });

  it('registry maps each id to its theme', () => {
    const ids: ThemeId[] = ['day', 'dusk', 'sunset', 'night'];
    for (const id of ids) expect(THEMES[id].id).toBe(id);
    expect(ALL_THEMES).toHaveLength(4);
  });

  it.each(ALL)('$id: declares zh + en names', (theme) => {
    expect(theme.name.zh.length).toBeGreaterThan(0);
    expect(theme.name.en.length).toBeGreaterThan(0);
  });

  it.each(ALL)('$id: sky gradient is hex-coded', (theme) => {
    expect(theme.visual.skyTop).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.visual.skyBottom).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(ALL)('$id: sun + glow + haze colors are hex', (theme) => {
    expect(theme.visual.sun).toMatch(/^#/);
    expect(theme.visual.sunGlow).toMatch(/^#/);
    expect(theme.visual.hazeTint).toMatch(/^#/);
  });

  it.each(ALL)('$id: three mountain colors + grass', (theme) => {
    expect(theme.visual.mtnFar).toMatch(/^#/);
    expect(theme.visual.mtnMid).toMatch(/^#/);
    expect(theme.visual.mtnNear).toMatch(/^#/);
    expect(theme.visual.grass).toMatch(/^#/);
    expect(theme.visual.grassTip).toMatch(/^#/);
  });

  it.each(ALL)('$id: cloud bright + shade colors', (theme) => {
    expect(theme.visual.cloudBright).toMatch(/^#/);
    expect(theme.visual.cloudShade).toMatch(/^#/);
  });

  it.each(ALL)('$id: haze alpha + ambient are normalized', (theme) => {
    expect(theme.visual.hazeAlpha).toBeGreaterThanOrEqual(0);
    expect(theme.visual.hazeAlpha).toBeLessThanOrEqual(1);
    expect(theme.visual.ambient).toBeGreaterThan(0);
    expect(theme.visual.ambient).toBeLessThanOrEqual(1);
  });
});

describe('resolveThemeForHour', () => {
  it('morning → day', () => {
    expect(resolveThemeForHour(5)).toBe('day');
    expect(resolveThemeForHour(9)).toBe('day');
    expect(resolveThemeForHour(14)).toBe('day');
  });
  it('late afternoon → dusk', () => {
    expect(resolveThemeForHour(15)).toBe('dusk');
    expect(resolveThemeForHour(17)).toBe('dusk');
  });
  it('golden hour → sunset', () => {
    expect(resolveThemeForHour(18)).toBe('sunset');
    expect(resolveThemeForHour(19)).toBe('sunset');
  });
  it('late night + early morning → night', () => {
    expect(resolveThemeForHour(20)).toBe('night');
    expect(resolveThemeForHour(0)).toBe('night');
    expect(resolveThemeForHour(4)).toBe('night');
  });
  it('handles hours outside 0–23', () => {
    expect(resolveThemeForHour(25)).toBe('night');
    expect(resolveThemeForHour(-1)).toBe('night');
  });
  it('resolveAutoTheme reads current hour from a Date', () => {
    const at = (h: number) => {
      const d = new Date();
      d.setHours(h);
      return resolveAutoTheme(d);
    };
    expect(at(10)).toBe('day');
    expect(at(19)).toBe('sunset');
  });
});
