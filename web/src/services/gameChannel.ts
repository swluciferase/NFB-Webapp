import type { GameId, GameInputEvent, RunResult, Lang, Theme } from '../game/Game';

export const GAME_CHANNEL_NAME = 'soramynd-game-v1';
export const GAME_PROTOCOL_VERSION = 1;

export type GameChannelMessage =
  // main → subject
  | { kind: 'hello';          sessionId: string; protocolVersion: number }
  | { kind: 'loadGame';       gameId: GameId; modeId: string; themeId: Theme['id']; lang: Lang }
  | { kind: 'preview' }
  | { kind: 'runStart';       runIndex: number; runDurationSec: number; startedAt: number }
  | { kind: 'oo';             t: number; oo: number; ta: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'runForceEnd' }
  | { kind: 'sessionEnd' }
  | { kind: 'themeChange';    themeId: Theme['id'] }
  | { kind: 'heartbeatMain';  t: number }
  // subject → main
  | { kind: 'subjectReady';   protocolVersion: number }
  | { kind: 'runResult';      runIndex: number; result: RunResult }
  | { kind: 'gameInput';      event: GameInputEvent }
  | { kind: 'heartbeatSubject'; t: number }
  | { kind: 'subjectClosing' };

export type GameChannelListener = (msg: GameChannelMessage) => void;

export interface GameChannel {
  post(msg: GameChannelMessage): void;
  subscribe(listener: GameChannelListener): () => void;
  close(): void;
}

export function createGameChannel(): GameChannel {
  const bc = new BroadcastChannel(GAME_CHANNEL_NAME);
  const listeners = new Set<GameChannelListener>();
  let closed = false;

  bc.addEventListener('message', (e: MessageEvent) => {
    if (closed) return;
    const msg = e.data as GameChannelMessage;
    for (const l of listeners) l(msg);
  });

  return {
    post(msg) {
      if (closed) return;
      bc.postMessage(msg);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      bc.close();
    },
  };
}
