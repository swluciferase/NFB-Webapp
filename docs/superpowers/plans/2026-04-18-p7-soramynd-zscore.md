# P7 — SoraMynd QEEG Z-Score Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a normative Z-score mode to SoraMynd's existing scalp NFB TrainingView. When Z-score mode is on, the band power values fed into the preset evaluator are replaced by CHBMP normative Z-scores, enabling threshold comparison in Z-score units instead of raw µV².

**Architecture:** Create `normEngineService.ts` (same pattern as Poseidon P8 — fetch `/api/norm-bin?db=`, init NormEngine WASM). Create `qeegZScoreService.ts` which converts `useBandPower` output (channel × band power in µV²) to log10 and calls `NormEngine.zscore_qeeg()` using CHBMP label mapping. Add Z-score DB card picker + mode toggle to TrainingView. In Z-score mode, substitute Z-score values for raw power in the formula evaluator.

**Tech Stack:** React + TypeScript, Rust/WASM (norm-engine), Vite + vite-plugin-wasm, Vitest.

**Key constraint:** Do NOT restructure TrainingView or useBandPower. Changes are additive only. SoraMynd's existing power-mode behavior is unchanged.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `web/src/pkg/norm_engine/` | Create (copy) | norm-engine WASM pkg files |
| `web/src/services/normEngineService.ts` | Create | Fetch binary, init WASM, expose zscore_qeeg |
| `web/src/services/qeegZScoreService.ts` | Create | Map useBandPower → CHBMP label indices → Z-scores |
| `web/src/services/__tests__/normEngineService.test.ts` | Create | Unit tests for service lifecycle |
| `web/src/services/__tests__/qeegZScoreService.test.ts` | Create | Unit tests for CHBMP label mapping + Z-score call |
| `web/src/components/views/TrainingView.tsx` | Modify | Add Z-score DB cards, mode toggle, wire Z-score into formula evaluator |

---

## Task 1: Add norm-engine WASM pkg to SoraMynd

**Files:**
- Create: `web/src/pkg/norm_engine/` (6 files)

- [ ] **Step 1: Check if SoraMynd vite config uses vite-plugin-wasm**

```bash
grep "wasm" /Users/swryociao/NFB-Webapp/web/vite.config.ts
```

Expected: `import wasm from 'vite-plugin-wasm'` and `wasm()` in plugins. If not present, run:
```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun add -d vite-plugin-wasm
```
And add to vite.config.ts:
```typescript
import wasm from 'vite-plugin-wasm';
// in plugins array: [wasm(), react()]
```

- [ ] **Step 2: Copy norm-engine pkg files**

```bash
mkdir -p /Users/swryociao/NFB-Webapp/web/src/pkg/norm_engine
cp /Users/swryociao/norm-engine/pkg/norm_engine.js \
   /Users/swryociao/norm-engine/pkg/norm_engine.d.ts \
   /Users/swryociao/norm-engine/pkg/norm_engine_bg.js \
   /Users/swryociao/norm-engine/pkg/norm_engine_bg.wasm \
   /Users/swryociao/norm-engine/pkg/norm_engine_bg.wasm.d.ts \
   /Users/swryociao/norm-engine/pkg/package.json \
   /Users/swryociao/NFB-Webapp/web/src/pkg/norm_engine/
```

- [ ] **Step 3: Verify**

```bash
ls /Users/swryociao/NFB-Webapp/web/src/pkg/norm_engine/
```

Expected: 6 files.

- [ ] **Step 4: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/pkg/norm_engine/ web/vite.config.ts
git commit -m "feat(p7): add norm-engine WASM pkg to SoraMynd"
```

---

## Task 2: Create normEngineService.ts

Identical pattern to Poseidon P8. SoraMynd uses `zscore_qeeg()` instead of `zscore_roi()`.

**Files:**
- Create: `web/src/services/normEngineService.ts`
- Create: `web/src/services/__tests__/normEngineService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/services/__tests__/normEngineService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normEngineService } from '../normEngineService';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockEngine = {
  zscore_qeeg: vi.fn().mockReturnValue(new Float32Array(19).fill(0)),
};
const MockNormEngine = vi.fn().mockImplementation(() => mockEngine);

vi.mock('../../pkg/norm_engine/norm_engine.js', () => ({
  NormEngine: MockNormEngine,
}));

describe('NormEngineService (SoraMynd)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore
    normEngineService['engine'] = null;
    // @ts-ignore
    normEngineService['loading'] = false;
    // @ts-ignore
    normEngineService['currentDbKey'] = '';
  });

  it('isReady is false before init', () => {
    expect(normEngineService.isReady()).toBe(false);
  });

  it('init fetches binary and constructs NormEngine', async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValue({ ok: true, arrayBuffer: async () => fakeBytes.buffer });

    await normEngineService.init('chbmp_v1');

    expect(mockFetch).toHaveBeenCalledWith('/api/norm-bin?db=chbmp_v1', { credentials: 'include' });
    expect(MockNormEngine).toHaveBeenCalledWith(fakeBytes);
    expect(normEngineService.isReady()).toBe(true);
  });

  it('switchDb no-ops when key unchanged', async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValue({ ok: true, arrayBuffer: async () => fakeBytes.buffer });
    await normEngineService.init('chbmp_v1');
    vi.clearAllMocks();
    await normEngineService.switchDb('chbmp_v1');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fails silently on fetch error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await normEngineService.init('chbmp_v1');
    expect(normEngineService.isReady()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun test normEngineService
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create normEngineService.ts**

Create `web/src/services/normEngineService.ts`:

```typescript
import type { NormEngine as NormEngineType } from '../pkg/norm_engine/norm_engine.js';

class NormEngineService {
  private engine: NormEngineType | null = null;
  private loading = false;
  private currentDbKey = '';

  async init(dbKey: string): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await fetch(`/api/norm-bin?db=${dbKey}`, { credentials: 'include' });
      if (!res.ok) {
        console.warn(`[NormEngine] fetch failed: ${res.status}`);
        return;
      }
      const buf = await res.arrayBuffer();
      const { NormEngine } = await import('../pkg/norm_engine/norm_engine.js');
      this.engine = new NormEngine(new Uint8Array(buf));
      this.currentDbKey = dbKey;
    } catch (e) {
      console.warn('[NormEngine] init error:', e);
    } finally {
      this.loading = false;
    }
  }

  async switchDb(dbKey: string): Promise<void> {
    if (dbKey === this.currentDbKey && this.engine !== null) return;
    await this.init(dbKey);
  }

  isReady(): boolean {
    return this.engine !== null;
  }

  /**
   * Z-score QEEG metrics.
   * bandPower: [n_channels × n_bands] Float32Array (log10 µV²)
   * coherence: [n_coh_pairs × n_bands] Float32Array (pass empty if not computed)
   * asymmetry: [n_asym_pairs × n_bands] Float32Array (pass empty if not computed)
   * customBands: flat [lo1,hi1,lo2,hi2,...] Hz (one pair per band)
   * age: subject age in years
   * Returns concatenated Z-scores or null if not ready.
   */
  zscore_qeeg(
    bandPower: Float32Array,
    coherence: Float32Array,
    asymmetry: Float32Array,
    customBands: Float32Array,
    age: number,
  ): Float32Array | null {
    if (!this.engine) return null;
    try {
      return this.engine.zscore_qeeg(bandPower, coherence, asymmetry, customBands, age);
    } catch (e) {
      console.warn('[NormEngine] zscore_qeeg error:', e);
      return null;
    }
  }
}

export const normEngineService = new NormEngineService();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun test normEngineService
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/services/normEngineService.ts web/src/services/__tests__/normEngineService.test.ts
git commit -m "feat(p7): add NormEngineService for QEEG Z-score"
```

---

## Task 3: Create QeegZScoreService

Maps `useBandPower` output (channel × band in µV²) to CHBMP label indices, converts to log10, and calls `NormEngine.zscore_qeeg()`.

**Files:**
- Create: `web/src/services/qeegZScoreService.ts`
- Create: `web/src/services/__tests__/qeegZScoreService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/services/__tests__/qeegZScoreService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { QeegZScoreService, CHBMP_LABELS } from '../qeegZScoreService';

const mockNormEngine = {
  isReady: vi.fn().mockReturnValue(true),
  zscore_qeeg: vi.fn().mockReturnValue(new Float32Array(19 * 2).fill(1.5)),
};

describe('QeegZScoreService', () => {
  const service = new QeegZScoreService(mockNormEngine as any);

  it('CHBMP_LABELS has 19 entries', () => {
    expect(CHBMP_LABELS.length).toBe(19);
    expect(CHBMP_LABELS[0]).toBe('Fp1');
    expect(CHBMP_LABELS[18]).toBe('O2');
  });

  it('labelToChbmpIdx returns correct index for known label', () => {
    expect(CHBMP_LABELS.indexOf('Fz')).toBe(4);
    expect(CHBMP_LABELS.indexOf('O1')).toBe(17);
  });

  it('labelToChbmpIdx returns -1 for unknown label', () => {
    expect(CHBMP_LABELS.indexOf('X99')).toBe(-1);
  });

  it('computeZScores calls zscore_qeeg with log10 band power', () => {
    // 8 channels, 7 bands (µV²)
    const bandPowerMatrix = Array.from({ length: 8 }, () =>
      [10, 20, 30, 5, 15, 8, 40],
    ); // raw µV² values
    const userLabels = ['Fp1', 'Fp2', 'T7', 'T8', 'O1', 'O2', 'Fz', 'Pz'];
    const bands = [
      { name: 'Delta', startHz: 0.5, endHz: 4 },
      { name: 'Theta', startHz: 4,   endHz: 8 },
      { name: 'Alpha', startHz: 8,   endHz: 13 },
      { name: 'SMR',   startHz: 12,  endHz: 15 },
      { name: 'Beta',  startHz: 13,  endHz: 30 },
      { name: 'Hi-Beta', startHz: 20, endHz: 30 },
      { name: 'Gamma', startHz: 30, endHz: 45 },
    ] as const;

    const result = service.computeZScores(bandPowerMatrix, userLabels, bands, 30);

    expect(mockNormEngine.zscore_qeeg).toHaveBeenCalled();
    const [bandPowerArg] = mockNormEngine.zscore_qeeg.mock.calls[0]!;
    // Verify log10 conversion: log10(10) ≈ 1.0
    expect(bandPowerArg[0]).toBeCloseTo(1.0, 3);
    // Verify result is indexed by CHBMP position, not user-label position
    expect(result).not.toBeNull();
  });

  it('returns null when normEngine not ready', () => {
    mockNormEngine.isReady.mockReturnValueOnce(false);
    const result = service.computeZScores([], [], [], 30);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun test qeegZScoreService
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create qeegZScoreService.ts**

The NormEngine expects band_power indexed by CHBMP order (19 electrodes). SoraMynd has 8 channels in arbitrary user-configured order. This service builds a sparse `Float32Array[19 × n_bands]` with only the channels present in both user config and CHBMP.

```typescript
import type { normEngineService as NormEngineServiceType } from './normEngineService';
import type { NFB_BANDS } from '../hooks/useBandPower';

export const CHBMP_LABELS = [
  'Fp1','Fp2','F7','F3','Fz','F4','F8',
  'T7','C3','Cz','C4','T8',
  'P7','P3','Pz','P4','P8','O1','O2',
] as const;

export const N_CHBMP = CHBMP_LABELS.length; // 19

export interface ZScoreResult {
  // bandZ[chbmpIdx][bandIdx] — NaN for channels not in user config
  bandZ: Float32Array; // flat [N_CHBMP × n_bands]
  n_bands: number;
}

type BandDef = { name: string; startHz: number; endHz: number };
type NormEngineRef = typeof NormEngineServiceType;

export class QeegZScoreService {
  constructor(private normEngine: NormEngineRef) {}

  /**
   * Compute QEEG Z-scores.
   * bandPowerMatrix: bandPowerMatrix[chIdx][bandIdx] in µV² (from useBandPower)
   * userLabels: channel labels in same order as bandPowerMatrix rows
   * bands: band definitions from NFB_BANDS
   * age: subject age in years
   */
  computeZScores(
    bandPowerMatrix: number[][],
    userLabels: string[],
    bands: readonly BandDef[],
    age: number,
  ): ZScoreResult | null {
    if (!this.normEngine.isReady()) return null;

    const nBands = bands.length;
    const nChbmp = N_CHBMP;

    // Build sparse band_power: [N_CHBMP × n_bands], log10 µV²; 0 for absent channels
    const bandPower = new Float32Array(nChbmp * nBands).fill(0);
    for (let chbmpIdx = 0; chbmpIdx < nChbmp; chbmpIdx++) {
      const label = CHBMP_LABELS[chbmpIdx]!;
      const userIdx = userLabels.indexOf(label);
      if (userIdx < 0) continue; // channel not in user config
      const row = bandPowerMatrix[userIdx];
      if (!row) continue;
      for (let b = 0; b < nBands; b++) {
        const raw = row[b] ?? 0;
        bandPower[chbmpIdx * nBands + b] = Math.log10(Math.max(raw, 1e-20));
      }
    }

    // custom_bands: flat [lo1, hi1, lo2, hi2, ...]
    const customBands = new Float32Array(nBands * 2);
    for (let b = 0; b < nBands; b++) {
      customBands[b * 2]     = bands[b]!.startHz;
      customBands[b * 2 + 1] = bands[b]!.endHz;
    }

    // coherence and asymmetry: not computed in SoraMynd scalp mode initially
    const coherence = new Float32Array(0);
    const asymmetry = new Float32Array(0);

    const zRaw = this.normEngine.zscore_qeeg(bandPower, coherence, asymmetry, customBands, age);
    if (!zRaw) return null;

    return { bandZ: zRaw, n_bands: nBands };
  }

  /**
   * Get Z-score for a specific channel label and band index.
   * Returns NaN if channel not in CHBMP or Z-score not available.
   */
  getChannelBandZ(result: ZScoreResult, label: string, bandIdx: number): number {
    const chbmpIdx = CHBMP_LABELS.indexOf(label as typeof CHBMP_LABELS[number]);
    if (chbmpIdx < 0) return NaN;
    return result.bandZ[chbmpIdx * result.n_bands + bandIdx] ?? NaN;
  }
}

export const qeegZScoreService = new QeegZScoreService(
  // Import at runtime to avoid circular dep; cast is safe because the interface matches
  require('./normEngineService').normEngineService,
);
```

> **Note on the `require`:** Replace with a proper import if your bundler complains. Alternative: pass `normEngineService` as a constructor argument from TrainingView.

Actually, use a lazy getter pattern to avoid circular deps:

```typescript
// Replace the bottom of qeegZScoreService.ts with:
let _service: QeegZScoreService | null = null;
export function getQeegZScoreService(): QeegZScoreService {
  if (!_service) {
    const { normEngineService } = require('./normEngineService') as typeof import('./normEngineService');
    _service = new QeegZScoreService(normEngineService);
  }
  return _service!;
}
```

- [ ] **Step 4: Fix the test to use the class directly (not the singleton)**

The test already uses `new QeegZScoreService(mockNormEngine as any)` — no change needed.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun test qeegZScoreService
```

Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/services/qeegZScoreService.ts web/src/services/__tests__/qeegZScoreService.test.ts
git commit -m "feat(p7): add QeegZScoreService with CHBMP label mapping"
```

---

## Task 4: Add Z-score mode to SoraMynd TrainingView

**Files:**
- Modify: `web/src/components/views/TrainingView.tsx`

SoraMynd's TrainingView uses `evalFormula(formula, liveBandPower, channelLabels)` to compute indicator values. In Z-score mode, we need to provide a `liveBandPowerZ` matrix where each cell contains the Z-score for that channel × band, so the same formula works unchanged.

- [ ] **Step 1: Read TrainingView to find evalFormula call and liveBandPower shape**

```bash
grep -n "evalFormula\|liveBandPower\|MetricMode\|zscore\|zScore" /Users/swryociao/NFB-Webapp/web/src/components/views/TrainingView.tsx | head -20
```

Identify: (1) where `liveBandPower` is set, (2) where `evalFormula` is called.

- [ ] **Step 2: Add Z-score DB definitions (identical to Poseidon)**

Find the constant section at the top of TrainingView.tsx. Add after the last constant block:

```typescript
// ── Z-Score DB options ──
const ZSCORE_DBS = [
  { id: 'chbmp_v1', label: 'CHBMP',    enabled: true  },
  { id: 'hbn_v1',   label: 'HBN',      enabled: false },
  { id: 'temple_u', label: 'TempleU',  enabled: false },
  { id: 'twn_v1',   label: 'TWN',      enabled: false },
] as const;

type MetricMode = 'power' | 'zscore';
```

- [ ] **Step 3: Add state variables to TrainingView component**

After the existing `useState` blocks near the top of the component function body, add:

```typescript
const [metricMode, setMetricMode] = useState<MetricMode>('power');
const [zScoreDb, setZScoreDb] = useState('chbmp_v1');
const [subjectAge, setSubjectAge] = useState(0);
const [zScoreResult, setZScoreResult] = useState<import('../../services/qeegZScoreService').ZScoreResult | null>(null);
```

- [ ] **Step 4: Add useEffect to compute Z-scores when liveBandPower updates**

Find the `useBandPower` hook call. After it, add:

```typescript
// Compute Z-scores whenever band power updates (only in zscore mode)
useEffect(() => {
  if (metricMode !== 'zscore' || subjectAge <= 0 || !liveBandPower) {
    setZScoreResult(null);
    return;
  }
  const { getQeegZScoreService } = require('../../services/qeegZScoreService') as typeof import('../../services/qeegZScoreService');
  const svc = getQeegZScoreService();
  const result = svc.computeZScores(liveBandPower, channelLabels as string[], NFB_BANDS, subjectAge);
  setZScoreResult(result);
}, [liveBandPower, metricMode, subjectAge, channelLabels]);
```

> **Note:** `NFB_BANDS` is already imported from `useBandPower` in SoraMynd's TrainingView.

- [ ] **Step 5: Build a Z-score band power matrix for evalFormula**

In Z-score mode, the formula evaluator should receive Z-scores instead of raw µV². Build a parallel matrix:

```typescript
// Derive the matrix to pass to evalFormula (power mode: raw µV², zscore mode: Z-scores)
const evalBandPower = useMemo(() => {
  if (metricMode === 'power' || !zScoreResult) return liveBandPower;
  // Build matrix same shape as liveBandPower but with Z-scores
  if (!liveBandPower) return null;
  const { getQeegZScoreService } = require('../../services/qeegZScoreService') as typeof import('../../services/qeegZScoreService');
  const svc = getQeegZScoreService();
  return liveBandPower.map((_, chIdx) => {
    const label = (channelLabels as string[])[chIdx] ?? '';
    return NFB_BANDS.map((_, bIdx) => {
      const z = svc.getChannelBandZ(zScoreResult, label, bIdx);
      return isNaN(z) ? 0 : z;
    });
  });
}, [liveBandPower, metricMode, zScoreResult, channelLabels]);
```

- [ ] **Step 6: Replace liveBandPower with evalBandPower in evalFormula calls**

Find every call to `evalFormula(formula, liveBandPower, ...)` and replace with `evalFormula(formula, evalBandPower, ...)`.

```bash
grep -n "evalFormula" /Users/swryociao/NFB-Webapp/web/src/components/views/TrainingView.tsx
```

There will be 2–3 call sites. Replace each `liveBandPower` argument with `evalBandPower`.

- [ ] **Step 7: Add mode toggle + Z-score DB card picker to the JSX**

Find the indicator card section in the JSX (search for the preset dropdown). Add a mode toggle before it:

```tsx
{/* Mode toggle */}
<div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
  {(['power', 'zscore'] as MetricMode[]).map(m => (
    <button
      key={m}
      onClick={() => {
        setMetricMode(m);
        if (m === 'zscore' && subjectAge > 0) {
          normEngineService.switchDb(zScoreDb).catch(console.warn);
        }
      }}
      disabled={m === 'zscore' && (subjectAge <= 0 || !normEngineService.isReady())}
      style={{
        flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
        border: `1px solid ${metricMode === m ? 'rgba(232,160,32,0.6)' : 'var(--border)'}`,
        background: metricMode === m ? 'var(--amber-bg-2)' : 'var(--bg-raised)',
        color: metricMode === m ? 'var(--amber)' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {m === 'power' ? '功率模式' : 'Z-Score 模式'}
    </button>
  ))}
</div>

{/* Z-Score DB card picker — only shown when zscore mode active */}
{metricMode === 'zscore' && (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
      Z-Score 資料庫
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {ZSCORE_DBS.map(db => (
        <button
          key={db.id}
          disabled={!db.enabled}
          onClick={() => {
            if (!db.enabled) return;
            setZScoreDb(db.id);
            if (subjectAge > 0) normEngineService.switchDb(db.id).catch(console.warn);
          }}
          style={{
            padding: '8px 10px', borderRadius: 7, textAlign: 'left',
            border: `1px solid ${zScoreDb === db.id ? 'rgba(232,160,32,0.6)' : 'var(--border)'}`,
            background: zScoreDb === db.id ? 'var(--amber-bg-2)' : 'var(--bg-raised)',
            color: !db.enabled ? 'rgba(100,115,135,0.4)' : zScoreDb === db.id ? 'var(--amber)' : 'var(--text-secondary)',
            cursor: db.enabled ? 'pointer' : 'default',
            fontSize: 12, fontWeight: 600,
          }}
        >
          {db.label}
        </button>
      ))}
    </div>
    {/* Age input */}
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>受測者年齡</span>
      <input
        type="number" min={5} max={100}
        value={subjectAge || ''}
        placeholder="—"
        onChange={e => {
          const age = Number(e.target.value);
          setSubjectAge(age);
          if (age > 0) normEngineService.switchDb(zScoreDb).catch(console.warn);
        }}
        style={{
          width: 56, padding: '2px 6px', borderRadius: 4,
          border: '1px solid var(--border)', background: 'var(--bg-raised)',
          color: 'var(--text-primary)', fontSize: 12,
        }}
      />
      {subjectAge === 0 && (
        <span style={{ fontSize: 11, color: 'var(--signal-warn)' }}>需填寫年齡</span>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 8: Add normEngineService import at the top of TrainingView**

```typescript
import { normEngineService } from '../../services/normEngineService';
```

- [ ] **Step 9: Build and verify no TypeScript errors**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run build 2>&1 | grep -E "error TS|Error" | head -20
```

Expected: No errors.

- [ ] **Step 10: Run all tests**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun test
```

Expected: All tests pass.

- [ ] **Step 11: Manual smoke test**

```bash
cd /Users/swryociao/NFB-Webapp/web && ~/.bun/bin/bun run dev
```

Open the app. Navigate to TrainingView. Verify:
- Mode toggle shows "功率模式 | Z-Score 模式"
- Switching to Z-Score mode shows DB cards (CHBMP enabled, others greyed)
- Age input shown; warning when empty
- After entering age + CHBMP selected → browser network tab shows request to `/api/norm-bin?db=chbmp_v1`
- With Z-Score mode ON, the indicator formula still evaluates (might show 0 in dev mode with all-zeros AES key)

- [ ] **Step 12: Commit**

```bash
cd /Users/swryociao/NFB-Webapp
git add web/src/components/views/TrainingView.tsx
git commit -m "feat(p7): add Z-score mode toggle + DB card picker + norm-engine wiring to SoraMynd TrainingView"
```

---

## Self-check before done

- [ ] `normEngineService.test.ts` — 4 tests pass
- [ ] `qeegZScoreService.test.ts` — 5 tests pass
- [ ] TrainingView — mode toggle visible, defaults to power mode
- [ ] TrainingView — Z-score mode shows DB cards + age input
- [ ] TrainingView — `evalBandPower` substitutes Z-scores when mode = zscore
- [ ] TrainingView — switching DB calls `normEngineService.switchDb()`
- [ ] `bun run build` — no TypeScript errors
- [ ] `bun test` — all tests pass
