import type { Theme } from '../../Game';
import { ghibliPalette } from './palette';

export const ghibliTheme: Theme = {
  id: 'ghibli',
  name: { zh: '吉卜力', en: 'Ghibli' },
  previewUrl: '',
  palette: { ...ghibliPalette },
  visual: {
    bgTop: '#a8d8ea',
    bgBottom: '#e8f4f8',
    paperGrainColor: '#ffffff',
    paperGrainAlpha: 0.10,
    paperGrainDensity: 1.2,
    parallax: [
      // distant sky-blue mountains
      { seed: 411, amplitude: 0.20, baselineY: 0.58, scrollFactor: 0.20, fillColor: '#7faec8' },
      // mid soft hills
      { seed: 522, amplitude: 0.16, baselineY: 0.68, scrollFactor: 0.40, fillColor: '#9ec5a8' },
      // mid-near rolling hills
      { seed: 633, amplitude: 0.20, baselineY: 0.78, scrollFactor: 0.65, fillColor: '#6e9b78' },
      // near grass
      { seed: 744, amplitude: 0.16, baselineY: 0.90, scrollFactor: 1.0,  fillColor: '#5a7a3a' },
    ],
    plane: {
      bodyColor: '#f4a261',
      wingColor: '#e08840',
      tailColor: '#f4a261',
      cockpitColor: '#fff5e1',
      shadowColor: '#264653',
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      trailColor: '#ffffff',
    },
  },
  bgmUrl: '',
  sfx: {},
  sprites: {
    plane: { body: '', trail: '', cloud: [], bird: '' },
    golf: { ball: '', club: '', terrain: [], flag: '' },
    maze: { rabbit: [], carrot: '', wall: [], goal: '' },
  },
};
