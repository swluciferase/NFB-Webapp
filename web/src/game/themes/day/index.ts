import type { Theme } from '../../Game';
import { dayPalette } from './palette';

export const dayTheme: Theme = {
  id: 'day',
  name: { zh: '晴日', en: 'Day' },
  previewUrl: '',
  palette: { ...dayPalette },
  visual: {
    skyTop: '#6fb5ff',
    skyBottom: '#c7ecff',
    sun: '#fff4c7',
    sunGlow: '#ffe68a',
    mtnFar: '#8fb4d8',
    mtnMid: '#6d91b8',
    mtnNear: '#4c6f96',
    grass: '#6aa86a',
    grassTip: '#9fd27a',
    cloudBright: '#ffffff',
    cloudShade: '#dce8f4',
    hazeTint: '#a8d2ff',
    hazeAlpha: 0.14,
    ambient: 1.0,
  },
  bgmUrl: '',
  sfx: {},
  sprites: {
    plane: { body: '', trail: '', cloud: [], bird: '' },
  },
};
