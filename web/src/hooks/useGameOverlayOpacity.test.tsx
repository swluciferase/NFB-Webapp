import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameOverlayOpacity } from './useGameOverlayOpacity';
import { nfbSettingsStore, DEFAULT_NFB_SETTINGS } from '../services/nfbSettingsStore';

describe('useGameOverlayOpacity', () => {
  beforeEach(() => {
    localStorage.clear();
    nfbSettingsStore.write({
      ...DEFAULT_NFB_SETTINGS,
      indicators: [
        { id: 'eeg1', enabled: true, direction: 'up', threshold: 10, metricKey: 'Fz_Beta' },
      ],
      difficultyLevel: 3,
      persistenceLevel: 1,
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function metrics(fzBeta: number): Record<string, number> {
    return { Fz_Beta: fzBeta };
  }

  it('starts at oo=0 with no data', () => {
    const { result } = renderHook(() => useGameOverlayOpacity(null));
    expect(result.current.oo).toBe(0);
    expect(result.current.ta).toBe(0);
    expect(result.current.isActive).toBe(true);
  });

  it('rises toward 100 after sustained above-threshold metrics', () => {
    const { result, rerender } = renderHook(
      ({ m }) => useGameOverlayOpacity(m),
      { initialProps: { m: metrics(20) } },
    );

    // Persistence level 1 → window size 5 seconds
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      rerender({ m: metrics(20) });
    }
    expect(result.current.ta).toBe(100);
    // K[2] = 12.70, OO = 12.70 * sqrt(100) = 127 → clamped to 100
    expect(result.current.oo).toBe(100);
  });

  it('drops to 0 when metrics fail', () => {
    const { result, rerender } = renderHook(
      ({ m }) => useGameOverlayOpacity(m),
      { initialProps: { m: metrics(5) } },
    );

    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      rerender({ m: metrics(5) });
    }
    expect(result.current.ta).toBe(0);
    expect(result.current.oo).toBe(0);
  });

  it('exposes a resetSession handle that clears accumulation', () => {
    const { result, rerender } = renderHook(
      ({ m }) => useGameOverlayOpacity(m),
      { initialProps: { m: metrics(20) } },
    );
    for (let i = 0; i < 3; i++) {
      act(() => vi.advanceTimersByTime(1000));
      rerender({ m: metrics(20) });
    }
    act(() => result.current.resetSession());
    expect(result.current.oo).toBe(0);
    expect(result.current.ta).toBe(0);
  });
});
