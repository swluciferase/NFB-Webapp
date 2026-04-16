/**
 * Live RL/TA bridge. TrainingView is the single source of truth for the NFB
 * formula (per-indicator value → tick → TA window → RL = K·√TA). It publishes
 * its computed values here so views on other tabs (e.g. GameControlView) can
 * read the exact same numbers without reimplementing the pipeline against a
 * different metric map.
 */
type Listener = (snapshot: NfbLiveSnapshot) => void;

export interface NfbLiveSnapshot {
  rl: number;
  ta: number;
}

let current: NfbLiveSnapshot = { rl: 0, ta: 0 };
const listeners = new Set<Listener>();

export const nfbLiveStore = {
  read(): NfbLiveSnapshot {
    return current;
  },
  publish(snapshot: NfbLiveSnapshot): void {
    current = snapshot;
    for (const l of listeners) l(snapshot);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
