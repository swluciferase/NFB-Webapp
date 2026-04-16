import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createGameChannel,
  GAME_CHANNEL_NAME,
  GAME_PROTOCOL_VERSION,
  type GameChannelMessage,
} from './gameChannel';

describe('gameChannel', () => {
  const closers: Array<() => void> = [];
  afterEach(() => {
    while (closers.length) closers.pop()!();
  });

  it('uses the versioned channel name', () => {
    expect(GAME_CHANNEL_NAME).toBe('soramynd-game-v1');
    expect(GAME_PROTOCOL_VERSION).toBe(1);
  });

  it('delivers messages from sender to receiver', async () => {
    const sender = createGameChannel();
    const receiver = createGameChannel();
    closers.push(() => sender.close(), () => receiver.close());

    const received: GameChannelMessage[] = [];
    receiver.subscribe((msg) => received.push(msg));

    sender.post({ kind: 'hello', sessionId: 'abc', protocolVersion: 1 });

    // BroadcastChannel in jsdom is async — wait a tick.
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toEqual([
      { kind: 'hello', sessionId: 'abc', protocolVersion: 1 },
    ]);
  });

  it('does not deliver messages to itself', async () => {
    const ch = createGameChannel();
    closers.push(() => ch.close());

    const listener = vi.fn();
    ch.subscribe(listener);
    ch.post({ kind: 'pause' });
    await new Promise((r) => setTimeout(r, 10));

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops delivering after close', async () => {
    const sender = createGameChannel();
    const receiver = createGameChannel();
    closers.push(() => sender.close());

    const listener = vi.fn();
    receiver.subscribe(listener);
    receiver.close();

    sender.post({ kind: 'pause' });
    await new Promise((r) => setTimeout(r, 10));
    expect(listener).not.toHaveBeenCalled();
  });
});
