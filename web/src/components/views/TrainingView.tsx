import { useEffect, useRef, useState, useCallback, type FC, type ChangeEvent } from 'react';
import type { EegPacket, FilterParams } from '../../types/eeg';
import { CHANNEL_LABELS } from '../../types/eeg';
import { useBandPower, NFB_BANDS } from '../../hooks/useBandPower';
import { DEFAULT_FILTER_PARAMS } from '../../types/eeg';

// ── Types ──────────────────────────────────────────────────────────────────

type Channel = typeof CHANNEL_LABELS[number];
type Band = 'Delta' | 'Theta' | 'Alpha' | 'SMR' | 'Beta' | 'Hi-Beta' | 'Gamma';
type Direction = 'up' | 'down';
type OscWaveform = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'white-noise' | 'ocean-waves';
type BnbMethod = 'global-ssb' | 'band-shift' | 'sub-layer';
type ModTrend = 'up' | 'down' | 'loop';

const CHANNELS: Channel[] = [...CHANNEL_LABELS];
const BANDS: Band[] = ['Delta', 'Theta', 'Alpha', 'SMR', 'Beta', 'Hi-Beta', 'Gamma'];

const BAND_BASE: Record<Band, number> = {
  Delta: 18, Theta: 22, Alpha: 28, SMR: 14, Beta: 12, 'Hi-Beta': 8, Gamma: 6,
};

const BNB_METHOD_DESC: Record<BnbMethod, string> = {
  'global-ssb': 'Single-sideband: both channels share one carrier, beat encoded as phase offset.',
  'band-shift': 'Each channel plays at base ± (beat/2) Hz for a pure frequency difference.',
  'sub-layer': 'Carrier hidden below audible range; beat modulates amplitude envelope.',
};

// 7 preset indicators (UI only, logic to be added later)
const PRESET_OPTIONS = [
  { value: '', label: '— 選擇預設 —' },
  { value: 'alpha_enhance',   label: '①  Alpha 增強 (Fz, α↑)' },
  { value: 'smr_enhance',     label: '②  SMR 增強 (Pz, SMR↑)' },
  { value: 'theta_suppress',  label: '③  Theta 抑制 (Fz, θ↓)' },
  { value: 'beta_enhance',    label: '④  Beta 增強 (Fp1, β↑)' },
  { value: 'hibeta_suppress', label: '⑤  Hi-Beta 抑制 (Fp1, HB↓)' },
  { value: 'gamma_enhance',   label: '⑥  Gamma 增強 (T8, γ↑)' },
  { value: 'delta_suppress',  label: '⑦  Delta 抑制 (Fz, δ↓)' },
];

interface EegIndicator {
  id: number;
  enabled: boolean;
  channel: Channel;
  band: Band;
  direction: Direction;
  value: number;
  threshold: number;
  autoThreshold: boolean;
  history: number[];
  formula: string;   // used by id=5 custom index
}

interface CardiacState {
  enabled: boolean;
  autoThreshold: boolean;
  lfValue: number;
  hfValue: number;
  lfHfRatio: number;
  direction: Direction;
  threshold: number;
  history: number[];
}

// ── Sub-components ──────────────────────────────────────────────────────────

const Badge: FC<{ label: string; color: string; bg: string }> = ({ label, color, bg }) => (
  <span style={{
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 600, color, background: bg, letterSpacing: '0.03em',
  }}>{label}</span>
);

// ── HistCanvas — fills container width, drag Y to adjust threshold ──────────

const HistCanvas: FC<{
  history: number[];
  threshold: number;
  height?: number;
  direction?: 'up' | 'down';
  onThresholdChange?: (delta: number) => void;
}> = ({ history, threshold, height = 42, direction = 'up', onThresholdChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(200);
  const dragRef = useRef<{ startY: number; startThresh: number; max: number } | null>(null);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 200;
      setCanvasWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width; const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (history.length < 2) return;
    const max = Math.max(...history, threshold * 1.1, 1);
    const barW = Math.floor(w / history.length);
    history.forEach((v, i) => {
      const barH = Math.round((v / max) * (h - 4));
      const met = direction === 'up' ? v >= threshold : v < threshold;
      ctx.fillStyle = direction === 'up'
        ? (met ? 'rgba(63,185,80,0.75)' : 'rgba(88,166,255,0.55)')
        : (met ? 'rgba(248,81,73,0.75)' : 'rgba(88,166,255,0.55)');
      ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
    });
    const ty = Math.round(h - (threshold / max) * (h - 4));
    ctx.strokeStyle = 'rgba(248,129,74,0.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([]);
  }, [history, threshold, canvasWidth, direction]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onThresholdChange) return;
    const max = Math.max(...history, threshold * 1.1, 1);
    dragRef.current = { startY: e.clientY, startThresh: threshold, max };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }, [history, threshold, onThresholdChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !onThresholdChange) return;
    const { startY, startThresh, max } = dragRef.current;
    const dy = e.clientY - startY;
    // drag up = decrease Y = increase threshold
    const delta = -dy * max / (height - 4);
    const newThresh = Math.max(0.5, startThresh + delta);
    onThresholdChange(newThresh - threshold);
  }, [onThresholdChange, threshold, height]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={height}
        style={{
          width: '100%', height, display: 'block', borderRadius: 4,
          cursor: onThresholdChange ? 'ns-resize' : 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {onThresholdChange && (
        <div style={{ fontSize: 10, color: 'rgba(248,129,74,0.55)', textAlign: 'center', marginTop: 2, userSelect: 'none' }}>
          ↕ 拖曳調整 threshold
        </div>
      )}
    </div>
  );
};

const LineCanvas: FC<{ history: number[]; threshold: number; color?: string }> = ({
  history, threshold, color = '#58a6ff',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width; const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (history.length < 2) return;
    const max = Math.max(...history, threshold * 1.2, 0.1);
    const range = max;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    history.forEach((v, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - (v / range) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    const ty = h - (threshold / range) * (h - 4) - 2;
    ctx.strokeStyle = 'rgba(248,129,74,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([]);
  }, [history, threshold, color]);
  return <canvas ref={canvasRef} width={178} height={50} style={{ width: 178, height: 50, display: 'block', borderRadius: 4 }} />;
};

const EegCard: FC<{
  indicator: EegIndicator;
  isLive: boolean;
  onToggle: (id: number) => void;
  onChannelChange: (id: number, ch: Channel) => void;
  onBandChange: (id: number, b: Band) => void;
  onDirectionChange: (id: number, d: Direction) => void;
  onThresholdChange: (id: number, delta: number) => void;
  onAutoThresholdToggle: (id: number) => void;
}> = ({ indicator, isLive, onToggle, onChannelChange, onBandChange, onDirectionChange, onThresholdChange, onAutoThresholdToggle }) => {
  const aboveThreshold = indicator.value >= indicator.threshold;
  const met = indicator.direction === 'up' ? aboveThreshold : !aboveThreshold;
  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 5,
    color: 'var(--text-primary)', fontSize: 12, padding: '3px 6px', cursor: 'pointer', flex: 1,
  };
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, opacity: indicator.enabled ? 1 : 0.55 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>EEG #{indicator.id}</span>
          {isLive
            ? <Badge label="LIVE" color="#3fb950" bg="rgba(63,185,80,0.15)" />
            : <Badge label="—" color="rgba(130,150,180,0.5)" bg="rgba(93,109,134,0.10)" />}
        </div>
        <button onClick={() => onToggle(indicator.id)} style={{ background: indicator.enabled ? 'rgba(63,185,80,0.2)' : 'rgba(100,115,135,0.2)', border: `1px solid ${indicator.enabled ? 'rgba(63,185,80,0.5)' : 'rgba(100,115,135,0.4)'}`, borderRadius: 5, color: indicator.enabled ? '#3fb950' : '#6b7580', fontSize: 11, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>
          {indicator.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Preset dropdown */}
      <div style={{ marginBottom: 8 }}>
        <select
          defaultValue=""
          onChange={() => { /* TODO: apply preset */ }}
          style={{ ...selectStyle, width: '100%', flex: 'unset' }}
        >
          {PRESET_OPTIONS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Channel + Band selectors */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <select value={indicator.channel} onChange={e => onChannelChange(indicator.id, e.target.value as Channel)} style={selectStyle}>
          {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
        </select>
        <select value={indicator.band} onChange={e => onBandChange(indicator.id, e.target.value as Band)} style={selectStyle}>
          {BANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Direction */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['up', 'down'] as Direction[]).map(d => (
          <button key={d} onClick={() => onDirectionChange(indicator.id, d)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)') : 'var(--border)'}`, background: indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)') : 'var(--bg-tertiary)', color: indicator.direction === d ? (d === 'up' ? '#3fb950' : '#f85149') : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {d === 'up' ? '↑ Up' : '↓ Down'}
          </button>
        ))}
      </div>

      {/* Value display */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: isLive ? '#8ecfff' : 'rgba(200,215,235,0.45)', fontWeight: 600 }}>
          {isLive ? indicator.value.toFixed(2) : '—'} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>μV²</span>
        </span>
        <Badge label={met ? 'ON' : 'OFF'} color={met ? '#3fb950' : '#f85149'} bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
      </div>

      {/* Histogram — drag Y to adjust threshold */}
      <div style={{ marginBottom: 4 }}>
        <HistCanvas
          history={indicator.history}
          threshold={indicator.threshold}
          direction={indicator.direction}
          onThresholdChange={indicator.autoThreshold ? undefined : (delta) => onThresholdChange(indicator.id, delta)}
        />
      </div>

      {/* Threshold input + Auto toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <input
          type="number"
          value={+indicator.threshold.toFixed(1)}
          onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v) && v > 0) onThresholdChange(indicator.id, v - indicator.threshold); }}
          disabled={indicator.autoThreshold}
          step={0.1} min={0.1}
          style={{ width: 72, background: 'var(--bg-tertiary)', border: `1px solid ${indicator.autoThreshold ? 'rgba(88,166,255,0.2)' : 'rgba(248,129,74,0.4)'}`, borderRadius: 4, color: indicator.autoThreshold ? 'rgba(88,166,255,0.4)' : 'rgba(248,129,74,0.9)', fontSize: 11, padding: '2px 5px', fontFamily: 'ui-monospace,monospace', textAlign: 'right', opacity: indicator.autoThreshold ? 0.5 : 1 }}
        />
        <button
          onClick={() => onAutoThresholdToggle(indicator.id)}
          style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 4,
            border: `1px solid ${indicator.autoThreshold ? 'rgba(88,166,255,0.5)' : 'rgba(93,109,134,0.4)'}`,
            background: indicator.autoThreshold ? 'rgba(88,166,255,0.15)' : 'var(--bg-tertiary)',
            color: indicator.autoThreshold ? '#58a6ff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          AUTO
        </button>
      </div>
    </div>
  );
};

// ── FormulaCard — EEG #5 custom index ──────────────────────────────────────

function evalFormula(formula: string, liveBandPower: number[][] | null): number | null {
  if (!liveBandPower || !formula.trim()) return null;
  // Tokenize: replace Ch_Band with values, then eval arithmetic
  const chNames = [...CHANNEL_LABELS];
  const bandNames = ['Delta', 'Theta', 'Alpha', 'SMR', 'Beta', 'HiBeta', 'Gamma'];
  const bandNameMap: Record<string, string> = {
    Delta: 'Delta', Theta: 'Theta', Alpha: 'Alpha', SMR: 'SMR',
    Beta: 'Beta', HiBeta: 'Hi-Beta', Gamma: 'Gamma',
  };
  // Build substitution map
  let expr = formula;
  for (const ch of chNames) {
    for (const bKey of bandNames) {
      const token = `${ch}_${bKey}`;
      if (expr.includes(token)) {
        const chIdx = chNames.indexOf(ch);
        const bName = bandNameMap[bKey]!;
        const bandIdx = NFB_BANDS.findIndex(b => b.name === bName);
        const val = (chIdx >= 0 && bandIdx >= 0) ? (liveBandPower[chIdx]?.[bandIdx] ?? 0) : 0;
        // Replace all occurrences
        expr = expr.split(token).join(String(val));
      }
    }
  }
  // Safety: only allow numbers, operators, parens, spaces, dots
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${expr})`)() as number;
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

const FormulaCard: FC<{
  indicator: EegIndicator;
  isLive: boolean;
  liveBandPower: number[][] | null;
  onToggle: (id: number) => void;
  onFormulaChange: (id: number, formula: string) => void;
  onThresholdChange: (id: number, delta: number) => void;
  onAutoThresholdToggle: (id: number) => void;
  onDirectionChange: (id: number, d: Direction) => void;
}> = ({ indicator, isLive, liveBandPower, onToggle, onFormulaChange, onThresholdChange, onAutoThresholdToggle, onDirectionChange }) => {
  const computedValue = isLive ? (evalFormula(indicator.formula, liveBandPower) ?? 0) : 0;
  const aboveThreshold = computedValue >= indicator.threshold;
  const met = indicator.direction === 'up' ? aboveThreshold : !aboveThreshold;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(88,166,255,0.25)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, opacity: indicator.enabled ? 1 : 0.55 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>EEG #5 <span style={{ color: 'rgba(88,166,255,0.6)', fontWeight: 400, fontSize: 11 }}>自定義指標</span></span>
          {isLive
            ? <Badge label="LIVE" color="#3fb950" bg="rgba(63,185,80,0.15)" />
            : <Badge label="—" color="rgba(130,150,180,0.5)" bg="rgba(93,109,134,0.10)" />}
        </div>
        <button onClick={() => onToggle(indicator.id)} style={{ background: indicator.enabled ? 'rgba(63,185,80,0.2)' : 'rgba(100,115,135,0.2)', border: `1px solid ${indicator.enabled ? 'rgba(63,185,80,0.5)' : 'rgba(100,115,135,0.4)'}`, borderRadius: 5, color: indicator.enabled ? '#3fb950' : '#6b7580', fontSize: 11, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>
          {indicator.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Formula input */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
          公式 (e.g. <code style={{ color: 'rgba(88,166,255,0.7)' }}>Fp1_Alpha / (Fp1_Alpha + Fp2_Theta)</code>)
        </div>
        <input
          type="text"
          value={indicator.formula}
          onChange={e => onFormulaChange(indicator.id, e.target.value)}
          placeholder="輸入公式…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 5, color: 'var(--text-primary)',
            fontSize: 12, padding: '5px 8px', fontFamily: 'ui-monospace,monospace',
          }}
        />
        <div style={{ fontSize: 10, color: 'rgba(93,109,134,0.6)', marginTop: 3 }}>
          頻道: Fp1 Fp2 T7 T8 O1 O2 Fz Pz &nbsp;·&nbsp; 頻帶: Delta Theta Alpha SMR Beta HiBeta Gamma
        </div>
      </div>

      {/* Direction */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['up', 'down'] as Direction[]).map(d => (
          <button key={d} onClick={() => onDirectionChange(indicator.id, d)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)') : 'var(--border)'}`, background: indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)') : 'var(--bg-tertiary)', color: indicator.direction === d ? (d === 'up' ? '#3fb950' : '#f85149') : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {d === 'up' ? '↑ Up' : '↓ Down'}
          </button>
        ))}
      </div>

      {/* Value */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: isLive ? '#8ecfff' : 'rgba(200,215,235,0.45)', fontWeight: 600 }}>
          {isLive ? computedValue.toFixed(3) : '—'}
        </span>
        <Badge label={met ? 'ON' : 'OFF'} color={met ? '#3fb950' : '#f85149'} bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
      </div>

      {/* Histogram */}
      <div style={{ marginBottom: 4 }}>
        <HistCanvas
          history={indicator.history}
          threshold={indicator.threshold}
          direction={indicator.direction}
          onThresholdChange={indicator.autoThreshold ? undefined : (delta) => onThresholdChange(indicator.id, delta)}
        />
      </div>

      {/* Threshold + Auto */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <input
          type="number"
          value={+indicator.threshold.toFixed(3)}
          onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v) && v > 0) onThresholdChange(indicator.id, v - indicator.threshold); }}
          disabled={indicator.autoThreshold}
          step={0.001} min={0.001}
          style={{ width: 80, background: 'var(--bg-tertiary)', border: `1px solid ${indicator.autoThreshold ? 'rgba(88,166,255,0.2)' : 'rgba(248,129,74,0.4)'}`, borderRadius: 4, color: indicator.autoThreshold ? 'rgba(88,166,255,0.4)' : 'rgba(248,129,74,0.9)', fontSize: 11, padding: '2px 5px', fontFamily: 'ui-monospace,monospace', textAlign: 'right', opacity: indicator.autoThreshold ? 0.5 : 1 }}
        />
        <button
          onClick={() => onAutoThresholdToggle(indicator.id)}
          style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 4,
            border: `1px solid ${indicator.autoThreshold ? 'rgba(88,166,255,0.5)' : 'rgba(93,109,134,0.4)'}`,
            background: indicator.autoThreshold ? 'rgba(88,166,255,0.15)' : 'var(--bg-tertiary)',
            color: indicator.autoThreshold ? '#58a6ff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          AUTO
        </button>
      </div>
    </div>
  );
};

// Cardiac card
const CardiacCard: FC<{
  state: CardiacState;
  isLive: boolean;
  liveHr: number | null;
  liveBreathing: number | null;
  onToggle: () => void;
  onDirectionChange: (d: Direction) => void;
  onThresholdChange: (delta: number) => void;
  onAutoThresholdToggle: () => void;
  onOpenVisioMynd: () => void;
}> = ({ state, isLive, liveHr, liveBreathing, onToggle, onDirectionChange, onThresholdChange, onAutoThresholdToggle, onOpenVisioMynd }) => {
  const ratio = state.lfHfRatio;
  const aboveThreshold = ratio >= state.threshold;
  const met = aboveThreshold === (state.direction === 'up');
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(88,166,255,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, opacity: state.enabled ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>Cardiac</span>
          {isLive
            ? <Badge label="LIVE" color="#3fb950" bg="rgba(63,185,80,0.15)" />
            : <Badge label="—" color="rgba(130,150,180,0.5)" bg="rgba(93,109,134,0.10)" />}
          <Badge label="LF/HF" color="#8ecfff" bg="rgba(88,166,255,0.15)" />
        </div>
        <button onClick={onToggle} style={{ background: state.enabled ? 'rgba(63,185,80,0.2)' : 'rgba(100,115,135,0.2)', border: `1px solid ${state.enabled ? 'rgba(63,185,80,0.5)' : 'rgba(100,115,135,0.4)'}`, borderRadius: 5, color: state.enabled ? '#3fb950' : '#6b7580', fontSize: 11, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>
          {state.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      {isLive && (liveHr !== null || liveBreathing !== null) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
          {liveHr !== null && <div><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>HR</span><div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>{liveHr} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>bpm</span></div></div>}
          {liveBreathing !== null && <div><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>呼吸</span><div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>{liveBreathing} <span style={{ fontSize: 11 }}>/min</span></div></div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        {([['LF', state.lfValue], ['HF', state.hfValue]] as [string, number][]).map(([k, v]) => (
          <div key={k}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k}</span><div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>{(v as number).toFixed(2)}</div></div>
        ))}
        <div style={{ flex: 1, textAlign: 'right' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LF/HF</span>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#f9a02e', fontWeight: 600 }}>{isLive ? ratio.toFixed(2) : '—'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['up', 'down'] as Direction[]).map(d => (
          <button key={d} onClick={() => onDirectionChange(d)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${state.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)') : 'var(--border)'}`, background: state.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)') : 'var(--bg-tertiary)', color: state.direction === d ? (d === 'up' ? '#3fb950' : '#f85149') : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {d === 'up' ? '↑ Up' : '↓ Down'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: isLive ? '#8ecfff' : 'rgba(200,215,235,0.45)', fontWeight: 600 }}>
          {isLive ? ratio.toFixed(2) : '—'}
        </span>
        <Badge label={met ? '達標' : '未達標'} color={met ? '#3fb950' : '#f85149'} bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
      </div>
      <div style={{ marginBottom: 4 }}>
        <HistCanvas
          history={state.history}
          threshold={state.threshold}
          direction={state.direction}
          onThresholdChange={state.autoThreshold ? undefined : (delta) => onThresholdChange(delta)}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', marginBottom: 6 }}>
        <input
          type="number"
          value={+state.threshold.toFixed(2)}
          onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v) && v > 0) onThresholdChange(v - state.threshold); }}
          disabled={state.autoThreshold}
          step={0.1} min={0.1}
          style={{ width: 72, background: 'var(--bg-tertiary)', border: `1px solid ${state.autoThreshold ? 'rgba(88,166,255,0.2)' : 'rgba(248,129,74,0.4)'}`, borderRadius: 4, color: state.autoThreshold ? 'rgba(88,166,255,0.4)' : 'rgba(248,129,74,0.9)', fontSize: 11, padding: '2px 5px', fontFamily: 'ui-monospace,monospace', textAlign: 'right', opacity: state.autoThreshold ? 0.5 : 1 }}
        />
        <button
          onClick={onAutoThresholdToggle}
          style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: `1px solid ${state.autoThreshold ? 'rgba(88,166,255,0.5)' : 'rgba(93,109,134,0.4)'}`, background: state.autoThreshold ? 'rgba(88,166,255,0.15)' : 'var(--bg-tertiary)', color: state.autoThreshold ? '#58a6ff' : 'var(--text-secondary)', cursor: 'pointer' }}
        >
          AUTO
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onOpenVisioMynd} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(88,166,255,0.4)', background: 'rgba(88,166,255,0.1)', color: '#8ecfff', cursor: 'pointer' }}>
          🔗 Open VisioMynd
        </button>
      </div>
    </div>
  );
};

// ── Progress gauge ─────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

const ProgressGauge: FC<{ score: number }> = ({ score }) => {
  const r = 52; const cx = 70; const cy = 70;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const color = `hsl(${lerp(0, 120, score / 100)}, 75%, 52%)`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={140} height={140} style={{ overflow: 'visible' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(93,109,134,0.2)" strokeWidth={10} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${filled} ${circ - filled}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }} />
        <text x={cx} y={cy + 6} textAnchor="middle" style={{ fill: '#dce9f8', fontSize: 24, fontWeight: 700, fontFamily: 'ui-monospace,monospace' }}>{score}%</text>
        <text x={cx} y={cy + 22} textAnchor="middle" style={{ fill: 'var(--text-secondary)', fontSize: 11 }}>Overall</text>
      </svg>
    </div>
  );
};

// ── BNB Column ─────────────────────────────────────────────────────────────

interface BnbState {
  audioFileName: string;
  playState: 'stopped' | 'playing' | 'paused';
  progress: number;
  volume: number;
  oscEnabled: boolean;
  oscWaveform: OscWaveform;
  oscFreq: number;
  oscVolume: number;
  bbFixed: boolean;
  bbMinHz: number;
  bbMaxHz: number;
  bbCurrentHz: number;
  bnbMethod: BnbMethod;
  bandLowHz: number;
  bandHighHz: number;
  subLayerCarrierHz: number;
  modEnabled: boolean;
  modInterval: number;
  modStep: number;
  modTrend: ModTrend;
  loopDir: 1 | -1;
}

const DEFAULT_BNB: BnbState = {
  audioFileName: '',
  playState: 'stopped',
  progress: 0,
  volume: 70,
  oscEnabled: false,
  oscWaveform: 'sine',
  oscFreq: 440,
  oscVolume: 50,
  bbFixed: false,
  bbMinHz: 4,
  bbMaxHz: 12,
  bbCurrentHz: 8,
  bnbMethod: 'global-ssb',
  bandLowHz: 150,
  bandHighHz: 400,
  subLayerCarrierHz: 400,
  modEnabled: false,
  modInterval: 500,
  modStep: 0.5,
  modTrend: 'loop',
  loopDir: 1,
};

const BNB_BANDS: { label: string; sym: string; min: number; max: number }[] = [
  { label: 'Delta', sym: 'δ', min: 0.5, max: 4 },
  { label: 'Theta', sym: 'θ', min: 4,   max: 8 },
  { label: 'Alpha', sym: 'α', min: 8,   max: 13 },
  { label: 'Beta',  sym: 'β', min: 13,  max: 30 },
  { label: 'Gamma', sym: 'γ', min: 30,  max: 45 },
];

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 5,
  color: 'var(--text-primary)', fontSize: 12, padding: '4px 7px', width: '100%', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3, display: 'block' };
const subHeaderStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '10px 0 6px', borderBottom: '1px solid rgba(93,109,134,0.2)', paddingBottom: 3 };

const BnbColumn: FC<{ bnb: BnbState; onChange: (patch: Partial<BnbState>) => void }> = ({ bnb, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // ── Web Audio ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const leftOscRef = useRef<OscillatorNode | null>(null);
  const rightOscRef = useRef<OscillatorNode | null>(null);
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const oscGainRef = useRef<GainNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const stopOscNodes = useCallback(() => {
    const s = (n: { stop: () => void } | null) => { try { n?.stop(); } catch {} };
    s(leftOscRef.current); s(rightOscRef.current);
    s(noiseSourceRef.current); s(lfoRef.current);
    leftOscRef.current = rightOscRef.current = noiseSourceRef.current = lfoRef.current = null;
    oscGainRef.current?.disconnect(); oscGainRef.current = null;
  }, []);

  // Start/stop oscillator when enabled or waveform changes
  useEffect(() => {
    if (!bnb.oscEnabled) { stopOscNodes(); return; }
    const ctx = getCtx();
    stopOscNodes();
    const gain = ctx.createGain();
    gain.gain.value = bnb.oscVolume / 100;
    gain.connect(ctx.destination);
    oscGainRef.current = gain;
    // Snapshot current values to avoid stale reads
    const wf = bnb.oscWaveform;
    const freq = bnb.oscFreq;
    const beat = bnb.bbCurrentHz;
    if (wf === 'white-noise') {
      const buf = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      src.connect(gain); src.start(); noiseSourceRef.current = src;
    } else if (wf === 'ocean-waves') {
      const buf = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 600; filter.Q.value = 0.7;
      const waveGain = ctx.createGain(); waveGain.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain); lfoGain.connect(waveGain.gain);
      noise.connect(filter); filter.connect(waveGain); waveGain.connect(gain);
      lfo.start(); noise.start();
      noiseSourceRef.current = noise; lfoRef.current = lfo;
    } else {
      // Binaural: left = freq - beat/2, right = freq + beat/2
      const lo = ctx.createOscillator(); const ro = ctx.createOscillator();
      lo.type = ro.type = wf as OscillatorType;
      lo.frequency.value = Math.max(20, freq - beat / 2);
      ro.frequency.value = Math.max(20, freq + beat / 2);
      const lp = ctx.createStereoPanner(); lp.pan.value = -1;
      const rp = ctx.createStereoPanner(); rp.pan.value = 1;
      lo.connect(lp); lp.connect(gain);
      ro.connect(rp); rp.connect(gain);
      lo.start(); ro.start();
      leftOscRef.current = lo; rightOscRef.current = ro;
    }
    return stopOscNodes;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bnb.oscEnabled, bnb.oscWaveform, getCtx, stopOscNodes]);

  // Smooth binaural frequency update without full restart
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !leftOscRef.current || !rightOscRef.current) return;
    const t = ctx.currentTime;
    leftOscRef.current.frequency.setTargetAtTime(Math.max(20, bnb.oscFreq - bnb.bbCurrentHz / 2), t, 0.05);
    rightOscRef.current.frequency.setTargetAtTime(Math.max(20, bnb.oscFreq + bnb.bbCurrentHz / 2), t, 0.05);
  }, [bnb.bbCurrentHz, bnb.oscFreq]);

  // Oscillator volume without restart
  useEffect(() => {
    if (!oscGainRef.current || !audioCtxRef.current) return;
    oscGainRef.current.gain.setTargetAtTime(bnb.oscVolume / 100, audioCtxRef.current.currentTime, 0.05);
  }, [bnb.oscVolume]);

  // Audio element playback
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    el.volume = bnb.volume / 100;
    if (bnb.playState === 'playing') el.play().catch(() => {});
    else if (bnb.playState === 'paused') el.pause();
    else { el.pause(); el.currentTime = 0; }
  }, [bnb.playState, bnb.volume]);

  // Cleanup
  useEffect(() => () => {
    stopOscNodes();
    audioCtxRef.current?.close().catch(() => {});
    audioElRef.current?.pause();
  }, [stopOscNodes]);

  const handleFile = (file: File) => {
    if (!audioElRef.current) {
      const el = new Audio();
      el.addEventListener('ended', () => onChangeRef.current({ playState: 'stopped' }));
      el.addEventListener('timeupdate', () => {
        if (!el.duration) return;
        onChangeRef.current({ progress: Math.round(el.currentTime / el.duration * 100) });
      });
      audioElRef.current = el;
    }
    audioElRef.current.src = URL.createObjectURL(file);
    onChange({ audioFileName: file.name, playState: 'stopped', progress: 0 });
  };

  const formatHz = (v: number) => v < 10 ? v.toFixed(2) : v.toFixed(1);

  return (
    <div style={{ flex: 1, padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#8ecfff' }}>BNB Controls</span>
        <Badge label="Binaural Beat" color="#8ecfff" bg="rgba(88,166,255,0.15)" />
      </div>

      {/* Audio File + Playback on same row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'stretch' }}>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          style={{
            flex: 1, border: `1px dashed ${dragging ? '#58a6ff' : 'rgba(93,109,134,0.4)'}`,
            borderRadius: 7, padding: '7px 8px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? 'rgba(88,166,255,0.07)' : 'var(--bg-tertiary)',
            transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: bnb.audioFileName ? '#58a6ff' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
            {bnb.audioFileName || '+ Audio File'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {([['▶', 'playing'], ['⏸', 'paused'], ['⏹', 'stopped']] as [string, BnbState['playState']][]).map(([icon, state]) => (
            <button key={state} onClick={() => onChange({ playState: state })}
              style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${bnb.playState === state ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.playState === state ? 'rgba(88,166,255,0.2)' : 'var(--bg-tertiary)', color: bnb.playState === state ? '#8ecfff' : 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {icon}
            </button>
          ))}
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept=".wav,.mp3,audio/*" style={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace,monospace' }}>
            {Math.floor(bnb.progress / 100 * 300 / 60)}:{String(Math.floor(bnb.progress / 100 * 300) % 60).padStart(2,'0')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace,monospace' }}>5:00</span>
        </div>
        <input type="range" min={0} max={100} value={bnb.progress}
          onChange={e => onChange({ progress: parseInt(e.target.value) })}
          style={{ width: '100%', accentColor: '#58a6ff' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Vol</span>
        <input type="range" min={0} max={100} value={bnb.volume}
          onChange={e => onChange({ volume: parseInt(e.target.value) })}
          style={{ flex: 1, accentColor: '#3fb950' }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace,monospace', width: 34, textAlign: 'right' }}>{bnb.volume}%</span>
      </div>

      {/* Oscillator Source */}
      <div style={subHeaderStyle as React.CSSProperties}>Oscillator Source</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={bnb.oscEnabled} onChange={e => onChange({ oscEnabled: e.target.checked })} style={{ accentColor: '#58a6ff' }} />
        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>Enable Oscillator</span>
      </label>
      <div style={{ opacity: bnb.oscEnabled ? 1 : 0.45, transition: 'opacity 0.15s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <span style={labelStyle}>Waveform</span>
            <select value={bnb.oscWaveform} onChange={e => onChange({ oscWaveform: e.target.value as OscWaveform })}
              style={{ ...inputStyle, padding: '3px 6px' }} disabled={!bnb.oscEnabled}>
              {(['sine', 'square', 'triangle', 'sawtooth', 'white-noise', 'ocean-waves'] as OscWaveform[]).map(w => (
                <option key={w} value={w}>{w === 'white-noise' ? 'White Noise' : w === 'ocean-waves' ? 'Ocean Waves' : w.charAt(0).toUpperCase() + w.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Freq (Hz)</span>
            <input type="number" min={20} max={20000} value={bnb.oscFreq}
              onChange={e => onChange({ oscFreq: parseFloat(e.target.value) || 440 })}
              style={inputStyle} disabled={!bnb.oscEnabled || bnb.oscWaveform === 'white-noise' || bnb.oscWaveform === 'ocean-waves'} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Osc Vol</span>
          <input type="range" min={0} max={100} value={bnb.oscVolume}
            onChange={e => onChange({ oscVolume: parseInt(e.target.value) })}
            style={{ flex: 1, accentColor: '#f9a02e' }} disabled={!bnb.oscEnabled} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace,monospace', width: 34, textAlign: 'right' }}>{bnb.oscVolume}%</span>
        </div>
      </div>

      {/* Binaural Beat Frequency */}
      <div style={subHeaderStyle as React.CSSProperties}>Binaural Beat Frequency</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', flex: 1 }}>
          <input type="checkbox" checked={bnb.bbFixed} onChange={e => onChange({ bbFixed: e.target.checked })} style={{ accentColor: '#58a6ff' }} />
          <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>Fixed Frequency</span>
        </label>
        {bnb.bbFixed && (
          <input type="number" min={0.5} max={100} step={0.5} value={bnb.bbCurrentHz}
            onChange={e => onChange({ bbCurrentHz: parseFloat(e.target.value) || 8 })}
            style={{ ...inputStyle, width: 70, textAlign: 'right' }} />
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8, opacity: bnb.bbFixed ? 0.35 : 1, pointerEvents: bnb.bbFixed ? 'none' : 'auto' }}>
        <div>
          <span style={labelStyle}>Min Hz</span>
          <input type="number" min={0.5} max={100} step={0.5} value={bnb.bbMinHz}
            onChange={e => onChange({ bbMinHz: parseFloat(e.target.value) || 0.5 })}
            style={inputStyle} disabled={bnb.bbFixed} />
        </div>
        <div>
          <span style={labelStyle}>Max Hz</span>
          <input type="number" min={0.5} max={100} step={0.5} value={bnb.bbMaxHz}
            onChange={e => onChange({ bbMaxHz: parseFloat(e.target.value) || 1 })}
            style={inputStyle} disabled={bnb.bbFixed} />
        </div>
      </div>
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 7, padding: '7px 10px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Current Beat</span>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 16, fontWeight: 700, color: '#58a6ff' }}>{formatHz(bnb.bbCurrentHz)} Hz</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        {BNB_BANDS.map(b => (
          <button key={b.label} onClick={() => onChange({ bbMinHz: b.min, bbMaxHz: b.max, bbCurrentHz: (b.min + b.max) / 2, bbFixed: false })}
            style={{ padding: '3px 7px', borderRadius: 5, border: `1px solid ${bnb.bbCurrentHz >= b.min && bnb.bbCurrentHz < b.max ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.bbCurrentHz >= b.min && bnb.bbCurrentHz < b.max ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: bnb.bbCurrentHz >= b.min && bnb.bbCurrentHz < b.max ? '#8ecfff' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {b.sym} {b.label}
          </button>
        ))}
      </div>

      {/* Binaural Method */}
      <div style={subHeaderStyle as React.CSSProperties}>Binaural Method</div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
        {([['global-ssb', 'Global SSB'], ['band-shift', 'Band-Shift'], ['sub-layer', 'Sub-Layer']] as [BnbMethod, string][]).map(([id, label]) => (
          <button key={id} onClick={() => onChange({ bnbMethod: id })}
            style={{ flex: 1, padding: '5px 4px', borderRadius: 6, border: `1px solid ${bnb.bnbMethod === id ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.bnbMethod === id ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: bnb.bnbMethod === id ? '#8ecfff' : 'var(--text-secondary)', fontSize: 10, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-tertiary)', borderRadius: 6, padding: '7px 9px', marginBottom: 6 }}>
        {BNB_METHOD_DESC[bnb.bnbMethod]}
      </div>
      {/* Method-specific sub-options */}
      {bnb.bnbMethod === 'band-shift' && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>Carrier Band</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {([
              { label: '150–400', low: 150, high: 400, name: '標準建議' },
              { label: '100–250', low: 100, high: 250, name: '低頻共鳴' },
              { label: '200–600', low: 200, high: 600, name: '中頻核心' },
              { label: '300–700', low: 300, high: 700, name: '高清晰度' },
            ] as { label: string; low: number; high: number; name: string }[]).map(p => {
              const active = bnb.bandLowHz === p.low && bnb.bandHighHz === p.high;
              return (
                <button key={p.label}
                  onClick={() => onChange({ bandLowHz: p.low, bandHighHz: p.high, oscFreq: Math.round((p.low + p.high) / 2) })}
                  style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${active ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: active ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: active ? '#8ecfff' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {p.label} <span style={{ fontSize: 10, opacity: 0.7 }}>({p.name})</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {bnb.bnbMethod === 'sub-layer' && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>Carrier Freq</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {([
              { hz: 140, name: '驅動感' },
              { hz: 200, name: '標準' },
              { hz: 250, name: '清晰' },
              { hz: 400, name: '最佳同步★' },
            ] as { hz: number; name: string }[]).map(p => {
              const active = bnb.subLayerCarrierHz === p.hz;
              return (
                <button key={p.hz}
                  onClick={() => onChange({ subLayerCarrierHz: p.hz, oscFreq: p.hz })}
                  style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${active ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: active ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: active ? '#8ecfff' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {p.hz} Hz <span style={{ fontSize: 10, opacity: 0.7 }}>({p.name})</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Modulation */}
      <div style={subHeaderStyle as React.CSSProperties}>Modulation</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={bnb.modEnabled} onChange={e => onChange({ modEnabled: e.target.checked })} style={{ accentColor: '#58a6ff' }} />
        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>Enable Modulation</span>
      </label>
      <div style={{ opacity: bnb.modEnabled ? 1 : 0.4, transition: 'opacity 0.15s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <span style={labelStyle}>Interval (ms)</span>
            <input type="number" min={50} max={5000} step={50} value={bnb.modInterval}
              onChange={e => onChange({ modInterval: parseInt(e.target.value) || 500 })}
              style={inputStyle} disabled={!bnb.modEnabled} />
          </div>
          <div>
            <span style={labelStyle}>Step (Hz)</span>
            <input type="number" min={0.1} max={5} step={0.1} value={bnb.modStep}
              onChange={e => onChange({ modStep: parseFloat(e.target.value) || 0.5 })}
              style={inputStyle} disabled={!bnb.modEnabled} />
          </div>
        </div>
        <div>
          <span style={labelStyle}>Trend</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['up', 'down', 'loop'] as ModTrend[]).map(t => (
              <button key={t} onClick={() => onChange({ modTrend: t })} disabled={!bnb.modEnabled}
                style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${bnb.modTrend === t ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.modTrend === t ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: bnb.modTrend === t ? '#8ecfff' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                {t === 'up' ? '↑' : t === 'down' ? '↓' : '↺'} {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main TrainingView ──────────────────────────────────────────────────────

const HISTORY_LEN = 60;

// 活躍度 (Activity): K constant for OO = K * sqrt(AT)
const K_VALUES = [16.67, 14.29, 12.70, 11.55, 10.66] as const;
const DIFFICULTY_LABELS = ['很容易', '容易', '中等', '困難', '很困難'] as const;

// 持續度 (Persistence): moving-window size in seconds
const W_VALUES = [5, 8, 12, 17, 23] as const;
const PERSISTENCE_LABELS = ['5 秒', '8 秒', '12 秒', '17 秒', '23 秒'] as const;

/** RMS of an array; returns 0 if empty */
function computeRMS(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((acc, v) => acc + v * v, 0) / values.length);
}

function makeDefaultIndicators(): EegIndicator[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    enabled: i < 2,
    channel: CHANNELS[i % CHANNELS.length]!,
    band: BANDS[i % BANDS.length]!,
    direction: 'up' as Direction,
    value: 0,
    threshold: BAND_BASE[BANDS[i % BANDS.length]!]! * 1.2,
    autoThreshold: false,
    history: [],
    formula: i === 4 ? 'Fp1_Alpha / (Fp1_Alpha + Fp2_Theta)' : '',
  }));
}

export interface TrainingViewProps {
  packets?: EegPacket[];
  filterParams?: FilterParams;
  hidden?: boolean;
}

export const TrainingView: FC<TrainingViewProps> = ({ packets, filterParams, hidden }) => {
  const liveBandPower = useBandPower(packets, filterParams ?? DEFAULT_FILTER_PARAMS);
  // Ref for stale-closure-safe access inside tick
  const liveBandPowerRef = useRef(liveBandPower);
  useEffect(() => { liveBandPowerRef.current = liveBandPower; }, [liveBandPower]);

  const isLive = liveBandPower !== null && (packets?.length ?? 0) > 0;

  const [indicators, setIndicators] = useState<EegIndicator[]>(makeDefaultIndicators);
  const [cardiac, setCardiac] = useState<CardiacState>({
    enabled: true,
    autoThreshold: false,
    lfValue: 0, hfValue: 0, lfHfRatio: 0,
    direction: 'up', threshold: 1.5, history: [],
  });
  const [bnb, setBnb] = useState<BnbState>(DEFAULT_BNB);

  // VisioMynd live cardiac data
  const [visioMyndLive, setVisioMyndLive] = useState(false);
  const [visioMyndHr, setVisioMyndHr] = useState<number | null>(null);
  const [visioMyndBreathing, setVisioMyndBreathing] = useState<number | null>(null);
  const [visioMyndLfhf, setVisioMyndLfhf] = useState<number | null>(null);
  const visioMyndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'visiomynd_data') return;
      const { hr, breathing, lfhf } = e.data as { hr: number | null; breathing: number | null; lfhf: number | null };
      setVisioMyndHr(hr ?? null);
      setVisioMyndBreathing(breathing ?? null);
      setVisioMyndLfhf(lfhf ?? null);
      setVisioMyndLive(true);
      if (visioMyndTimeoutRef.current) clearTimeout(visioMyndTimeoutRef.current);
      visioMyndTimeoutRef.current = setTimeout(() => setVisioMyndLive(false), 5000);
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (visioMyndTimeoutRef.current) clearTimeout(visioMyndTimeoutRef.current);
    };
  }, []);

  const visioMyndWindowRef = useRef<Window | null>(null);
  const handleOpenVisioMynd = useCallback(() => {
    if (visioMyndWindowRef.current && !visioMyndWindowRef.current.closed) {
      visioMyndWindowRef.current.focus();
      return;
    }
    visioMyndWindowRef.current = window.open('https://www.sigmacog.xyz/visiomynd', 'visiomynd_window', 'width=1280,height=800,resizable=yes');
  }, []);

  // Session
  const [sessionRunning, setSessionRunning] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [targetAchievementPct, setTargetAchievementPct] = useState(0);
  const [rewardRate, setRewardRate] = useState(0);
  const [feedbackUrl, setFeedbackUrl] = useState('');
  const [operatorNotes, setOperatorNotes] = useState('');
  const [overallScore, setOverallScore] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [difficultyLevel, setDifficultyLevel] = useState(3); // 1–5 活躍度
  const [persistenceLevel, setPersistenceLevel] = useState(1); // 1–5 持續度
  const persistenceLevelRef = useRef(1);
  useEffect(() => { persistenceLevelRef.current = persistenceLevel; }, [persistenceLevel]);

  const [taMode, setTaMode] = useState<'and' | 'average'>('and');
  const taModeRef = useRef<'and' | 'average'>('and');
  useEffect(() => { taModeRef.current = taMode; }, [taMode]);

  // TA: sliding window of per-tick fractions (0/1 for AND, metCount/total for Average), capped at max W=23
  const taWindowRef = useRef<number[]>([]);
  // Session history: per-tick fractions since session start (for Reward Rate + Overall)
  const sessionHistoryRef = useRef<number[]>([]);

  const feedbackWindowRef = useRef<Window | null>(null);

  const sendToFeedbackWindow = useCallback((data: Record<string, unknown>) => {
    const win = feedbackWindowRef.current;
    if (win && !win.closed) win.postMessage(data, '*');
  }, []);

  const applyOverlay = useCallback((opacityPct: number) => {
    // OO=100 → overlay transparent (content visible); OO=0 → overlay opaque (black)
    sendToFeedbackWindow({ type: 'nfb_overlay', opacity: 1 - opacityPct / 100 });
  }, [sendToFeedbackWindow]);

  // Auto-compute overlay opacity from TA: OO = K * sqrt(TA), clamped 0–100
  // Runs always so dashboard shows live OO; applyOverlay only affects feedback window (no-op when closed)
  useEffect(() => {
    const k = K_VALUES[difficultyLevel - 1]!;
    const oo = Math.max(0, Math.min(100, Math.round(k * Math.sqrt(targetAchievementPct))));
    setOverlayOpacity(oo);
    if (sessionRunning) applyOverlay(oo);
  }, [targetAchievementPct, difficultyLevel, sessionRunning, applyOverlay]);

  // Lookup live band power via ref (avoids stale closure)
  const getLiveBandPower = useCallback((channel: Channel, band: Band): number | null => {
    const bp = liveBandPowerRef.current;
    if (!bp) return null;
    const chIdx = CHANNEL_LABELS.indexOf(channel as typeof CHANNEL_LABELS[number]);
    const bandIdx = NFB_BANDS.findIndex(b => b.name === band);
    if (chIdx < 0 || bandIdx < 0) return null;
    return bp[chIdx]?.[bandIdx] ?? null;
  }, []); // stable — reads via ref

  // ── Tick: update values from live EEG data only ──
  const sessionRunningRef = useRef(sessionRunning);
  const sessionDurationRef = useRef(sessionDuration);
  useEffect(() => { sessionRunningRef.current = sessionRunning; }, [sessionRunning]);
  useEffect(() => { sessionDurationRef.current = sessionDuration; }, [sessionDuration]);

  const sendToFeedbackWindowRef = useRef(sendToFeedbackWindow);
  useEffect(() => { sendToFeedbackWindowRef.current = sendToFeedbackWindow; }, [sendToFeedbackWindow]);

  useEffect(() => {
    const interval = setInterval(() => {
      // EEG indicators — only update when live data available
      setIndicators(prev => prev.map(ind => {
        if (!ind.enabled) return ind;
        let newVal: number;
        if (ind.id === 5) {
          // Formula card: eval using liveBandPowerRef
          newVal = evalFormula(ind.formula, liveBandPowerRef.current) ?? ind.value;
        } else {
          const live = getLiveBandPower(ind.channel, ind.band);
          if (live === null) {
            const newHistory = [...ind.history, ind.value].slice(-HISTORY_LEN);
            const newThreshold = ind.autoThreshold
              ? (computeRMS(newHistory.slice(-W_VALUES[persistenceLevelRef.current - 1])) || ind.threshold)
              : ind.threshold;
            return { ...ind, history: newHistory, threshold: newThreshold };
          }
          newVal = live;
        }
        const newHistory = [...ind.history, newVal].slice(-HISTORY_LEN);
        const newThreshold = ind.autoThreshold
          ? (computeRMS(newHistory.slice(-W_VALUES[persistenceLevelRef.current - 1])) || ind.threshold)
          : ind.threshold;
        return { ...ind, value: newVal, history: newHistory, threshold: newThreshold };
      }));

      // Cardiac — only update if VisioMynd live
      setCardiac(c => {
        if (!c.enabled) return c;
        const W = W_VALUES[persistenceLevelRef.current - 1];
        if (visioMyndLive && visioMyndLfhf !== null) {
          const next = visioMyndLfhf;
          const newHistory = [...c.history, next].slice(-HISTORY_LEN);
          const newThreshold = c.autoThreshold
            ? (computeRMS(newHistory.slice(-W)) || c.threshold)
            : c.threshold;
          return {
            ...c, lfHfRatio: next,
            lfValue: next * 0.7 + 0.1, hfValue: Math.max(0.05, 0.7 - next * 0.05 + 0.1),
            history: newHistory, threshold: newThreshold,
          };
        }
        // Not live — keep previous, just extend history
        const newHistory = [...c.history, c.lfHfRatio].slice(-HISTORY_LEN);
        const newThreshold = c.autoThreshold
          ? (computeRMS(newHistory.slice(-W)) || c.threshold)
          : c.threshold;
        return { ...c, history: newHistory, threshold: newThreshold };
      });

      // BNB: drift bbCurrentHz when not fixed
      setBnb(b => {
        if (b.bbFixed) return b;
        const range = b.bbMaxHz - b.bbMinHz;
        if (range <= 0) return b;
        if (!b.modEnabled) return b;
        if (b.modTrend === 'loop') {
          let dir = b.loopDir;
          let next = b.bbCurrentHz + b.modStep * dir * 0.1;
          if (next >= b.bbMaxHz) { next = b.bbMaxHz; dir = -1; }
          else if (next <= b.bbMinHz) { next = b.bbMinHz; dir = 1; }
          return { ...b, bbCurrentHz: next, loopDir: dir };
        }
        const step = b.modStep * (b.modTrend === 'up' ? 1 : -1);
        return { ...b, bbCurrentHz: Math.max(b.bbMinHz, Math.min(b.bbMaxHz, b.bbCurrentHz + step * 0.1)) };
      });

      // TA & session stats — runs every second from tab entry
      setIndicators(current => {
        const enabled = current.filter(i => i.enabled);
        const totalEnabled = enabled.length;
        const metCount = totalEnabled > 0
          ? enabled.filter(i => i.direction === 'up' ? i.value >= i.threshold : i.value < i.threshold).length
          : 0;
        // AND: all indicators must meet → 1 or 0; Average: fraction of met indicators
        const tickFraction = totalEnabled === 0 ? 0
          : taModeRef.current === 'and'
            ? (metCount === totalEnabled ? 1 : 0)
            : metCount / totalEnabled;

        // Sliding window TA: mean of per-tick fractions over last W seconds × 100%
        taWindowRef.current.push(tickFraction);
        if (taWindowRef.current.length > 23) taWindowRef.current.shift();
        const W = W_VALUES[persistenceLevelRef.current - 1];
        const win = taWindowRef.current.slice(-W);
        const taPct = win.length > 0
          ? Math.round(win.reduce((a, b) => a + b, 0) / win.length * 100)
          : 0;
        setTargetAchievementPct(taPct);

        if (sessionRunningRef.current) {
          sessionHistoryRef.current.push(tickFraction);
          const sh = sessionHistoryRef.current;
          const sessionLen = sh.length;

          // Overall: mean fraction across entire session × 100%
          const overallPct = Math.round(sh.reduce((a, b) => a + b, 0) / sessionLen * 100);
          setOverallScore(overallPct);

          // Reward Rate: % of complete W-second windows where mean fraction ≥ 50%
          const completeWindows = Math.floor(sessionLen / W);
          if (completeWindows > 0) {
            let rewardCount = 0;
            for (let wi = 0; wi < completeWindows; wi++) {
              const slice = sh.slice(wi * W, (wi + 1) * W);
              if (slice.reduce((a, b) => a + b, 0) / slice.length >= 0.5) rewardCount++;
            }
            setRewardRate(Math.round(rewardCount / completeWindows * 100));
          }

          sendToFeedbackWindowRef.current({ type: 'nfb_status', pct: taPct, duration: sessionDurationRef.current });
        }
        return current;
      });

      // Session duration counter
      if (sessionRunningRef.current) {
        setSessionDuration(d => d + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getLiveBandPower, visioMyndLive, visioMyndLfhf]);

  // ── Open feedback window ──
  const openFeedbackWindow = useCallback((rawUrl: string) => {
    // Auto-convert YouTube watch/short URLs to embeddable format
    const url = rawUrl
      .replace(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\s]+)[^\s]*/i, 'https://www.youtube.com/embed/$1?autoplay=1')
      .replace(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?&\s]+)[^\s]*/i, 'https://www.youtube.com/embed/$1?autoplay=1');

    // Use a static page at the same origin so postMessage works and YouTube allows embedding
    const feedbackPageUrl = new URL('nfb-feedback.html?url=' + encodeURIComponent(url), window.location.href).href;
    const win = window.open(feedbackPageUrl, 'nfb_feedback_window', 'width=1280,height=800,resizable=yes');
    if (!win) return;
    feedbackWindowRef.current = win;
    setTimeout(() => applyOverlay(overlayOpacity), 800);
  }, [applyOverlay, overlayOpacity]);

  const handleStartSession = useCallback(() => {
    sessionHistoryRef.current = []; // reset session-specific history
    setSessionDuration(0);
    setRewardRate(0);
    setOverallScore(0);
    setSessionRunning(true);
    if (feedbackUrl.trim()) openFeedbackWindow(feedbackUrl.trim());
  }, [feedbackUrl, openFeedbackWindow]);

  const handleStopSession = useCallback(() => {
    setSessionRunning(false);
  }, []);

  const oddIndicators = indicators.filter(i => i.id % 2 !== 0);
  const evenIndicators = indicators.filter(i => i.id % 2 === 0);
  const enabledIndicators = indicators.filter(i => i.enabled);

  const formatDuration = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  const colStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, minHeight: 0,
    display: 'flex', flexDirection: 'column', gap: 0,
    overflowY: 'auto',
    background: 'rgba(7,13,24,0.7)',
    border: '1px solid rgba(93,109,134,0.18)',
    borderRadius: 10,
    padding: '8px',
  };
  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 8, padding: '2px 0', borderBottom: '1px solid var(--border)',
  };

  const eegCardHandlers = {
    onToggle: (id: number) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i)),
    onChannelChange: (id: number, ch: Channel) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, channel: ch } : i)),
    onBandChange: (id: number, b: Band) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, band: b, threshold: BAND_BASE[b]! * 1.2 } : i)),
    onDirectionChange: (id: number, d: Direction) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, direction: d } : i)),
    onThresholdChange: (id: number, delta: number) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, threshold: Math.max(0.5, i.threshold + delta) } : i)),
    onAutoThresholdToggle: (id: number) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, autoThreshold: !i.autoThreshold } : i)),
  };

  return (
    <div style={{ display: hidden ? 'none' : 'flex', gap: 16, height: '100%', overflow: 'hidden' }}>

      {/* ── Column 1: EEG odd (#1 #3 #5) ── */}
      <div style={colStyle}>
        {oddIndicators.map(ind => ind.id === 5 ? (
          <FormulaCard
            key={ind.id}
            indicator={ind}
            isLive={isLive}
            liveBandPower={liveBandPower}
            onToggle={eegCardHandlers.onToggle}
            onFormulaChange={(id, formula) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, formula } : i))}
            onThresholdChange={eegCardHandlers.onThresholdChange}
            onAutoThresholdToggle={eegCardHandlers.onAutoThresholdToggle}
            onDirectionChange={eegCardHandlers.onDirectionChange}
          />
        ) : (
          <EegCard key={ind.id} indicator={ind} isLive={isLive} {...eegCardHandlers} />
        ))}
      </div>

      {/* ── Column 2: EEG even (#2 #4) + Cardiac ── */}
      <div style={colStyle}>
        {evenIndicators.map(ind => (
          <EegCard key={ind.id} indicator={ind} isLive={isLive} {...eegCardHandlers} />
        ))}
        <CardiacCard
          state={cardiac}
          isLive={visioMyndLive}
          liveHr={visioMyndHr}
          liveBreathing={visioMyndBreathing}
          onToggle={() => setCardiac(c => ({ ...c, enabled: !c.enabled }))}
          onDirectionChange={d => setCardiac(c => ({ ...c, direction: d }))}
          onThresholdChange={delta => setCardiac(c => ({ ...c, threshold: Math.max(0.1, c.threshold + delta) }))}
          onAutoThresholdToggle={() => setCardiac(c => ({ ...c, autoThreshold: !c.autoThreshold }))}
          onOpenVisioMynd={handleOpenVisioMynd}
        />
      </div>

      {/* ── Column 3: BNB Controls ── */}
      <div style={colStyle}>
        <BnbColumn bnb={bnb} onChange={patch => setBnb(prev => ({ ...prev, ...patch }))} />
      </div>

      {/* ── Column 4: Session Summary ── */}
      <div style={colStyle}>

        {/* Progress gauge + stats */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <ProgressGauge score={overallScore} />
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Duration', value: formatDuration(sessionDuration) },
                { label: 'Target Achievement', value: `${targetAchievementPct}%` },
                { label: 'Reward Rate', value: `${rewardRate}%` },
                { label: 'Overlay Opacity', value: `${overlayOpacity}%` },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-tertiary)', borderRadius: 7, padding: '7px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, fontWeight: 600, color: '#dce9f8' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* 活躍度 slider */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 7, padding: '8px 10px', marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>活躍度</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f9a02e', fontFamily: 'ui-monospace,monospace' }}>
                Lv.{difficultyLevel} {DIFFICULTY_LABELS[difficultyLevel - 1]} &nbsp;
                <span style={{ color: 'rgba(200,215,240,0.5)', fontWeight: 400 }}>TA={[36,49,62,75,88][difficultyLevel - 1]}%</span>
              </span>
            </div>
            <input type="range" min={1} max={5} step={1} value={difficultyLevel}
              onChange={e => setDifficultyLevel(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#f9a02e' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(93,109,134,0.6)', marginTop: 2 }}>
              <span>最容易</span><span>最困難</span>
            </div>
          </div>
          {/* 持續度 slider */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 7, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>持續度</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#85e89d', fontFamily: 'ui-monospace,monospace' }}>
                Lv.{persistenceLevel} {PERSISTENCE_LABELS[persistenceLevel - 1]} &nbsp;
                <span style={{ color: 'rgba(200,215,240,0.5)', fontWeight: 400 }}>window</span>
              </span>
            </div>
            <input type="range" min={1} max={5} step={1} value={persistenceLevel}
              onChange={e => setPersistenceLevel(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#85e89d' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(93,109,134,0.6)', marginTop: 2 }}>
              <span>最容易 (5s)</span><span>最困難 (23s)</span>
            </div>
          </div>
          {/* TA mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {(['and', 'average'] as const).map(m => (
              <button key={m} onClick={() => setTaMode(m)} style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${taMode === m ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`,
                background: taMode === m ? 'rgba(88,166,255,0.15)' : 'var(--bg-secondary)',
                color: taMode === m ? '#58a6ff' : 'var(--text-secondary)',
              }}>
                {m === 'and' ? 'All or None' : 'Average'}
              </button>
            ))}
          </div>
        </div>

        {/* Active indicators list */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Active Indicators</div>
          {enabledIndicators.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: '8px 0' }}>No active indicators</div>
          )}
          {enabledIndicators.map(ind => {
            const met = (ind.direction === 'up' && ind.value >= ind.threshold) || (ind.direction === 'down' && ind.value < ind.threshold);
            return (
              <div key={ind.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(93,109,134,0.15)' }}>
                <span style={{ fontSize: 12, color: '#dce9f8' }}>
                  EEG #{ind.id}&nbsp;
                  <span style={{ color: 'var(--text-secondary)' }}>{ind.direction === 'up' ? '↑' : '↓'} {ind.id === 5 ? 'Formula' : `${ind.channel} · ${ind.band}`}</span>
                </span>
                <Badge label={met ? '達標' : '未達標'} color={met ? '#3fb950' : '#f85149'} bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
              </div>
            );
          })}
          {/* Cardiac row */}
          {cardiac.enabled && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ fontSize: 12, color: '#dce9f8' }}>
                Cardiac&nbsp;<span style={{ color: 'var(--text-secondary)' }}>{cardiac.direction === 'up' ? '↑' : '↓'} LF/HF</span>
              </span>
              <Badge
                label={(cardiac.lfHfRatio >= cardiac.threshold) === (cardiac.direction === 'up') ? '達標' : '未達標'}
                color={(cardiac.lfHfRatio >= cardiac.threshold) === (cardiac.direction === 'up') ? '#3fb950' : '#f85149'}
                bg={(cardiac.lfHfRatio >= cardiac.threshold) === (cardiac.direction === 'up') ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'}
              />
            </div>
          )}
        </div>

        {/* Feedback content */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Feedback Content</div>
          <input type="url" placeholder="Feedback URL (e.g. https://…)"
            value={feedbackUrl} onChange={e => setFeedbackUrl(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, padding: '6px 8px', marginBottom: 8, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>遮罩透明度（自動）</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#58a6ff', fontFamily: 'ui-monospace,monospace' }}>{overlayOpacity}%</span>
          </div>
          <div style={{
            width: '100%', height: 48,
            background: `rgba(0,0,0,${1 - overlayOpacity / 100})`,
            border: '1px dashed rgba(93,109,134,0.4)', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
          }}>
            {feedbackUrl ? (
              <span style={{ color: `rgba(88,166,255,${overlayOpacity / 100})`, fontSize: 11 }}>
                {feedbackUrl.slice(0, 32)}{feedbackUrl.length > 32 ? '…' : ''}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'rgba(93,109,134,0.5)' }}>遮罩預覽</span>
            )}
          </div>
          <button
            onClick={sessionRunning ? handleStopSession : handleStartSession}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 7, border: 'none',
              background: sessionRunning
                ? 'linear-gradient(90deg, rgba(248,81,73,0.7), rgba(200,50,50,0.6))'
                : 'linear-gradient(90deg, rgba(88,166,255,0.7), rgba(40,100,200,0.6))',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em',
            }}
          >
            {sessionRunning ? '⏹ Stop NFB Session' : '▶ Start NFB Session'}
          </button>
        </div>

        {/* Operator notes */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Operator Notes</div>
          <textarea value={operatorNotes} onChange={e => setOperatorNotes(e.target.value)}
            placeholder="輸入操作員備注…" rows={4}
            style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
      </div>
    </div>
  );
};
