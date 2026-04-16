import type { Theme, ThemeId } from '../Game';
import { dayTheme } from './day';
import { duskTheme } from './dusk';
import { sunsetTheme } from './sunset';
import { nightTheme } from './night';

export const THEMES: Record<ThemeId, Theme> = {
  day: dayTheme,
  dusk: duskTheme,
  sunset: sunsetTheme,
  night: nightTheme,
};

export const ALL_THEMES: readonly Theme[] = [dayTheme, duskTheme, sunsetTheme, nightTheme];

/**
 * Resolve a real-world hour (0–23) to the time-of-day theme that best
 * matches. Used by the "auto" option in the wizard so the training scene
 * syncs with the child's actual environment.
 *
 *   05–15  →  day     (bright morning through early afternoon)
 *   15–18  →  dusk    (late afternoon fading)
 *   18–20  →  sunset  (dramatic horizon hour)
 *   20–05  →  night
 */
export function resolveThemeForHour(hour: number): ThemeId {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 15) return 'day';
  if (h >= 15 && h < 18) return 'dusk';
  if (h >= 18 && h < 20) return 'sunset';
  return 'night';
}

export function resolveAutoTheme(now: Date = new Date()): ThemeId {
  return resolveThemeForHour(now.getHours());
}
