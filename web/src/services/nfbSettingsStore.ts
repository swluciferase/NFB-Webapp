export interface NfbIndicatorSetting {
  id: string;
  enabled: boolean;
  direction: 'up' | 'down';
  threshold: number;
  metricKey: string;
}

export interface NfbSettings {
  indicators: NfbIndicatorSetting[];
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  persistenceLevel: 1 | 2 | 3 | 4 | 5;
  qualitySensitivity: 1 | 2 | 3 | 4 | 5;
}

export const NFB_SETTINGS_STORAGE_KEY = 'soramynd.nfb.settings.v1';

export const DEFAULT_NFB_SETTINGS: NfbSettings = {
  indicators: [
    { id: 'eeg1', enabled: true, direction: 'up', threshold: 10, metricKey: 'Fz_Beta' },
  ],
  difficultyLevel: 3,
  persistenceLevel: 3,
  qualitySensitivity: 3,
};

function isValid(value: unknown): value is NfbSettings {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.indicators)) return false;
  for (const ind of v.indicators) {
    if (!ind || typeof ind !== 'object') return false;
    const i = ind as Record<string, unknown>;
    if (typeof i.id !== 'string') return false;
    if (typeof i.enabled !== 'boolean') return false;
    if (i.direction !== 'up' && i.direction !== 'down') return false;
    if (typeof i.threshold !== 'number') return false;
    if (typeof i.metricKey !== 'string') return false;
  }
  const isLvl = (x: unknown) => typeof x === 'number' && x >= 1 && x <= 5 && Number.isInteger(x);
  if (!isLvl(v.difficultyLevel)) return false;
  if (!isLvl(v.persistenceLevel)) return false;
  if (!isLvl(v.qualitySensitivity)) return false;
  return true;
}

type Listener = (settings: NfbSettings) => void;
const listeners = new Set<Listener>();

export const nfbSettingsStore = {
  read(): NfbSettings {
    try {
      const raw = localStorage.getItem(NFB_SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_NFB_SETTINGS;
      const parsed = JSON.parse(raw);
      if (!isValid(parsed)) return DEFAULT_NFB_SETTINGS;
      return parsed;
    } catch {
      return DEFAULT_NFB_SETTINGS;
    }
  },
  write(settings: NfbSettings): void {
    try {
      localStorage.setItem(NFB_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // quota / disabled storage — ignore in v1
    }
    for (const l of listeners) l(settings);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
