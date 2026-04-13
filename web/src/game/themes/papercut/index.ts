import type { Theme } from '../../Game';
import { papercutPalette } from './palette';

export const papercutTheme: Theme = {
  id: 'papercut',
  name: { zh: '剪紙', en: 'Papercut' },
  previewUrl: '',
  palette: { ...papercutPalette },
  visual: {
    bgTop: '#f6ead3',
    bgBottom: '#e3c48b',
    paperGrainColor: '#8b6f47',
    paperGrainAlpha: 0.08,
    paperGrainDensity: 0.6,
    parallax: [
      // far mountains — desaturated, slow scroll, high baseline
      { seed: 101, amplitude: 0.18, baselineY: 0.62, scrollFactor: 0.25, fillColor: '#b89878' },
      // mid hills — mid tone
      { seed: 202, amplitude: 0.22, baselineY: 0.74, scrollFactor: 0.55, fillColor: '#8a6a44' },
      // near ground — dark, full scroll
      { seed: 303, amplitude: 0.18, baselineY: 0.88, scrollFactor: 1.0,  fillColor: '#4c3a28' },
    ],
    plane: {
      bodyColor: '#d95a3b',
      wingColor: '#b34428',
      tailColor: '#d95a3b',
      cockpitColor: '#f6ead3',
      shadowColor: '#1a1208',
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      trailColor: '#fff5cc',
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
