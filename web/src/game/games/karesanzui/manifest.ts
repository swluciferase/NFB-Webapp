import type { GameFactory, GameManifest } from '../../Game';

export const karesanzuiManifest: GameManifest = {
  id: 'karesansui',
  name:    { zh: '日式庭園', en: 'Karesenzui' },
  tagline: { zh: '禪意沙畫・放鬆開花', en: 'Zen garden · relax to bloom' },
  runDurationSec: 300,
  modes: [
    { id: 'spring', name: { zh: '春・桜', en: 'Spring · Sakura' }, taskLoad: 'single' },
    { id: 'summer', name: { zh: '夏・緑', en: 'Summer · Green'  }, taskLoad: 'single' },
    { id: 'autumn', name: { zh: '秋・楓', en: 'Autumn · Maple'  }, taskLoad: 'single' },
    { id: 'winter', name: { zh: '冬・梅', en: 'Winter · Plum'   }, taskLoad: 'single' },
  ],
  async load(): Promise<GameFactory> {
    const { createKaresanzuiGame } = await import('./KaresanzuiGame');
    return (args) => {
      const app   = (args.container as unknown as { __pixiApp?:   unknown }).__pixiApp;
      const stage = (args.container as unknown as { __pixiStage?: unknown }).__pixiStage;
      if (!app || !stage) {
        throw new Error('KaresanzuiGame requires a Pixi Application bridged via container.__pixiApp');
      }
      // Season comes from modeId (spring/summer/autumn/winter).
      // Also readable from the container bridge set by GameEngine.
      const season = (args.container as unknown as { __karesanzuiSeason?: string }).__karesanzuiSeason
        ?? args.modeId
        ?? 'spring';
      const patternId = (args.container as unknown as { __karesanzuiPattern?: string }).__karesanzuiPattern
        ?? 'spiral';
      return createKaresanzuiGame({
        app:      app    as Parameters<typeof createKaresanzuiGame>[0]['app'],
        stage:    stage  as Parameters<typeof createKaresanzuiGame>[0]['stage'],
        theme:    args.theme,
        season,
        patternId,
        onStats:  args.onStats,
      });
    };
  },
};
