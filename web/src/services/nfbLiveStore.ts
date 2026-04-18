/**
 * Live RL/TA bridge. TrainingView is the single source of truth for the NFB
 * formula (per-indicator value → tick → TA window → RL = K·√TA). It publishes
 * its computed values here so views on other tabs (e.g. GameControlView) can
 * read the exact same numbers without reimplementing the pipeline against a
 * different metric map.
 *
 * Cross-tab relay: each tab broadcasts its RL via BroadcastChannel so that
 * dual-EEG modes (e.g. baseball dual) can read a second RL from another tab.
 */
type Listener = (snapshot: NfbLiveSnapshot) => void;
type RemoteListener = (remote: RemoteRlSnapshot) => void;

export interface NfbLiveSnapshot {
  rl: number;
  ta: number;
}

export interface RemoteRlSnapshot {
  tabId: string;
  steegId: string | null;
  rl: number;
  ta: number;
  timestamp: number;
}

// ── Tab ID (reuse same key as deviceRegistry) ──

function getTabId(): string {
  let id = sessionStorage.getItem('sgimacog_tab_id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('sgimacog_tab_id', id);
  }
  return id;
}

// ── Cross-tab BroadcastChannel ──

const RL_CHANNEL_NAME = 'soramynd-rl-relay';

interface RlRelayMessage {
  tabId: string;
  steegId: string | null;
  rl: number;
  ta: number;
  t: number;
}

let _rlChannel: BroadcastChannel | null = null;
let _steegId: string | null = null;
const _remoteListeners = new Set<RemoteListener>();
/** Latest remote RL snapshot per tabId. Stale entries (>8s) are pruned on read. */
const _remoteSnapshots = new Map<string, RemoteRlSnapshot>();
const REMOTE_STALE_MS = 8_000;

function getRlChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!_rlChannel) {
    _rlChannel = new BroadcastChannel(RL_CHANNEL_NAME);
    _rlChannel.onmessage = (e: MessageEvent) => {
      const msg = e.data as RlRelayMessage;
      if (msg.tabId === getTabId()) return; // ignore own echo
      const snap: RemoteRlSnapshot = {
        tabId: msg.tabId,
        steegId: msg.steegId,
        rl: msg.rl,
        ta: msg.ta,
        timestamp: msg.t,
      };
      _remoteSnapshots.set(msg.tabId, snap);
      for (const l of _remoteListeners) l(snap);
    };
  }
  return _rlChannel;
}

// Initialise channel eagerly so we start receiving immediately
if (typeof BroadcastChannel !== 'undefined') getRlChannel();

function pruneStale(): void {
  const now = Date.now();
  for (const [id, snap] of _remoteSnapshots) {
    if (now - snap.timestamp > REMOTE_STALE_MS) _remoteSnapshots.delete(id);
  }
}

// ── Local store (unchanged API) ──

let current: NfbLiveSnapshot = { rl: 0, ta: 0 };
const listeners = new Set<Listener>();

export const nfbLiveStore = {
  read(): NfbLiveSnapshot {
    return current;
  },
  publish(snapshot: NfbLiveSnapshot): void {
    current = snapshot;
    for (const l of listeners) l(snapshot);
    // Broadcast to other tabs
    getRlChannel()?.postMessage({
      tabId: getTabId(),
      steegId: _steegId,
      rl: snapshot.rl,
      ta: snapshot.ta,
      t: Date.now(),
    } satisfies RlRelayMessage);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },

  // ── Cross-tab remote RL API ──

  /** Set this tab's STEEG device ID so remote tabs can identify us. */
  setSteegId(id: string | null): void {
    _steegId = id;
  },

  /** Get the latest remote RL snapshot (from the most recently active other tab).
   *  Returns null if no remote tab is broadcasting. */
  readRemote(): RemoteRlSnapshot | null {
    pruneStale();
    let best: RemoteRlSnapshot | null = null;
    for (const snap of _remoteSnapshots.values()) {
      if (!best || snap.timestamp > best.timestamp) best = snap;
    }
    return best;
  },

  /** Get all live remote RL snapshots (one per remote tab). */
  readAllRemotes(): RemoteRlSnapshot[] {
    pruneStale();
    return Array.from(_remoteSnapshots.values());
  },

  /** Subscribe to remote RL updates from other tabs. */
  onRemote(l: RemoteListener): () => void {
    _remoteListeners.add(l);
    getRlChannel(); // ensure channel is active
    return () => { _remoteListeners.delete(l); };
  },
};
