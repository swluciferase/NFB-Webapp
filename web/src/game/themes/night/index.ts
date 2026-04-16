import type { Theme } from '../../Game';
import { geometricPalette } from './palette';

export const geometricTheme: Theme = {
  id: 'geometric',
  name: { zh: '幾何', en: 'Geometric' },
  previewUrl: '',
  palette: { ...geometricPalette },
  visual: {
    bgTop: '#0b132b',
    bgBottom: '#1c2541',
    paperGrainColor: '#5bc0be',
    paperGrainAlpha: 0.05,
    paperGrainDensity: 0.3,
    parallax: [
      // far jagged ridge
      { seed: 811, amplitude: 0.22, baselineY: 0.60, scrollFactor: 0.30, fillColor: '#3a506b' },
      // mid cyan ridge
      { seed: 922, amplitude: 0.18, baselineY: 0.74, scrollFactor: 0.60, fillColor: '#5bc0be' },
      // near orange ground
      { seed: 933, amplitude: 0.16, baselineY: 0.88, scrollFactor: 1.0,  fillColor: '#ff6b35' },
    ],
    plane: {
      bodyColor: '#fff275',
      wingColor: '#ff6b35',
      tailColor: '#5bc0be',
      cockpitColor: '#0b132b',
      shadowColor: '#0b132b',
      shadowOffsetX: 3,
      shadowOffsetY: 4,
      trailColor: '#fff275',
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
