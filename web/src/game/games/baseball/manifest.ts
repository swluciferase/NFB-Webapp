import type { GameFactory, GameManifest } from '../../Game';

/**
 * Baseball runs are inning-shaped (9 pitches × 18s = 162s). Each pitch is
 * 5s prep + 10s charge + 3s post-hit ball flight. The "run duration" field
 * is advisory only — the session controller ends baseball sessions by
 * run-count (innings), not by elapsed time.
 */
export const baseballManifest: GameManifest = {
  id: 'baseball',
  name: { zh: '棒球 Baseball', en: 'Baseball' },
  tagline: { zh: '蓄力揮棒，打出全壘打', en: 'Charge up and swing for the fences' },
  runDurationSec: 162,
  modes: [
    { id: 'basic',  name: { zh: '基本模式', en: 'Basic'  }, taskLoad: 'single' },
    { id: 'active', name: { zh: '主動模式', en: 'Active' }, taskLoad: 'single' },
    { id: 'dual',   name: { zh: '雙人模式', en: 'Dual'   }, taskLoad: 'dual'   },
  ],
  async load(): Promise<GameFactory> {
    const { createBaseballGame } = await import('./BaseballGame');
    return (args) => {
      const app = (args.container as unknown as { __pixiApp?: unknown }).__pixiApp;
      const stage = (args.container as unknown as { __pixiStage?: unknown }).__pixiStage;
      if (!app || !stage) {
        throw new Error('BaseballGame requires a Pixi Application bridged via container.__pixiApp');
      }
      const inningTotal = (args.container as unknown as { __baseballInningTotal?: number })
        .__baseballInningTotal ?? 9;
      const dualTeamA = (args.container as unknown as { __baseballDualTeamA?: string })
        .__baseballDualTeamA;
      const dualTeamB = (args.container as unknown as { __baseballDualTeamB?: string })
        .__baseballDualTeamB;
      return createBaseballGame({
        app: app as Parameters<typeof createBaseballGame>[0]['app'],
        stage: stage as Parameters<typeof createBaseballGame>[0]['stage'],
        theme: args.theme,
        lang: args.lang,
        modeId: args.modeId,
        onStats: args.onStats,
        inningTotal,
        dualTeamA,
        dualTeamB,
      });
    };
  },
};
