export const K_VALUES = [16.67, 14.29, 12.70, 11.55, 10.66] as const;
export const W_VALUES = [5, 8, 12, 17, 23] as const;

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;
export type PersistenceLevel = 1 | 2 | 3 | 4 | 5;

export interface NfbIndicator {
  id: string;
  direction: 'up' | 'down';
  threshold: number;
  metricKey: string;
}

export function computeTA(window: ReadonlyArray<boolean>): number {
  if (window.length === 0) return 0;
  let hits = 0;
  for (const t of window) if (t) hits++;
  return (hits / window.length) * 100;
}

export function computeOO(ta: number, difficulty: DifficultyLevel): number {
  if (difficulty < 1 || difficulty > 5) {
    throw new Error(`Invalid difficulty level: ${difficulty}`);
  }
  const k = K_VALUES[difficulty - 1];
  const raw = k * Math.sqrt(Math.max(0, ta));
  if (raw <= 0) return 0;
  if (raw >= 100) return 100;
  return raw;
}

export function computeTickBool(
  indicators: ReadonlyArray<NfbIndicator>,
  metrics: Readonly<Record<string, number>>,
): boolean {
  if (indicators.length === 0) return false;
  for (const ind of indicators) {
    const v = metrics[ind.metricKey];
    if (v === undefined || Number.isNaN(v)) return false;
    if (ind.direction === 'up' && !(v >= ind.threshold)) return false;
    if (ind.direction === 'down' && !(v < ind.threshold)) return false;
  }
  return true;
}
