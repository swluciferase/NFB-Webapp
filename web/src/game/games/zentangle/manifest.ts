import type { GameFactory, GameManifest } from '../../Game';

export const zentangleManifest: GameManifest = {
  id: 'zentangle',
  name:    { zh: '禪繞畫', en: 'Zentangle' },
  tagline: { zh: '描繪圖案・放鬆開花', en: 'Trace patterns · relax to flow' },
  runDurationSec: 180,
  modes: [
    { id: 'mandala',   name: { zh: '曼陀羅',   en: 'Mandala'      }, taskLoad: 'single' },
    { id: 'lattice',   name: { zh: '魚鱗格',   en: 'Fish-scale'   }, taskLoad: 'single' },
    { id: 'ribbon',    name: { zh: '絲帶月',   en: 'Crescent'     }, taskLoad: 'single' },
    { id: 'sunflower', name: { zh: '向日葵',   en: 'Sunflower'    }, taskLoad: 'single' },
    { id: 'snowflake', name: { zh: '雪花',     en: 'Snowflake'    }, taskLoad: 'single' },
    { id: 'celtic',    name: { zh: '凱爾特結', en: 'Celtic Knot'  }, taskLoad: 'single' },
    { id: 'feather',   name: { zh: '羽毛紋',   en: 'Feather'      }, taskLoad: 'single' },
    { id: 'compass',   name: { zh: '羅盤',     en: 'Compass Rose' }, taskLoad: 'single' },
    { id: 'honeycomb', name: { zh: '蜂巢',     en: 'Honeycomb'    }, taskLoad: 'single' },
    { id: 'lotus',     name: { zh: '蓮花',     en: 'Lotus'        }, taskLoad: 'single' },
    { id: 'freeform',  name: { zh: '自由創作', en: 'Freeform'     }, taskLoad: 'single' },
  ],
  async load(): Promise<GameFactory> {
    const { createZentangleGame } = await import('./ZentangleGame');
    return (args) => {
      const app = (args.container as unknown as { __pixiApp?: unknown }).__pixiApp;
      const stage = (args.container as unknown as { __pixiStage?: unknown }).__pixiStage;
      if (!app || !stage) {
        throw new Error('ZentangleGame requires a Pixi Application bridged via container.__pixiApp');
      }
      const targetPct  = (args.container as unknown as { __zentangleTargetPct?: number })
        .__zentangleTargetPct ?? 80;
      const noFeedback = (args.container as unknown as { __zentangleNoFeedback?: boolean })
        .__zentangleNoFeedback ?? false;
      const paletteId  = (args.container as unknown as { __zentanglePaletteId?: string })
        .__zentanglePaletteId;
      return createZentangleGame({
        app:        app as Parameters<typeof createZentangleGame>[0]['app'],
        stage:      stage as Parameters<typeof createZentangleGame>[0]['stage'],
        theme:      args.theme,
        modeId:     args.modeId,
        targetPct,
        noFeedback,
        paletteId,
        onStats:    args.onStats,
      });
    };
  },
};
