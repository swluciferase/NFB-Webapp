import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  K_VALUES,
  W_VALUES,
  computeTA,
  computeOO,
  computeTickBool,
} from '../utils/nfbFormulas';
import {
  nfbSettingsStore,
  type NfbSettings,
} from '../services/nfbSettingsStore';

export interface GameOverlayOpacity {
  oo: number;
  ta: number;
  tick: boolean;
  isActive: boolean;
  resetSession: () => void;
}

/**
 * Build a flat Record<string,number> of all metrics the NFB settings might
 * reference. For M1 only Fz_Beta / Fz_Theta are surfaced; extend as new
 * metrics come online.
 */
function buildMetricMap(metrics: Record<string, number> | null): Record<string, number> {
  return metrics ?? {};
}

export function useGameOverlayOpacity(
  metrics: Record<string, number> | null,
): GameOverlayOpacity {
  const [settings, setSettings] = useState<NfbSettings>(() => nfbSettingsStore.read());
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => nfbSettingsStore.subscribe(setSettings), []);

  const taWindowRef = useRef<boolean[]>([]);
  const [tick, setTick] = useState(false);
  const [ta, setTa] = useState(0);
  const [oo, setOo] = useState(0);

  const metricsRef = useRef<Record<string, number>>(buildMetricMap(metrics));
  useEffect(() => {
    metricsRef.current = buildMetricMap(metrics);
  }, [metrics]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = settingsRef.current;
      const enabled = s.indicators.filter((i) => i.enabled);
      const thisTick = computeTickBool(enabled, metricsRef.current);
      const W = W_VALUES[s.persistenceLevel - 1]!;
      const nextWindow = [...taWindowRef.current, thisTick];
      if (nextWindow.length > W) nextWindow.shift();
      taWindowRef.current = nextWindow;
      const nextTa = computeTA(nextWindow);
      const nextOo = computeOO(nextTa, s.difficultyLevel);
      setTick(thisTick);
      setTa(nextTa);
      setOo(nextOo);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const resetSession = useCallback(() => {
    taWindowRef.current = [];
    setTick(false);
    setTa(0);
    setOo(0);
  }, []);

  const isActive = useMemo(
    () => settings.indicators.some((i) => i.enabled),
    [settings],
  );

  // Silence unused-import warning (K_VALUES is used indirectly via computeOO;
  // keep a reference so future refactors notice this dependency).
  void K_VALUES;

  return { oo, ta, tick, isActive, resetSession };
}
