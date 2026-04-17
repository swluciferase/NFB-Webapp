import { useCallback, useEffect, useState } from 'react';
import { nfbLiveStore, type NfbLiveSnapshot } from '../services/nfbLiveStore';
import { nfbSettingsStore, type NfbSettings } from '../services/nfbSettingsStore';

export interface GameOverlayOpacity {
  rl: number;
  ta: number;
  tick: boolean;
  isActive: boolean;
  resetSession: () => void;
}

/**
 * Reads live OO/TA published by TrainingView's NFB pipeline. GameControlView
 * cannot re-derive these itself because the real indicator formulas live in
 * TrainingView's state (custom formulas, thresholds, AND/Average modes) —
 * mirroring that logic would drift. TrainingView is the single source of
 * truth; this hook just subscribes.
 */
export function useGameOverlayOpacity(
  _metrics: Record<string, number> | null,
): GameOverlayOpacity {
  const [snapshot, setSnapshot] = useState<NfbLiveSnapshot>(() => nfbLiveStore.read());
  const [settings, setSettings] = useState<NfbSettings>(() => nfbSettingsStore.read());

  useEffect(() => nfbLiveStore.subscribe(setSnapshot), []);
  useEffect(() => nfbSettingsStore.subscribe(setSettings), []);

  const resetSession = useCallback(() => {
    // TrainingView owns the session window; nothing to reset here.
  }, []);

  const isActive = settings.indicators.some((i) => i.enabled);

  return {
    rl: snapshot.rl,
    ta: snapshot.ta,
    tick: snapshot.rl > 0,
    isActive,
    resetSession,
  };
}
