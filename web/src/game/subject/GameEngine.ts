import type { GameChannel, GameChannelMessage } from '../../services/gameChannel';
import type { GameFactory, GameId, GameInstance, GameManifest, GameStats, GameStatsListener, Lang, Theme } from '../Game';
import { createPixiHost, type PixiHost } from './pixiBootstrap';
import { THEMES } from '../themes/registry';
import { dayTheme } from '../themes/day';
import { planeManifest } from '../games/plane/manifest';
import { baseballManifest } from '../games/baseball/manifest';
import { zentangleManifest } from '../games/zentangle/manifest';
import { karesanzuiManifest } from '../games/karesanzui/manifest';

const MANIFESTS: Partial<Record<GameId, GameManifest>> = {
  plane: planeManifest,
  baseball: baseballManifest,
  zentangle: zentangleManifest,
  karesansui: karesanzuiManifest,
};

export interface GameEngineArgs {
  container: HTMLDivElement;
  channel: GameChannel;
}

export class GameEngine {
  private container: HTMLDivElement;
  private channel: GameChannel;
  private host: PixiHost | null = null;
  private instance: GameInstance | null = null;
  private unsub: () => void = () => {};
  private currentRunIndex = -1;
  private theme: Theme = dayTheme;
  private lang: Lang = 'zh';
  private modeId: string = 'auto';
  private loadingPromise: Promise<void> | null = null;
  private statsListener: GameStatsListener | null = null;
  /** Signature of the last successfully-loaded loadGame payload. Used to
   *  dedupe redundant loadGame messages so the scene isn't destroyed +
   *  recreated when only irrelevant fields change (or when the same config
   *  is re-broadcast on every wizard re-render). */
  private lastLoadSignature: string | null = null;

  constructor(args: GameEngineArgs) {
    this.container = args.container;
    this.channel = args.channel;
  }

  onStats(listener: GameStatsListener): () => void {
    this.statsListener = listener;
    return () => {
      if (this.statsListener === listener) this.statsListener = null;
    };
  }

  private emitStats = (stats: GameStats) => {
    this.statsListener?.(stats);
  };

  async start(): Promise<void> {
    this.host = await createPixiHost(this.container);
    (this.container as unknown as { __pixiApp: unknown }).__pixiApp = this.host.app;
    (this.container as unknown as { __pixiStage: unknown }).__pixiStage = this.host.stage;

    this.unsub = this.channel.subscribe((m) => {
      void this.onMessage(m);
    });
  }

  private async onMessage(m: GameChannelMessage): Promise<void> {
    if (this.loadingPromise) {
      await this.loadingPromise;
    }
    if (m.kind === 'loadGame') {
      // Dedupe: if the payload is byte-for-byte identical to the previously
      // loaded game, skip the whole destroy/recreate cycle. Without this
      // guard, the wizard's live-preview effect can spam loadGame on every
      // parent render and thrash the scene several times per second (visible
      // as pre-start cloud flicker + GPU memory leak).
      const signature = JSON.stringify({
        gameId: m.gameId,
        modeId: m.modeId,
        themeId: m.themeId,
        lang: m.lang,
        plannedInnings: m.plannedInnings,
        plannedCoveragePct: m.plannedCoveragePct,
        patternId: m.patternId,
        noFeedback: m.noFeedback,
        dualTeamA: m.dualTeamA,
        dualTeamB: m.dualTeamB,
      });
      if (signature === this.lastLoadSignature && this.instance) {
        return;
      }
      this.lastLoadSignature = signature;

      this.theme = THEMES[m.themeId] ?? dayTheme;
      this.lang = m.lang;
      this.modeId = m.modeId;
      // Stash session-level hints on the container element so game factories
      // can read them (e.g. baseball needs plannedInnings for its scoreboard;
      // zentangle needs the target coverage percent).
      (this.container as unknown as { __baseballInningTotal?: number })
        .__baseballInningTotal = m.plannedInnings ?? 9;
      (this.container as unknown as { __zentangleTargetPct?: number })
        .__zentangleTargetPct = m.plannedCoveragePct ?? 80;
      (this.container as unknown as { __zentangleNoFeedback?: boolean })
        .__zentangleNoFeedback = m.noFeedback ?? false;
      (this.container as unknown as { __zentanglePaletteId?: string })
        .__zentanglePaletteId = m.paletteId;
      (this.container as unknown as { __karesanzuiSeason?: string })
        .__karesanzuiSeason = m.modeId;
      (this.container as unknown as { __karesanzuiPattern?: string })
        .__karesanzuiPattern = m.patternId ?? 'spiral';
      (this.container as unknown as { __baseballDualTeamA?: string })
        .__baseballDualTeamA = m.dualTeamA;
      (this.container as unknown as { __baseballDualTeamB?: string })
        .__baseballDualTeamB = m.dualTeamB;
      this.loadingPromise = this.loadGame(m.gameId);
      try {
        await this.loadingPromise;
      } catch (err) {
        console.error('[GameEngine] loadGame failed', err);
      } finally {
        this.loadingPromise = null;
      }
      return;
    }
    if (m.kind === 'runStart') {
      this.currentRunIndex = m.runIndex;
      this.instance?.startRun(m.runIndex, (result) => {
        this.channel.post({ kind: 'runResult', runIndex: result.runIndex, result });
      }, m.runDurationSec);
      return;
    }
    if (m.kind === 'rl') {
      this.instance?.setRL(m.rl, m.ta, m.rl2);
      return;
    }
    if (m.kind === 'pause') {
      this.instance?.pause();
      return;
    }
    if (m.kind === 'resume') {
      this.instance?.resume();
      return;
    }
    if (m.kind === 'runForceEnd') {
      this.channel.post({
        kind: 'runResult',
        runIndex: this.currentRunIndex,
        result: {
          runIndex: this.currentRunIndex,
          startedAt: 0,
          durationMs: 0,
          rlSeries: [],
          qualityPercent: 0,
          isValid: false,
          gameSpecific: {},
        },
      });
      return;
    }
    if (m.kind === 'sessionEnd') {
      this.instance?.destroy();
      this.instance = null;
      this.lastLoadSignature = null;
      return;
    }
    if (m.kind === 'gameInput') {
      this.instance?.onInput?.(m.event);
      return;
    }
  }

  private async loadGame(gameId: GameId): Promise<void> {
    const manifest = MANIFESTS[gameId];
    if (!manifest) return;
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
    const factory: GameFactory = await manifest.load();
    this.instance = factory({
      container: this.container,
      theme: this.theme,
      lang: this.lang,
      modeId: this.modeId,
      onStats: this.emitStats,
    });
  }

  async stop(): Promise<void> {
    this.unsub();
    this.instance?.destroy();
    this.instance = null;
    if (this.host) {
      await this.host.dispose();
      this.host = null;
    }
  }
}
