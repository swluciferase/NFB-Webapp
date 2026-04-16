import type { Theme } from '../../Game';
import { duskPalette } from './palette';

export const duskTheme: Theme = {
  id: 'dusk',
  name: { zh: '黃昏', en: 'Dusk' },
  previewUrl: '',
  palette: { ...duskPalette },
  visual: {
    skyTop: '#3a4770',
    skyBottom: '#f4a574',
    sun: '#ffd58a',
    sunGlow: '#ff9c5c',
    mtnFar: '#7785a8',
    mtnMid: '#524766',
    mtnNear: '#2e2840',
    grass: '#3c4a5c',
    grassTip: '#6c7a8c',
    cloudBright: '#ffd1a5',
    cloudShade: '#b88a7a',
    hazeTint: '#ffb489',
    hazeAlpha: 0.22,
    ambient: 0.9,
  },
  bgmUrl: '',
  sfx: {},
  sprites: {
    plane: { body: '', trail: '', cloud: [], bird: '' },
  },
};
