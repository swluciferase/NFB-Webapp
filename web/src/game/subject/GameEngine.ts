import type { GameChannel, GameChannelMessage } from '../../services/gameChannel';
import type { GameFactory, GameInstance, Lang, Theme } from '../Game';
import { createPixiHost, type PixiHost } from './pixiBootstrap';
import { papercutTheme } from '../themes/papercut';
import { planeManifest } from '../games/plane/manifest';

export interface GameEngineArgs {
  container: HTMLDivElement;
  channel: GameChannel;
}

const THEMES: Record<Theme['id'], Theme> = {
  papercut: papercutTheme,
  ghibli: papercutTheme,
  geometric: papercutTheme,
};

export class GameEngine {
  private container: HTMLDivElement;
  private channel: GameChannel;
  private host: PixiHost | null = null;
  private instance: GameInstance | null = null;
  private unsub: () => void = () => {};
  private currentRunIndex = -1;
  private theme: Theme = papercutTheme;
  private lang: Lang = 'zh';
  private loadingPromise: Promise<void> | null = null;

  constructor(args: GameEngineArgs) {
    this.container = args.container;
    this.channel = args.channel;
  }

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
      this.theme = THEMES[m.themeId] ?? papercutTheme;
      this.lang = m.lang;
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
      });
      return;
    }
    if (m.kind === 'oo') {
      this.instance?.setOO(m.oo);
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
          ooSeries: [],
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
      return;
    }
  }

  private async loadGame(gameId: 'plane' | 'golf' | 'maze'): Promise<void> {
    if (gameId !== 'plane') return;
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
    const factory: GameFactory = await planeManifest.load();
    this.instance = factory({
      container: this.container,
      theme: this.theme,
      lang: this.lang,
      modeId: 'auto',
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
