import type { Theme } from '../../Game';
import { sunsetPalette } from './palette';

export const sunsetTheme: Theme = {
  id: 'sunset',
  name: { zh: '日落', en: 'Sunset' },
  previewUrl: '',
  palette: { ...sunsetPalette },
  visual: {
    skyTop: '#1e2a52',
    skyBottom: '#ff8548',
    sun: '#ff9244',
    sunGlow: '#ff5a2a',
    mtnFar: '#5c5580',
    mtnMid: '#3d3560',
    mtnNear: '#1e1836',
    grass: '#2a2238',
    grassTip: '#544668',
    cloudBright: '#ffb27a',
    cloudShade: '#8a4a48',
    hazeTint: '#ff7a3a',
    hazeAlpha: 0.3,
    ambient: 0.85,
  },
  bgmUrl: '',
  sfx: {},
  sprites: {
    plane: { body: '', trail: '', cloud: [], bird: '' },
  },
};
