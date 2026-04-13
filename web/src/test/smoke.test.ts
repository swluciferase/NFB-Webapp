import { describe, it, expect } from 'vitest';

describe('test infrastructure smoke', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('has BroadcastChannel available in jsdom', () => {
    expect(typeof BroadcastChannel).toBe('function');
    const ch = new BroadcastChannel('test');
    ch.close();
  });

  it('has indexedDB available via fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
    expect(typeof indexedDB.open).toBe('function');
  });
});
