import type { GameFactory, GameManifest } from '../../Game';

export const planeManifest: GameManifest = {
  id: 'plane',
  name: { zh: 'PlaneFlight', en: 'PlaneFlight' },
  tagline: { zh: '持續專注飛行', en: 'Sustained focus flight' },
  runDurationSec: 90,
  modes: [
    { id: 'basic',       name: { zh: '基本模式', en: 'Basic'       }, taskLoad: 'single' },
    { id: 'alternating', name: { zh: '交替模式', en: 'Alternating' }, taskLoad: 'single' },
    { id: 'active',      name: { zh: '主動模式', en: 'Active'      }, taskLoad: 'single' },
  ],
  async load(): Promise<GameFactory> {
    const { createPlaneGame } = await import('./PlaneGame');
    return (args) => {
      const app = (args.container as unknown as { __pixiApp?: unknown }).__pixiApp;
      const stage = (args.container as unknown as { __pixiStage?: unknown }).__pixiStage;
      if (!app || !stage) {
        throw new Error('PlaneGame requires a Pixi Application bridged via container.__pixiApp');
      }
      return createPlaneGame({
        app: app as Parameters<typeof createPlaneGame>[0]['app'],
        stage: stage as Parameters<typeof createPlaneGame>[0]['stage'],
        theme: args.theme,
        modeId: args.modeId,
        onStats: args.onStats,
      });
    };
  },
};
