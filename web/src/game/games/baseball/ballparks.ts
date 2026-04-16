import type { Lang, ThemeId } from '../../Game';

/**
 * Each time-of-day theme maps to a unique ballpark. The center-field wall
 * distance controls how hard a home run is: estimated hit distance must be
 * greater than or equal to `wallM` to clear the fence (see BaseballGame's
 * resolveHit). Day is the short-porch park; night is the deepest.
 */
export interface Ballpark {
  id: ThemeId;
  name: Record<Lang, string>;
  wallM: number;                // centre-field distance in metres
  wallColor: string;            // outfield fence paint
  wallCap: string;              // the top line of the fence
  dirt: string;                 // infield clay
  grassInfield: string;         // infield turf (blends with theme.grass)
  grassOutfield: string;        // outfield turf
  stands: string;               // outfield stands silhouette
  standsShade: string;          // underside shading for the stands
}

export const BALLPARKS: Record<ThemeId, Ballpark> = {
  day: {
    id: 'day',
    name: { zh: '陽光球場', en: 'Sunbright Park' },
    wallM: 115,
    wallColor: '#2f6a3d',
    wallCap: '#f5f5f5',
    dirt: '#b98856',
    grassInfield: '#6aa86a',
    grassOutfield: '#58984f',
    stands: '#3a5a82',
    standsShade: '#253d5e',
  },
  dusk: {
    id: 'dusk',
    name: { zh: '黃昏球場', en: 'Goldenhour Field' },
    wallM: 125,
    wallColor: '#7a3a2a',
    wallCap: '#ffd79a',
    dirt: '#a06a44',
    grassInfield: '#6a9050',
    grassOutfield: '#587e44',
    stands: '#6a3a5a',
    standsShade: '#3e2238',
  },
  sunset: {
    id: 'sunset',
    name: { zh: '日落球場', en: 'Vermilion Grounds' },
    wallM: 135,
    wallColor: '#8a2a2a',
    wallCap: '#ffb37a',
    dirt: '#9a5438',
    grassInfield: '#507a44',
    grassOutfield: '#466a3a',
    stands: '#5a2a44',
    standsShade: '#331527',
  },
  night: {
    id: 'night',
    name: { zh: '夜光球場', en: 'Neon Dome' },
    wallM: 145,
    wallColor: '#1a2a4a',
    wallCap: '#a0d8ff',
    dirt: '#5a4030',
    grassInfield: '#2c5a3a',
    grassOutfield: '#224a2e',
    stands: '#1a1a30',
    standsShade: '#0a0a18',
  },
};

export function ballparkFor(themeId: ThemeId): Ballpark {
  return BALLPARKS[themeId];
}
