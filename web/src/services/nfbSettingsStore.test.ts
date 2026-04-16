import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  nfbSettingsStore,
  DEFAULT_NFB_SETTINGS,
  NFB_SETTINGS_STORAGE_KEY,
  type NfbSettings,
} from './nfbSettingsStore';

describe('nfbSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the default preset when storage is empty', () => {
    expect(nfbSettingsStore.read()).toEqual(DEFAULT_NFB_SETTINGS);
  });

  it('round-trips a valid settings object', () => {
    const s: NfbSettings = {
      indicators: [
        { id: 'eeg1', enabled: true, direction: 'up', threshold: 12, metricKey: 'Fz_Beta' },
      ],
      difficultyLevel: 4,
      persistenceLevel: 2,
      qualitySensitivity: 3,
    };
    nfbSettingsStore.write(s);
    expect(nfbSettingsStore.read()).toEqual(s);
  });

  it('returns default on invalid JSON', () => {
    localStorage.setItem(NFB_SETTINGS_STORAGE_KEY, '{not-json');
    expect(nfbSettingsStore.read()).toEqual(DEFAULT_NFB_SETTINGS);
  });

  it('returns default on schema mismatch', () => {
    localStorage.setItem(NFB_SETTINGS_STORAGE_KEY, JSON.stringify({ wrong: 'shape' }));
    expect(nfbSettingsStore.read()).toEqual(DEFAULT_NFB_SETTINGS);
  });

  it('notifies subscribers on write', () => {
    const listener = vi.fn();
    const unsub = nfbSettingsStore.subscribe(listener);
    nfbSettingsStore.write({ ...DEFAULT_NFB_SETTINGS, difficultyLevel: 5 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ difficultyLevel: 5 }));
    unsub();
  });

  it('unsubscribes cleanly', () => {
    const listener = vi.fn();
    const unsub = nfbSettingsStore.subscribe(listener);
    unsub();
    nfbSettingsStore.write({ ...DEFAULT_NFB_SETTINGS, difficultyLevel: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});
