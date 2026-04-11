import { useEffect, useRef, useState, useCallback, type FC, type ChangeEvent } from 'react';
import type { EegPacket, FilterParams } from '../../types/eeg';
import { CHANNEL_LABELS } from '../../types/eeg';
import { useBandPower, NFB_BANDS } from '../../hooks/useBandPower';
import { DEFAULT_FILTER_PARAMS } from '../../types/eeg';
import { T, LangContext, useLang, type Lang } from '../../i18n';

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

const BNB_METHOD_DESC: Record<BnbMethod, Record<Lang, string>> = {
  'global-ssb': { zh: '單邊帶調制法：兩聲道共用一個載波，以相位差編碼差頻。', en: 'Single-sideband: both channels share one carrier, beat encoded as phase offset.' },
  'band-shift': { zh: '每聲道分別以 base ± (beat/2) Hz 播放，產生純頻率差。', en: 'Each channel plays at base ± (beat/2) Hz for a pure frequency difference.' },
  'sub-layer':  { zh: '載波隱藏於可聽域以下；差頻以振幅包絡進行調製。', en: 'Carrier hidden below audible range; beat modulates amplitude envelope.' },
};

interface PresetOption {
  value: string;
  label: { zh: string; en: string };
  info: { zh: string; en: string };
  formula: string;
  direction: Direction;
}

const PRESET_OPTIONS: PresetOption[] = [
  { value: '', label: { zh: '— 選擇預設 —', en: '— Select Preset —' }, info: { zh: '', en: '' }, formula: '', direction: 'up' },
  {
    value: 'tbr',
    label: { zh: '① 注意力提升 (TBR)（Fz）', en: '① Attention (TBR) (Fz)' },
    info: { zh: '這是 ADHD 訓練最常用的指標，值越高代表專注度越高。', en: 'Most common ADHD training index. Higher = more focused.' },
    formula: 'Fz_Beta / (Fz_Theta + 0.001)',
    direction: 'up',
  },
  {
    value: 'alpha_relax',
    label: { zh: '② 深度放鬆 (Alpha)（O1, O2）', en: '② Deep Relaxation (Alpha) (O1, O2)' },
    info: { zh: '閉眼訓練效果最佳，數值越高代表大腦進入節能放鬆狀態。', en: 'Best with eyes closed. Higher = deeper relaxation.' },
    formula: '(O1_Alpha + O2_Alpha) / 2',
    direction: 'up',
  },
  {
    value: 'asymmetry',
    label: { zh: '③ 情緒平衡 (Asymmetry)（Fp1/2, T7/8）', en: '③ Emotional Balance (Asymmetry) (Fp1/2, T7/8)' },
    info: { zh: '當右額葉 Alpha 高於左額葉，代表左腦較活躍，通常與正向情緒相關。', en: 'Higher right-hemisphere Alpha = more positive affect.' },
    formula: '(Fp2_Alpha + T8_Alpha) / (Fp1_Alpha + T7_Alpha)',
    direction: 'up',
  },
  {
    value: 'smr',
    label: { zh: '④ 身心穩定 (SMR)（Fz）', en: '④ Calm Alertness (SMR) (Fz)' },
    info: { zh: '提升運動覺節律，訓練在冷靜中保持警覺，適合緩解過動。', en: 'Trains sensorimotor rhythm — calm yet alert, helps hyperactivity.' },
    formula: 'Fz_SMR',
    direction: 'up',
  },
  {
    value: 'beta_logic',
    label: { zh: '⑤ 邏輯執行力 (Beta)（Fp1, T7）', en: '⑤ Logic & Executive (Beta) (Fp1, T7)' },
    info: { zh: '強化左額葉的認知處理能力，有助於邏輯運算與決策。', en: 'Strengthens left-frontal cognition for logic and decision-making.' },
    formula: '(Fp1_Beta + T7_Beta) / 2',
    direction: 'up',
  },
  {
    value: 'theta_alpha',
    label: { zh: '⑥ 創造力/內省 (T/A)（Pz）', en: '⑥ Creativity / Insight (T/A) (Pz)' },
    info: { zh: '訓練進入 Theta 與 Alpha 的交界，常見於深度冥想或藝術創作訓練。', en: 'Theta-Alpha boundary — associated with deep meditation or creative flow.' },
    formula: 'Pz_Theta / (Pz_Alpha + 0.001)',
    direction: 'up',
  },
  {
    value: 'gamma',
    label: { zh: '⑦ 認知統合 (Gamma)（Fp1, Fp2）', en: '⑦ Cognitive Integration (Gamma) (Fp1, Fp2)' },
    info: { zh: '針對高階訊息整合與領悟力提升，訓練大腦的高頻同步。', en: 'High-frequency synchrony for insight and information integration.' },
    formula: '(Fp1_Gamma + Fp2_Gamma) / 2',
    direction: 'up',
  },
  {
    value: 'hibeta_anx',
    label: { zh: '⑧ 焦慮控制 (High-Beta)（T7, Pz, T8）', en: '⑧ Anxiety Control (High-Beta) (T7, Pz, T8)' },
    info: { zh: '抑制後頂葉的高頻 Beta 波 (20-30Hz)，數值越高代表越不焦慮。', en: 'Suppresses posterior high-Beta (20-30 Hz). Higher = less anxious.' },
    formula: '4 / (T7_HiBeta + 2 * Pz_HiBeta + T8_HiBeta)',
    direction: 'up',
  },
  {
    value: 'fm_theta',
    label: { zh: '⑨ 心流狀態 (Fm-Theta)（Fz）', en: '⑨ Flow State (Fm-Theta) (Fz)' },
    info: { zh: '針對前額葉正中 Theta 波，數值越高代表在複雜任務中的專注流動感越強。', en: 'Frontal midline Theta — higher = stronger focus-flow in complex tasks.' },
    formula: 'Fz_Theta',
    direction: 'up',
  },
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
  formula: string;   // used by id=5 custom index and preset formulas for #1–4
  presetKey: string; // '' = custom single-band, otherwise key from PRESET_OPTIONS
}

type CardiacMetric = 'lfhf' | 'rmssd-t';

// RMSSD T-Score: population norm mean=42ms SD=20ms (adult HRV reference)
function rmssdToTscore(rmssd: number): number {
  return Math.min(100, Math.max(0, 50 + 10 * (rmssd - 42) / 20));
}

interface CardiacState {
  enabled: boolean;
  metric: CardiacMetric;
  autoThreshold: boolean;
  lfValue: number;
  hfValue: number;
  lfHfRatio: number;
  rmssd: number;
  rmssdTscore: number;
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

const DragThreshHint: FC = () => {
  const lang = useLang();
  return (
    <div style={{ fontSize: 10, color: 'rgba(248,129,74,0.55)', textAlign: 'center', marginTop: 2, userSelect: 'none' }}>
      {T(lang, 'trainDragThresh')}
    </div>
  );
};

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
        <DragThreshHint />
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
  liveBandPower?: number[][] | null;
  onToggle: (id: number) => void;
  onChannelChange: (id: number, ch: Channel) => void;
  onBandChange: (id: number, b: Band) => void;
  onDirectionChange: (id: number, d: Direction) => void;
  onThresholdChange: (id: number, delta: number) => void;
  onAutoThresholdToggle: (id: number) => void;
  onPresetApply: (id: number, presetKey: string, formula: string, direction: Direction) => void;
}> = ({ indicator, isLive, liveBandPower, onToggle, onChannelChange, onBandChange, onDirectionChange, onThresholdChange, onAutoThresholdToggle, onPresetApply }) => {
  const lang = useLang();
  const aboveThreshold = indicator.value >= indicator.threshold;
  const met = indicator.direction === 'up' ? aboveThreshold : !aboveThreshold;
  const activePreset = PRESET_OPTIONS.find(p => p.value === indicator.presetKey) ?? null;
  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 5,
    color: 'var(--text-primary)', fontSize: 12, padding: '3px 6px', cursor: 'pointer', flex: 1,
  };
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, opacity: indicator.enabled ? 1 : 0.55 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>{T(lang, 'trainEegCard')}{indicator.id}</span>
          {isLive
            ? <Badge label="LIVE" color="#3fb950" bg="rgba(63,185,80,0.15)" />
            : <Badge label="—" color="rgba(130,150,180,0.5)" bg="rgba(93,109,134,0.10)" />}
        </div>
        <button onClick={() => onToggle(indicator.id)} style={{ background: indicator.enabled ? 'rgba(63,185,80,0.2)' : 'rgba(100,115,135,0.2)', border: `1px solid ${indicator.enabled ? 'rgba(63,185,80,0.5)' : 'rgba(100,115,135,0.4)'}`, borderRadius: 5, color: indicator.enabled ? '#3fb950' : '#6b7580', fontSize: 11, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>
          {indicator.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Preset dropdown + ⓘ info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <select
          value={indicator.presetKey}
          onChange={e => {
            const key = e.target.value;
            const preset = PRESET_OPTIONS.find(p => p.value === key);
            onPresetApply(indicator.id, key, preset?.formula ?? '', preset?.direction ?? 'up');
          }}
          style={{ ...selectStyle, flex: 1, width: 'unset' }}
        >
          {PRESET_OPTIONS.map(p => (
            <option key={p.value} value={p.value}>{p.label[lang]}</option>
          ))}
        </select>
        {activePreset && (
          <span
            title={activePreset?.info[lang]}
            style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(88,166,255,0.15)', border: '1px solid rgba(88,166,255,0.4)',
              color: '#58a6ff', fontSize: 11, fontWeight: 700, cursor: 'help',
              display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none',
            }}
          >i</span>
        )}
      </div>

      {/* Channel + Band selectors (custom only) */}
      {!activePreset && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <select value={indicator.channel} onChange={e => onChannelChange(indicator.id, e.target.value as Channel)} style={selectStyle}>
            {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
          <select value={indicator.band} onChange={e => onBandChange(indicator.id, e.target.value as Band)} style={selectStyle}>
            {BANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}

      {/* Direction */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['up', 'down'] as Direction[]).map(d => (
          <button key={d} onClick={() => onDirectionChange(indicator.id, d)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)') : 'var(--border)'}`, background: indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)') : 'var(--bg-tertiary)', color: indicator.direction === d ? (d === 'up' ? '#3fb950' : '#f85149') : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {d === 'up' ? T(lang, 'trainDirUp') : T(lang, 'trainDirDown')}
          </button>
        ))}
      </div>

      {/* Value display */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: isLive ? '#8ecfff' : 'rgba(200,215,235,0.45)', fontWeight: 600 }}>
          {isLive ? indicator.value.toFixed(3) : '—'} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{activePreset ? '' : 'μV²'}</span>
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
          {T(lang, 'trainAuto')}
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
  const lang = useLang();
  const computedValue = isLive ? (evalFormula(indicator.formula, liveBandPower) ?? 0) : 0;
  const aboveThreshold = computedValue >= indicator.threshold;
  const met = indicator.direction === 'up' ? aboveThreshold : !aboveThreshold;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(88,166,255,0.25)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, opacity: indicator.enabled ? 1 : 0.55 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>{T(lang, 'trainEegCard')}5 <span style={{ color: 'rgba(88,166,255,0.6)', fontWeight: 400, fontSize: 11 }}>{T(lang, 'trainCustomIdx')}</span></span>
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
          {T(lang, 'trainFormulaLabel')} (e.g. <code style={{ color: 'rgba(88,166,255,0.7)' }}>Fp1_Alpha / (Fp1_Alpha + Fp2_Theta)</code>)
        </div>
        <input
          type="text"
          value={indicator.formula}
          onChange={e => onFormulaChange(indicator.id, e.target.value)}
          placeholder={T(lang, 'trainFormulaPlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 5, color: 'var(--text-primary)',
            fontSize: 12, padding: '5px 8px', fontFamily: 'ui-monospace,monospace',
          }}
        />
        <div style={{ fontSize: 10, color: 'rgba(93,109,134,0.6)', marginTop: 3 }}>
          {T(lang, 'trainFormulaHint')}
        </div>
      </div>

      {/* Direction */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['up', 'down'] as Direction[]).map(d => (
          <button key={d} onClick={() => onDirectionChange(indicator.id, d)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)') : 'var(--border)'}`, background: indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)') : 'var(--bg-tertiary)', color: indicator.direction === d ? (d === 'up' ? '#3fb950' : '#f85149') : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {d === 'up' ? T(lang, 'trainDirUp') : T(lang, 'trainDirDown')}
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
          {T(lang, 'trainAuto')}
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
  onMetricChange: (m: CardiacMetric) => void;
  onDirectionChange: (d: Direction) => void;
  onThresholdChange: (delta: number) => void;
  onAutoThresholdToggle: () => void;
  onOpenVisioMynd: () => void;
}> = ({ state, isLive, liveHr, liveBreathing, onToggle, onMetricChange, onDirectionChange, onThresholdChange, onAutoThresholdToggle, onOpenVisioMynd }) => {
  const lang = useLang();
  const activeVal = state.metric === 'rmssd-t' ? state.rmssdTscore : state.lfHfRatio;
  const aboveThreshold = activeVal >= state.threshold;
  const met = aboveThreshold === (state.direction === 'up');
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(88,166,255,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, opacity: state.enabled ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>Cardiac</span>
          {isLive
            ? <Badge label="LIVE" color="#3fb950" bg="rgba(63,185,80,0.15)" />
            : <Badge label="—" color="rgba(130,150,180,0.5)" bg="rgba(93,109,134,0.10)" />}
        </div>
        <button onClick={onToggle} style={{ background: state.enabled ? 'rgba(63,185,80,0.2)' : 'rgba(100,115,135,0.2)', border: `1px solid ${state.enabled ? 'rgba(63,185,80,0.5)' : 'rgba(100,115,135,0.4)'}`, borderRadius: 5, color: state.enabled ? '#3fb950' : '#6b7580', fontSize: 11, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>
          {state.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Metric selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['lfhf', 'rmssd-t'] as CardiacMetric[]).map(m => {
          const label = m === 'lfhf' ? T(lang, 'trainCardiacLfhf') : T(lang, 'trainCardiacRmssdT');
          const active = state.metric === m;
          return (
            <button key={m} onClick={() => onMetricChange(m)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${active ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: active ? 'rgba(88,166,255,0.15)' : 'var(--bg-tertiary)', color: active ? '#8ecfff' : 'var(--text-secondary)', fontSize: 11, fontWeight: active ? 700 : 400, cursor: 'pointer' }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* HR / Breathing */}
      {isLive && (liveHr !== null || liveBreathing !== null) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
          {liveHr !== null && <div><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>HR</span><div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>{liveHr} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>bpm</span></div></div>}
          {liveBreathing !== null && <div><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{T(lang, 'trainBreathing')}</span><div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>{liveBreathing} <span style={{ fontSize: 11 }}>/min</span></div></div>}
        </div>
      )}

      {/* Secondary metrics row — always show both */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LF/HF</span>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: state.metric === 'lfhf' ? '#f9a02e' : 'rgba(200,215,235,0.45)', fontWeight: 600 }}>
            {isLive ? state.lfHfRatio.toFixed(2) : '—'}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>RMSSD</span>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, color: 'rgba(200,215,235,0.55)', fontWeight: 600 }}>
            {isLive && state.rmssd > 0 ? `${state.rmssd.toFixed(1)} ms` : '—'}
          </div>
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>RMSSD-T</span>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: state.metric === 'rmssd-t' ? '#c084fc' : 'rgba(200,215,235,0.45)', fontWeight: 600 }}>
            {isLive && state.rmssdTscore > 0 ? state.rmssdTscore.toFixed(1) : '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['up', 'down'] as Direction[]).map(d => (
          <button key={d} onClick={() => onDirectionChange(d)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${state.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)') : 'var(--border)'}`, background: state.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)') : 'var(--bg-tertiary)', color: state.direction === d ? (d === 'up' ? '#3fb950' : '#f85149') : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {d === 'up' ? T(lang, 'trainDirUp') : T(lang, 'trainDirDown')}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: isLive ? (state.metric === 'rmssd-t' ? '#c084fc' : '#8ecfff') : 'rgba(200,215,235,0.45)', fontWeight: 600 }}>
          {isLive ? activeVal.toFixed(state.metric === 'rmssd-t' ? 1 : 2) : '—'}
        </span>
        <Badge label={met ? T(lang, 'trainMet') : T(lang, 'trainNotMet')} color={met ? '#3fb950' : '#f85149'} bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
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
          step={state.metric === 'rmssd-t' ? 1 : 0.1}
          min={state.metric === 'rmssd-t' ? 1 : 0.1}
          style={{ width: 72, background: 'var(--bg-tertiary)', border: `1px solid ${state.autoThreshold ? 'rgba(88,166,255,0.2)' : 'rgba(248,129,74,0.4)'}`, borderRadius: 4, color: state.autoThreshold ? 'rgba(88,166,255,0.4)' : 'rgba(248,129,74,0.9)', fontSize: 11, padding: '2px 5px', fontFamily: 'ui-monospace,monospace', textAlign: 'right', opacity: state.autoThreshold ? 0.5 : 1 }}
        />
        <button
          onClick={onAutoThresholdToggle}
          style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: `1px solid ${state.autoThreshold ? 'rgba(88,166,255,0.5)' : 'rgba(93,109,134,0.4)'}`, background: state.autoThreshold ? 'rgba(88,166,255,0.15)' : 'var(--bg-tertiary)', color: state.autoThreshold ? '#58a6ff' : 'var(--text-secondary)', cursor: 'pointer' }}
        >
          {T(lang, 'trainAuto')}
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onOpenVisioMynd} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(88,166,255,0.4)', background: 'rgba(88,166,255,0.1)', color: '#8ecfff', cursor: 'pointer' }}>
          {T(lang, 'trainOpenVisioMynd')}
        </button>
      </div>
    </div>
  );
};

// ── Progress gauge ─────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

const ProgressGauge: FC<{ score: number; lang: Lang }> = ({ score, lang }) => {
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
        <text x={cx} y={cy + 22} textAnchor="middle" style={{ fill: 'var(--text-secondary)', fontSize: 11 }}>{T(lang, 'trainOverall')}</text>
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

const BnbColumn: FC<{ bnb: BnbState; onChange: (patch: Partial<BnbState>) => void; onAudioBlob?: (blobUrl: string, name: string) => void }> = ({ bnb, onChange, onAudioBlob }) => {
  const lang = useLang();
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
    const blobUrl = URL.createObjectURL(file);
    audioElRef.current.src = blobUrl;
    onChange({ audioFileName: file.name, playState: 'stopped', progress: 0 });
    onAudioBlob?.(blobUrl, file.name);
  };

  const formatHz = (v: number) => v < 10 ? v.toFixed(2) : v.toFixed(1);

  return (
    <div style={{ flex: 1, padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#8ecfff' }}>{T(lang, 'trainBnbTitle')}</span>
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
            {bnb.audioFileName || T(lang, 'trainAudioFile')}
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
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{T(lang, 'trainVol')}</span>
        <input type="range" min={0} max={100} value={bnb.volume}
          onChange={e => onChange({ volume: parseInt(e.target.value) })}
          style={{ flex: 1, accentColor: '#3fb950' }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace,monospace', width: 34, textAlign: 'right' }}>{bnb.volume}%</span>
      </div>

      {/* Oscillator Source */}
      <div style={subHeaderStyle as React.CSSProperties}>{T(lang, 'trainOscSource')}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={bnb.oscEnabled} onChange={e => onChange({ oscEnabled: e.target.checked })} style={{ accentColor: '#58a6ff' }} />
        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{T(lang, 'trainEnableOsc')}</span>
      </label>
      <div style={{ opacity: bnb.oscEnabled ? 1 : 0.45, transition: 'opacity 0.15s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <span style={labelStyle}>{T(lang, 'trainWaveform')}</span>
            <select value={bnb.oscWaveform} onChange={e => onChange({ oscWaveform: e.target.value as OscWaveform })}
              style={{ ...inputStyle, padding: '3px 6px' }} disabled={!bnb.oscEnabled}>
              {(['sine', 'square', 'triangle', 'sawtooth', 'white-noise', 'ocean-waves'] as OscWaveform[]).map(w => (
                <option key={w} value={w}>{w === 'white-noise' ? T(lang, 'trainWhiteNoise') : w === 'ocean-waves' ? T(lang, 'trainOceanWaves') : w.charAt(0).toUpperCase() + w.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>{T(lang, 'trainFreqHz')}</span>
            <input type="number" min={20} max={20000} value={bnb.oscFreq}
              onChange={e => onChange({ oscFreq: parseFloat(e.target.value) || 440 })}
              style={inputStyle} disabled={!bnb.oscEnabled || bnb.oscWaveform === 'white-noise' || bnb.oscWaveform === 'ocean-waves'} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{T(lang, 'trainOscVol')}</span>
          <input type="range" min={0} max={100} value={bnb.oscVolume}
            onChange={e => onChange({ oscVolume: parseInt(e.target.value) })}
            style={{ flex: 1, accentColor: '#f9a02e' }} disabled={!bnb.oscEnabled} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace,monospace', width: 34, textAlign: 'right' }}>{bnb.oscVolume}%</span>
        </div>
      </div>

      {/* Binaural Beat Frequency */}
      <div style={subHeaderStyle as React.CSSProperties}>{T(lang, 'trainBbFreq')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', flex: 1 }}>
          <input type="checkbox" checked={bnb.bbFixed} onChange={e => onChange({ bbFixed: e.target.checked })} style={{ accentColor: '#58a6ff' }} />
          <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{T(lang, 'trainFixedFreq')}</span>
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
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{T(lang, 'trainCurrentBeat')}</span>
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
      <div style={subHeaderStyle as React.CSSProperties}>{T(lang, 'trainBnbMethod')}</div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
        {([['global-ssb', 'Global SSB'], ['band-shift', 'Band-Shift'], ['sub-layer', 'Sub-Layer']] as [BnbMethod, string][]).map(([id, label]) => (
          <button key={id} onClick={() => onChange({ bnbMethod: id })}
            style={{ flex: 1, padding: '5px 4px', borderRadius: 6, border: `1px solid ${bnb.bnbMethod === id ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.bnbMethod === id ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: bnb.bnbMethod === id ? '#8ecfff' : 'var(--text-secondary)', fontSize: 10, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-tertiary)', borderRadius: 6, padding: '7px 9px', marginBottom: 6 }}>
        {BNB_METHOD_DESC[bnb.bnbMethod][lang]}
      </div>
      {/* Method-specific sub-options */}
      {bnb.bnbMethod === 'band-shift' && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>{T(lang, 'trainCarrierBand')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {([
              { label: '150–400', low: 150, high: 400, name: { zh: '標準建議', en: 'Standard' } },
              { label: '100–250', low: 100, high: 250, name: { zh: '低頻共鳴', en: 'Low Resonance' } },
              { label: '200–600', low: 200, high: 600, name: { zh: '中頻核心', en: 'Mid Core' } },
              { label: '300–700', low: 300, high: 700, name: { zh: '高清晰度', en: 'High Clarity' } },
            ] as { label: string; low: number; high: number; name: Record<Lang, string> }[]).map(p => {
              const active = bnb.bandLowHz === p.low && bnb.bandHighHz === p.high;
              return (
                <button key={p.label}
                  onClick={() => onChange({ bandLowHz: p.low, bandHighHz: p.high, oscFreq: Math.round((p.low + p.high) / 2) })}
                  style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${active ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: active ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: active ? '#8ecfff' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {p.label} <span style={{ fontSize: 10, opacity: 0.7 }}>({p.name[lang]})</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {bnb.bnbMethod === 'sub-layer' && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>{T(lang, 'trainCarrierFreq')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {([
              { hz: 140, name: { zh: '驅動感', en: 'Energetic' } },
              { hz: 200, name: { zh: '標準', en: 'Standard' } },
              { hz: 250, name: { zh: '清晰', en: 'Clear' } },
              { hz: 400, name: { zh: '最佳同步★', en: 'Best Sync ★' } },
            ] as { hz: number; name: Record<Lang, string> }[]).map(p => {
              const active = bnb.subLayerCarrierHz === p.hz;
              return (
                <button key={p.hz}
                  onClick={() => onChange({ subLayerCarrierHz: p.hz, oscFreq: p.hz })}
                  style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${active ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: active ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: active ? '#8ecfff' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {p.hz} Hz <span style={{ fontSize: 10, opacity: 0.7 }}>({p.name[lang]})</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Modulation */}
      <div style={subHeaderStyle as React.CSSProperties}>{T(lang, 'trainModulation')}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={bnb.modEnabled} onChange={e => onChange({ modEnabled: e.target.checked })} style={{ accentColor: '#58a6ff' }} />
        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{T(lang, 'trainEnableMod')}</span>
      </label>
      <div style={{ opacity: bnb.modEnabled ? 1 : 0.4, transition: 'opacity 0.15s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <span style={labelStyle}>{T(lang, 'trainInterval')}</span>
            <input type="number" min={50} max={5000} step={50} value={bnb.modInterval}
              onChange={e => onChange({ modInterval: parseInt(e.target.value) || 500 })}
              style={inputStyle} disabled={!bnb.modEnabled} />
          </div>
          <div>
            <span style={labelStyle}>{T(lang, 'trainStep')}</span>
            <input type="number" min={0.1} max={5} step={0.1} value={bnb.modStep}
              onChange={e => onChange({ modStep: parseFloat(e.target.value) || 0.5 })}
              style={inputStyle} disabled={!bnb.modEnabled} />
          </div>
        </div>
        <div>
          <span style={labelStyle}>{T(lang, 'trainTrend')}</span>
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
const DIFFICULTY_LABELS: Record<Lang, readonly string[]> = {
  zh: ['很容易', '容易', '中等', '困難', '很困難'],
  en: ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'],
};

// 持續度 (Persistence): moving-window size in seconds
const W_VALUES = [5, 8, 12, 17, 23] as const;
const PERSISTENCE_LABELS: Record<Lang, readonly string[]> = {
  zh: ['5 秒', '8 秒', '12 秒', '17 秒', '23 秒'],
  en: ['5 s', '8 s', '12 s', '17 s', '23 s'],
};

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
    presetKey: '',
  }));
}

export interface TrainingViewProps {
  packets?: EegPacket[];
  filterParams?: FilterParams;
  hidden?: boolean;
  lang?: Lang;
}

export const TrainingView: FC<TrainingViewProps> = ({ packets, filterParams, hidden, lang }) => {
  const liveBandPower = useBandPower(packets, filterParams ?? DEFAULT_FILTER_PARAMS);
  // Ref for stale-closure-safe access inside tick
  const liveBandPowerRef = useRef(liveBandPower);
  useEffect(() => { liveBandPowerRef.current = liveBandPower; }, [liveBandPower]);

  const isLive = liveBandPower !== null && (packets?.length ?? 0) > 0;

  const [indicators, setIndicators] = useState<EegIndicator[]>(makeDefaultIndicators);
  const [cardiac, setCardiac] = useState<CardiacState>({
    enabled: true,
    metric: 'lfhf',
    autoThreshold: false,
    lfValue: 0, hfValue: 0, lfHfRatio: 0,
    rmssd: 0, rmssdTscore: 0,
    direction: 'up', threshold: 1.5, history: [],
  });
  const [bnb, setBnb] = useState<BnbState>(DEFAULT_BNB);

  // VisioMynd live cardiac data
  const [visioMyndLive, setVisioMyndLive] = useState(false);
  const [visioMyndHr, setVisioMyndHr] = useState<number | null>(null);
  const [visioMyndBreathing, setVisioMyndBreathing] = useState<number | null>(null);
  const [visioMyndLfhf, setVisioMyndLfhf] = useState<number | null>(null);
  const [visioMyndRmssd, setVisioMyndRmssd] = useState<number | null>(null);
  const visioMyndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'visiomynd_data') return;
      const { hr, breathing, lfhf, rmssd } = e.data as { hr: number | null; breathing: number | null; lfhf: number | null; rmssd: number | null };
      setVisioMyndHr(hr ?? null);
      setVisioMyndBreathing(breathing ?? null);
      setVisioMyndLfhf(lfhf ?? null);
      setVisioMyndRmssd(rmssd ?? null);
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
  const [feedbackFile, setFeedbackFile] = useState<File | null>(null);
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
  useEffect(() => { feedbackFileRef.current = feedbackFile; }, [feedbackFile]);

  // TA: sliding window of per-tick fractions (0/1 for AND, metCount/total for Average), capped at max W=23
  const taWindowRef = useRef<number[]>([]);
  // Session history: per-tick fractions since session start (for Reward Rate + Overall)
  const sessionHistoryRef = useRef<number[]>([]);

  const feedbackWindowRef = useRef<Window | null>(null);
  const feedbackFileRef = useRef<File | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const pptxInputRef  = useRef<HTMLInputElement | null>(null);
  const pdfInputRef   = useRef<HTMLInputElement | null>(null);

  // ── Baseline recording ──
  const [baselinePhase, setBaselinePhase] = useState<'idle' | 'recording' | 'done'>('idle');
  const [baselineProgress, setBaselineProgress] = useState(0); // 0–30
  const baselinePhaseRef = useRef<'idle' | 'recording' | 'done'>('idle');
  useEffect(() => { baselinePhaseRef.current = baselinePhase; }, [baselinePhase]);
  // Each entry: liveBandPower snapshot + A1–A9 raw formula values
  const baselineRecordRef = useRef<Array<{ bands: number[][]; presets: (number | null)[] }>>([]);

  // NFB audio feedback
  const [nfbAudioEnabled, setNfbAudioEnabled] = useState(false);
  const [nfbAudioSrc, setNfbAudioSrc] = useState<{ url: string; name: string } | null>(null);
  const [bnbAudioBlob, setBnbAudioBlob] = useState<{ url: string; name: string } | null>(null);
  const nfbAudioElRef = useRef<HTMLAudioElement | null>(null);
  const nfbAudioInputRef = useRef<HTMLInputElement | null>(null);

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
    if (sessionRunning) {
      applyOverlay(oo);
      if (nfbAudioElRef.current) nfbAudioElRef.current.volume = oo / 100;
    }
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
      // Baseline recording: snapshot raw liveBandPower + all A1–A9 formula values
      if (baselinePhaseRef.current === 'recording') {
        const bp = liveBandPowerRef.current;
        const presetVals = PRESET_OPTIONS.slice(1).map(p => evalFormula(p.formula, bp));
        baselineRecordRef.current.push({
          bands: bp ? bp.map(row => [...row]) : [],
          presets: presetVals,
        });
        const n = baselineRecordRef.current.length;
        setBaselineProgress(n);
        if (n >= 30) {
          baselinePhaseRef.current = 'done';
          setBaselinePhase('done');
        }
      }

      // EEG indicators — only update when live data available
      setIndicators(prev => prev.map(ind => {
        if (!ind.enabled) return ind;
        let newVal: number;
        if (ind.formula) {
          // Formula evaluation: id=5 FormulaCard + preset formulas for #1–4
          const rawVal = evalFormula(ind.formula, liveBandPowerRef.current) ?? ind.value;
          // Preset formulas: apply 5-sample moving average (window=5, overlap=4)
          if (ind.presetKey) {
            const maWin = [...ind.history.slice(-4), rawVal];
            newVal = maWin.reduce((a, b) => a + b, 0) / maWin.length;
          } else {
            newVal = rawVal;
          }
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

      // Cardiac — update when VisioMynd live
      setCardiac(c => {
        if (!c.enabled) return c;
        const W = W_VALUES[persistenceLevelRef.current - 1];
        if (visioMyndLive && visioMyndLfhf !== null) {
          const newLfhf = visioMyndLfhf;
          const newRmssd = visioMyndRmssd ?? c.rmssd;
          const newRmssdT = visioMyndRmssd !== null ? rmssdToTscore(visioMyndRmssd) : c.rmssdTscore;
          const activeVal = c.metric === 'rmssd-t' ? newRmssdT : newLfhf;
          const newHistory = [...c.history, activeVal].slice(-HISTORY_LEN);
          const newThreshold = c.autoThreshold
            ? (computeRMS(newHistory.slice(-W)) || c.threshold)
            : c.threshold;
          return {
            ...c,
            lfHfRatio: newLfhf,
            lfValue: newLfhf * 0.7 + 0.1, hfValue: Math.max(0.05, 0.7 - newLfhf * 0.05 + 0.1),
            rmssd: newRmssd, rmssdTscore: newRmssdT,
            history: newHistory, threshold: newThreshold,
          };
        }
        // Not live — extend history with last active value
        const activeVal = c.metric === 'rmssd-t' ? c.rmssdTscore : c.lfHfRatio;
        const newHistory = [...c.history, activeVal].slice(-HISTORY_LEN);
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
  }, [getLiveBandPower, visioMyndLive, visioMyndLfhf, visioMyndRmssd]);

  // ── Open feedback window ──
  const openFeedbackWindow = useCallback((rawUrl: string) => {
    // Auto-convert YouTube watch/short URLs to embeddable format
    const url = rawUrl
      .replace(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\s]+)[^\s]*/i, 'https://www.youtube.com/embed/$1?autoplay=1')
      .replace(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?&\s]+)[^\s]*/i, 'https://www.youtube.com/embed/$1?autoplay=1');

    // Auto-prepend https:// if no protocol given
    const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    // Use a static page at the same origin so postMessage works and YouTube allows embedding
    const feedbackPageUrl = new URL('nfb-feedback.html?url=' + encodeURIComponent(fullUrl), window.location.href).href;
    const win = window.open(feedbackPageUrl, 'nfb_feedback_window', 'width=1280,height=800,resizable=yes');
    if (!win) return;
    feedbackWindowRef.current = win;
    setTimeout(() => applyOverlay(overlayOpacity), 800);
  }, [applyOverlay, overlayOpacity]);

  const openFeedbackWindowWithFile = useCallback((file: File) => {
    const feedbackPageUrl = new URL('nfb-feedback.html', window.location.href).href;
    const win = window.open(feedbackPageUrl, 'nfb_feedback_window', 'width=1280,height=800,resizable=yes');
    if (!win) return;
    feedbackWindowRef.current = win;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const msgType = ext === 'pdf' ? 'nfb_pdf' : ext === 'pptx' ? 'nfb_pptx' : 'nfb_video';
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      // Wait for the window to load before sending
      const trySend = () => {
        if (win.closed) return;
        win.postMessage({ type: msgType, buffer: buf, mimeType: file.type }, '*', [buf]);
        setTimeout(() => applyOverlay(overlayOpacity), 200);
      };
      // Poll until window is ready (has a document)
      const poll = setInterval(() => {
        try {
          if (win.document.readyState === 'complete') { clearInterval(poll); trySend(); }
        } catch { clearInterval(poll); trySend(); }
      }, 200);
    };
    reader.readAsArrayBuffer(file);
  }, [applyOverlay, overlayOpacity]);

  // Compute trimmed-mean baseline threshold from 30 raw samples
  const computeAndApplyBaseline = useCallback(() => {
    const data = baselineRecordRef.current;
    if (data.length < 6) return;

    function trimmedMean(vals: (number | null)[]): number | null {
      const valid = vals.filter((v): v is number => v !== null && isFinite(v) && v >= 0);
      if (valid.length < 2) return null;
      // 2-second non-overlapping windows → means
      const windowMeans: number[] = [];
      for (let i = 0; i + 1 < valid.length; i += 2) {
        windowMeans.push((valid[i]! + valid[i + 1]!) / 2);
      }
      if (windowMeans.length < 1) return null;
      const sorted = [...windowMeans].sort((a, b) => a - b);
      // Remove up to 3 from each end (only if enough windows)
      const trim = Math.min(3, Math.floor(sorted.length / 3));
      const trimmed = sorted.slice(trim, sorted.length - trim);
      if (trimmed.length === 0) return null;
      return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    }

    setIndicators(prev => prev.map(ind => {
      if (ind.id === 5) return ind; // custom FormulaCard — skip
      let threshold: number | null = null;

      if (ind.presetKey) {
        const presetIdx = PRESET_OPTIONS.findIndex(p => p.value === ind.presetKey) - 1;
        if (presetIdx >= 0) {
          threshold = trimmedMean(data.map(d => d.presets[presetIdx] ?? null));
        }
      } else {
        const chIdx = CHANNEL_LABELS.indexOf(ind.channel as typeof CHANNEL_LABELS[number]);
        const bandIdx = NFB_BANDS.findIndex(b => b.name === ind.band);
        if (chIdx >= 0 && bandIdx >= 0) {
          threshold = trimmedMean(data.map(d => d.bands[chIdx]?.[bandIdx] ?? null));
        }
      }

      if (threshold !== null && threshold > 0) {
        return { ...ind, threshold, autoThreshold: false };
      }
      return ind;
    }));
  }, []);

  const handleBaseline = useCallback(() => {
    if (baselinePhase === 'recording') {
      baselinePhaseRef.current = 'idle';
      setBaselinePhase('idle');
      setBaselineProgress(0);
      baselineRecordRef.current = [];
      return;
    }
    baselineRecordRef.current = [];
    setBaselineProgress(0);
    baselinePhaseRef.current = 'recording';
    setBaselinePhase('recording');
  }, [baselinePhase]);

  // Apply baseline thresholds once recording completes
  useEffect(() => {
    if (baselinePhase === 'done') {
      computeAndApplyBaseline();
    }
  }, [baselinePhase, computeAndApplyBaseline]);

  const handleStartSession = useCallback(() => {
    sessionHistoryRef.current = []; // reset session-specific history
    setSessionDuration(0);
    setRewardRate(0);
    setOverallScore(0);
    setSessionRunning(true);
    const file = feedbackFileRef.current;
    if (file) {
      openFeedbackWindowWithFile(file);
    } else if (feedbackUrl.trim()) {
      openFeedbackWindow(feedbackUrl.trim());
    }
  }, [feedbackUrl, openFeedbackWindow, openFeedbackWindowWithFile]);

  // NFB audio: start/stop with session
  useEffect(() => {
    if (!nfbAudioEnabled || !nfbAudioSrc) return;
    if (sessionRunning) {
      if (!nfbAudioElRef.current) {
        nfbAudioElRef.current = new Audio();
        nfbAudioElRef.current.loop = true;
      }
      const el = nfbAudioElRef.current;
      if (el.src !== nfbAudioSrc.url) el.src = nfbAudioSrc.url;
      el.volume = overlayOpacity / 100;
      el.play().catch(() => {});
    } else {
      nfbAudioElRef.current?.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRunning, nfbAudioEnabled, nfbAudioSrc]);

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
    onChannelChange: (id: number, ch: Channel) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, channel: ch, presetKey: '', formula: '' } : i)),
    onBandChange: (id: number, b: Band) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, band: b, threshold: BAND_BASE[b]! * 1.2, presetKey: '', formula: '' } : i)),
    onDirectionChange: (id: number, d: Direction) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, direction: d } : i)),
    onThresholdChange: (id: number, delta: number) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, threshold: Math.max(0.5, i.threshold + delta) } : i)),
    onAutoThresholdToggle: (id: number) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, autoThreshold: !i.autoThreshold } : i)),
    onPresetApply: (id: number, presetKey: string, formula: string, direction: Direction) =>
      setIndicators(prev => prev.map(i => i.id === id ? { ...i, presetKey, formula, direction } : i)),
  };

  return (
    <LangContext.Provider value={lang ?? 'zh'}>
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
          <EegCard key={ind.id} indicator={ind} isLive={isLive} liveBandPower={liveBandPower} {...eegCardHandlers} />
        ))}
      </div>

      {/* ── Column 2: EEG even (#2 #4) + Cardiac ── */}
      <div style={colStyle}>
        {evenIndicators.map(ind => (
          <EegCard key={ind.id} indicator={ind} isLive={isLive} liveBandPower={liveBandPower} {...eegCardHandlers} />
        ))}
        <CardiacCard
          state={cardiac}
          isLive={visioMyndLive}
          liveHr={visioMyndHr}
          liveBreathing={visioMyndBreathing}
          onToggle={() => setCardiac(c => ({ ...c, enabled: !c.enabled }))}
          onMetricChange={m => setCardiac(c => ({
            ...c, metric: m,
            threshold: m === 'rmssd-t' ? 50 : 1.5,
            history: [],
          }))}
          onDirectionChange={d => setCardiac(c => ({ ...c, direction: d }))}
          onThresholdChange={delta => setCardiac(c => ({
            ...c,
            threshold: Math.max(c.metric === 'rmssd-t' ? 1 : 0.1, c.threshold + delta),
          }))}
          onAutoThresholdToggle={() => setCardiac(c => ({ ...c, autoThreshold: !c.autoThreshold }))}
          onOpenVisioMynd={handleOpenVisioMynd}
        />
      </div>

      {/* ── Column 3: BNB Controls ── */}
      <div style={colStyle}>
        <BnbColumn bnb={bnb} onChange={patch => setBnb(prev => ({ ...prev, ...patch }))}
          onAudioBlob={(url, name) => setBnbAudioBlob({ url, name })} />
      </div>

      {/* ── Column 4: Session Summary ── */}
      <div style={colStyle}>

        {/* Progress gauge + stats */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <ProgressGauge score={overallScore} lang={lang ?? 'zh'} />
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: T(lang ?? 'zh', 'trainDuration'), value: formatDuration(sessionDuration) },
                { label: T(lang ?? 'zh', 'trainTA'), value: `${targetAchievementPct}%` },
                { label: T(lang ?? 'zh', 'trainRR'), value: `${rewardRate}%` },
                { label: T(lang ?? 'zh', 'trainOO'), value: `${overlayOpacity}%` },
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
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{T(lang ?? 'zh', 'trainActivityLevel')}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f9a02e', fontFamily: 'ui-monospace,monospace' }}>
                Lv.{difficultyLevel} {DIFFICULTY_LABELS[lang ?? 'zh'][difficultyLevel - 1]} &nbsp;
                <span style={{ color: 'rgba(200,215,240,0.5)', fontWeight: 400 }}>TA={[36,49,62,75,88][difficultyLevel - 1]}%</span>
              </span>
            </div>
            <input type="range" min={1} max={5} step={1} value={difficultyLevel}
              onChange={e => setDifficultyLevel(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#f9a02e' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(93,109,134,0.6)', marginTop: 2 }}>
              <span>{T(lang ?? 'zh', 'trainEasiest')}</span><span>{T(lang ?? 'zh', 'trainHardest')}</span>
            </div>
          </div>
          {/* 持續度 slider */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 7, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{T(lang ?? 'zh', 'trainPersistLevel')}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#85e89d', fontFamily: 'ui-monospace,monospace' }}>
                Lv.{persistenceLevel} {PERSISTENCE_LABELS[lang ?? 'zh'][persistenceLevel - 1]} &nbsp;
                <span style={{ color: 'rgba(200,215,240,0.5)', fontWeight: 400 }}>window</span>
              </span>
            </div>
            <input type="range" min={1} max={5} step={1} value={persistenceLevel}
              onChange={e => setPersistenceLevel(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#85e89d' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(93,109,134,0.6)', marginTop: 2 }}>
              <span>{`${T(lang ?? 'zh', 'trainEasiest')} (5s)`}</span><span>{`${T(lang ?? 'zh', 'trainHardest')} (23s)`}</span>
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
                {m === 'and' ? T(lang ?? 'zh', 'trainAllOrNone') : T(lang ?? 'zh', 'trainAverage')}
              </button>
            ))}
          </div>
        </div>

        {/* Active indicators list */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>{T(lang ?? 'zh', 'trainActiveInd')}</div>
          {enabledIndicators.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: '8px 0' }}>{T(lang ?? 'zh', 'trainNoActiveInd')}</div>
          )}
          {enabledIndicators.map(ind => {
            const met = (ind.direction === 'up' && ind.value >= ind.threshold) || (ind.direction === 'down' && ind.value < ind.threshold);
            return (
              <div key={ind.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(93,109,134,0.15)' }}>
                <span style={{ fontSize: 12, color: '#dce9f8' }}>
                  {T(lang ?? 'zh', 'trainEegCard')}{ind.id}&nbsp;
                  <span style={{ color: 'var(--text-secondary)' }}>{ind.direction === 'up' ? '↑' : '↓'} {ind.id === 5 ? T(lang ?? 'zh', 'trainFormula') : `${ind.channel} · ${ind.band}`}</span>
                </span>
                <Badge label={met ? T(lang ?? 'zh', 'trainMet') : T(lang ?? 'zh', 'trainNotMet')} color={met ? '#3fb950' : '#f85149'} bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
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
                label={(cardiac.lfHfRatio >= cardiac.threshold) === (cardiac.direction === 'up') ? T(lang ?? 'zh', 'trainMet') : T(lang ?? 'zh', 'trainNotMet')}
                color={(cardiac.lfHfRatio >= cardiac.threshold) === (cardiac.direction === 'up') ? '#3fb950' : '#f85149'}
                bg={(cardiac.lfHfRatio >= cardiac.threshold) === (cardiac.direction === 'up') ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'}
              />
            </div>
          )}
        </div>

        {/* Feedback content */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>{T(lang ?? 'zh', 'trainFeedbackContent')}</div>
          <input type="url" placeholder={T(lang ?? 'zh', 'trainFeedbackUrlPlaceholder')}
            value={feedbackUrl} onChange={e => { setFeedbackUrl(e.target.value); setFeedbackFile(null); feedbackFileRef.current = null; }}
            style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, padding: '6px 8px', marginBottom: 6, boxSizing: 'border-box' }} />
          {/* Hidden file inputs */}
          <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setFeedbackFile(f); setFeedbackUrl(''); } e.target.value = ''; }} />
          <input ref={pptxInputRef} type="file" accept=".pptx" style={{ display: 'none' }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setFeedbackFile(f); setFeedbackUrl(''); } e.target.value = ''; }} />
          <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setFeedbackFile(f); setFeedbackUrl(''); } e.target.value = ''; }} />
          {/* File picker buttons */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['video', 'pptx', 'pdf'] as const).map((type) => {
              const labels: Record<string, string> = { video: T(lang ?? 'zh', 'trainVideoBtn'), pptx: T(lang ?? 'zh', 'trainSlideBtn'), pdf: T(lang ?? 'zh', 'trainPdfBtn') };
              const refs: Record<string, React.RefObject<HTMLInputElement | null>> = { video: videoInputRef, pptx: pptxInputRef, pdf: pdfInputRef };
              const isSelected = feedbackFile && (
                type === 'pdf' ? feedbackFile.name.toLowerCase().endsWith('.pdf')
                : type === 'pptx' ? feedbackFile.name.toLowerCase().endsWith('.pptx')
                : !feedbackFile.name.toLowerCase().endsWith('.pdf') && !feedbackFile.name.toLowerCase().endsWith('.pptx')
              );
              return (
                <button key={type} onClick={() => refs[type].current?.click()} style={{
                  flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${isSelected ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`,
                  background: isSelected ? 'rgba(88,166,255,0.15)' : 'var(--bg-secondary)',
                  color: isSelected ? '#58a6ff' : 'var(--text-secondary)',
                }}>{labels[type]}</button>
              );
            })}
          </div>
          {feedbackFile && (
            <div style={{ fontSize: 10, color: 'rgba(88,166,255,0.7)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>{feedbackFile.name}</span>
              <button onClick={() => { setFeedbackFile(null); feedbackFileRef.current = null; }} style={{ background: 'none', border: 'none', color: 'rgba(248,81,73,0.7)', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{T(lang ?? 'zh', 'trainOverlayAuto')}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#58a6ff', fontFamily: 'ui-monospace,monospace' }}>{overlayOpacity}%</span>
          </div>
          <div style={{
            width: '100%', height: 48,
            background: `rgba(0,0,0,${1 - overlayOpacity / 100})`,
            border: '1px dashed rgba(93,109,134,0.4)', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
          }}>
            {(feedbackUrl || feedbackFile) ? (
              <span style={{ color: `rgba(88,166,255,${overlayOpacity / 100})`, fontSize: 11 }}>
                {feedbackFile
                  ? feedbackFile.name.slice(0, 32) + (feedbackFile.name.length > 32 ? '…' : '')
                  : feedbackUrl.slice(0, 32) + (feedbackUrl.length > 32 ? '…' : '')}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'rgba(93,109,134,0.5)' }}>{T(lang ?? 'zh', 'trainOverlayPreview')}</span>
            )}
          </div>
          {/* NFB Audio Feedback */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={nfbAudioEnabled} onChange={e => setNfbAudioEnabled(e.target.checked)}
                style={{ accentColor: '#58a6ff', width: 13, height: 13 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: nfbAudioEnabled ? '#58a6ff' : 'var(--text-secondary)' }}>
                {T(lang ?? 'zh', 'trainAudioFeedback')}
              </span>
            </label>
            {nfbAudioEnabled && (
              <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <input ref={nfbAudioInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0];
                    if (f) setNfbAudioSrc({ url: URL.createObjectURL(f), name: f.name });
                    e.target.value = '';
                  }} />
                <button onClick={() => nfbAudioInputRef.current?.click()} style={{
                  flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${nfbAudioSrc && !bnbAudioBlob?.url?.startsWith(nfbAudioSrc.url) ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`,
                  background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                }}>{T(lang ?? 'zh', 'trainPickAudio')}</button>
                {bnbAudioBlob && (
                  <button onClick={() => setNfbAudioSrc(bnbAudioBlob)} style={{
                    flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${nfbAudioSrc?.url === bnbAudioBlob.url ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`,
                    background: nfbAudioSrc?.url === bnbAudioBlob.url ? 'rgba(88,166,255,0.15)' : 'var(--bg-secondary)',
                    color: nfbAudioSrc?.url === bnbAudioBlob.url ? '#58a6ff' : 'var(--text-secondary)',
                  }}>{T(lang ?? 'zh', 'trainUseBnbAudio')}</button>
                )}
                {nfbAudioSrc && (
                  <div style={{ width: '100%', fontSize: 10, color: 'rgba(88,166,255,0.7)', marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>{nfbAudioSrc.name}</span>
                    <button onClick={() => setNfbAudioSrc(null)} style={{ background: 'none', border: 'none', color: 'rgba(248,81,73,0.7)', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>✕</button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Baseline button */}
            <button
              onClick={handleBaseline}
              style={{
                flex: '0 0 auto', padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: baselinePhase === 'recording'
                  ? 'rgba(248,129,74,0.25)'
                  : baselinePhase === 'done'
                    ? 'rgba(63,185,80,0.25)'
                    : 'rgba(93,109,134,0.3)',
                color: baselinePhase === 'recording' ? 'rgba(248,129,74,0.9)' : baselinePhase === 'done' ? '#3fb950' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                border: `1px solid ${baselinePhase === 'recording' ? 'rgba(248,129,74,0.4)' : baselinePhase === 'done' ? 'rgba(63,185,80,0.4)' : 'var(--border)'}`,
              }}
            >
              {baselinePhase === 'recording'
                ? `${T(lang ?? 'zh', 'trainBaselineStop')} ${30 - baselineProgress}s`
                : baselinePhase === 'done'
                  ? T(lang ?? 'zh', 'trainBaselineDone')
                  : T(lang ?? 'zh', 'trainBaseline')}
            </button>
            {/* Start / Stop session button */}
            <button
              onClick={sessionRunning ? handleStopSession : handleStartSession}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7, border: 'none',
                background: sessionRunning
                  ? 'linear-gradient(90deg, rgba(248,81,73,0.7), rgba(200,50,50,0.6))'
                  : 'linear-gradient(90deg, rgba(88,166,255,0.7), rgba(40,100,200,0.6))',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em',
              }}
            >
              {sessionRunning ? T(lang ?? 'zh', 'trainStopSession') : T(lang ?? 'zh', 'trainStartSession')}
            </button>
          </div>
        </div>

        {/* Operator notes */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>{T(lang ?? 'zh', 'trainOpNotes')}</div>
          <textarea value={operatorNotes} onChange={e => setOperatorNotes(e.target.value)}
            placeholder={T(lang ?? 'zh', 'trainOpNotesPlaceholder')} rows={4}
            style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
      </div>
    </div>
    </LangContext.Provider>
  );
};
