import type { Theme } from '../../Game';
import { papercutPalette } from './palette';

export const papercutTheme: Theme = {
  id: 'papercut',
  name: { zh: '剪紙', en: 'Papercut' },
  previewUrl: '',
  palette: { ...papercutPalette },
  bgmUrl: '',
  sfx: {},
  sprites: {
    plane: { body: '', trail: '', cloud: [], bird: '' },
    golf: { ball: '', club: '', terrain: [], flag: '' },
    maze: { rabbit: [], carrot: '', wall: [], goal: '' },
  },
};
