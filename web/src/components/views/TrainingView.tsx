import { useEffect, useRef, useState, useCallback, type FC, type ChangeEvent } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

type Channel = 'Fp1' | 'Fp2' | 'F3' | 'F4' | 'C3' | 'C4' | 'P3' | 'P4';
type Band = 'Delta' | 'Theta' | 'Alpha' | 'SMR' | 'Beta' | 'Hi-Beta' | 'Gamma';
type Direction = 'up' | 'down';
type OscWaveform = 'sine' | 'square' | 'triangle' | 'sawtooth';
type BnbMethod = 'global-ssb' | 'band-shift' | 'sub-layer';
type ModTrend = 'up' | 'down' | 'random';

const CHANNELS: Channel[] = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4'];
const BANDS: Band[] = ['Delta', 'Theta', 'Alpha', 'SMR', 'Beta', 'Hi-Beta', 'Gamma'];

const BAND_BASE: Record<Band, number> = {
  Delta: 18, Theta: 22, Alpha: 28, SMR: 14, Beta: 12, 'Hi-Beta': 8, Gamma: 6,
};

const BNB_METHOD_DESC: Record<BnbMethod, string> = {
  'global-ssb': 'Single-sideband: both channels share one carrier, beat encoded as phase offset.',
  'band-shift': 'Each channel plays at base ± (beat/2) Hz for a pure frequency difference.',
  'sub-layer': 'Carrier hidden below audible range; beat modulates amplitude envelope.',
};

interface EegIndicator {
  id: number;
  enabled: boolean;
  channel: Channel;
  band: Band;
  direction: Direction;
  value: number;
  threshold: number;
  history: number[];
}

interface CardiacState {
  lfValue: number;
  hfValue: number;
  lfHfRatio: number;
  direction: Direction;
  threshold: number;
  history: number[];
}

// ── Simulation helpers ─────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function randomDrift(current: number, base: number, speed: number): number {
  const noise = (Math.random() - 0.5) * base * 0.3 * speed;
  const pull = (base - current) * 0.05;
  return Math.max(0.5, current + noise + pull);
}

// ── Sub-components ──────────────────────────────────────────────────────────

const Badge: FC<{ label: string; color: string; bg: string }> = ({ label, color, bg }) => (
  <span style={{
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 600, color, background: bg, letterSpacing: '0.03em',
  }}>{label}</span>
);

const HistCanvas: FC<{ history: number[]; threshold: number; width?: number; height?: number }> = ({
  history, threshold, width = 180, height = 54,
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
    const max = Math.max(...history, threshold * 1.1, 1);
    const barW = Math.floor(w / history.length);
    history.forEach((v, i) => {
      const barH = Math.round((v / max) * (h - 4));
      ctx.fillStyle = v >= threshold ? 'rgba(63,185,80,0.75)' : 'rgba(88,166,255,0.55)';
      ctx.fillRect(i * barW, h - barH, barW - 1, barH);
    });
    const ty = Math.round(h - (threshold / max) * (h - 4));
    ctx.strokeStyle = 'rgba(248,129,74,0.85)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([]);
  }, [history, threshold]);
  const evenWidth = width % 2 === 0 ? width : width - 1;
  return <canvas ref={canvasRef} width={evenWidth} height={height} style={{ width: evenWidth, height, display: 'block', borderRadius: 4 }} />;
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

const threshBtnStyle: React.CSSProperties = {
  width: 28, height: 24,
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 5,
  color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
};

const EegCard: FC<{
  indicator: EegIndicator;
  onToggle: (id: number) => void;
  onChannelChange: (id: number, ch: Channel) => void;
  onBandChange: (id: number, b: Band) => void;
  onDirectionChange: (id: number, d: Direction) => void;
  onThresholdChange: (id: number, delta: number) => void;
}> = ({ indicator, onToggle, onChannelChange, onBandChange, onDirectionChange, onThresholdChange }) => {
  const aboveThreshold = indicator.value >= indicator.threshold;
  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 5,
    color: 'var(--text-primary)', fontSize: 12, padding: '3px 6px', cursor: 'pointer', flex: 1,
  };
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10, opacity: indicator.enabled ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>EEG #{indicator.id}</span>
        <button onClick={() => onToggle(indicator.id)} style={{ background: indicator.enabled ? 'rgba(63,185,80,0.2)' : 'rgba(100,115,135,0.2)', border: `1px solid ${indicator.enabled ? 'rgba(63,185,80,0.5)' : 'rgba(100,115,135,0.4)'}`, borderRadius: 5, color: indicator.enabled ? '#3fb950' : '#6b7580', fontSize: 11, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>
          {indicator.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <select value={indicator.channel} onChange={e => onChannelChange(indicator.id, e.target.value as Channel)} style={selectStyle}>
          {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
        </select>
        <select value={indicator.band} onChange={e => onBandChange(indicator.id, e.target.value as Band)} style={selectStyle}>
          {BANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['up', 'down'] as Direction[]).map(d => (
          <button key={d} onClick={() => onDirectionChange(indicator.id, d)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)') : 'var(--border)'}`, background: indicator.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)') : 'var(--bg-tertiary)', color: indicator.direction === d ? (d === 'up' ? '#3fb950' : '#f85149') : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {d === 'up' ? '↑ Up' : '↓ Down'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>
          {indicator.value.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>μV²</span>
        </span>
        <Badge label={aboveThreshold ? (indicator.direction === 'up' ? 'ON' : 'OFF') : (indicator.direction === 'up' ? 'OFF' : 'ON')} color={aboveThreshold ? '#3fb950' : '#f85149'} bg={aboveThreshold ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <HistCanvas history={indicator.history} threshold={indicator.threshold} width={180} height={52} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => onThresholdChange(indicator.id, -1)} style={threshBtnStyle}>−</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'rgba(248,129,74,0.9)', fontFamily: 'ui-monospace,monospace' }}>{indicator.threshold.toFixed(1)} μV²</span>
        <button onClick={() => onThresholdChange(indicator.id, 1)} style={threshBtnStyle}>+</button>
      </div>
    </div>
  );
};

// Cardiac card — badge fixed to VisioMynd
const CardiacCard: FC<{
  state: CardiacState;
  onDirectionChange: (d: Direction) => void;
  onThresholdChange: (delta: number) => void;
}> = ({ state, onDirectionChange, onThresholdChange }) => {
  const ratio = state.lfHfRatio;
  const aboveThreshold = ratio >= state.threshold;
  const met = aboveThreshold === (state.direction === 'up');
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(88,166,255,0.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>Cardiac</span>
        <Badge label="VisioMynd LF/HF" color="#8ecfff" bg="rgba(88,166,255,0.15)" />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        {([['LF', state.lfValue], ['HF', state.hfValue]] as [string, number][]).map(([k, v]) => (
          <div key={k}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k}</span>
            <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>{(v as number).toFixed(2)}</div>
          </div>
        ))}
        <div style={{ flex: 1, textAlign: 'right' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LF/HF</span>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#f9a02e', fontWeight: 600 }}>{ratio.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['up', 'down'] as Direction[]).map(d => (
          <button key={d} onClick={() => onDirectionChange(d)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${state.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)') : 'var(--border)'}`, background: state.direction === d ? (d === 'up' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)') : 'var(--bg-tertiary)', color: state.direction === d ? (d === 'up' ? '#3fb950' : '#f85149') : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {d === 'up' ? '↑ Up' : '↓ Down'}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: 8 }}>
        <LineCanvas history={state.history} threshold={state.threshold} color="#f9a02e" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <button onClick={() => onThresholdChange(-0.1)} style={threshBtnStyle}>−</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'rgba(248,129,74,0.9)', fontFamily: 'ui-monospace,monospace' }}>{state.threshold.toFixed(1)}</span>
        <button onClick={() => onThresholdChange(0.1)} style={threshBtnStyle}>+</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Badge label={met ? '達標' : '未達標'} color={met ? '#3fb950' : '#f85149'} bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
      </div>
    </div>
  );
};

// ── Progress gauge ─────────────────────────────────────────────────────────

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
  progress: number;      // 0–100
  volume: number;        // 0–100
  oscEnabled: boolean;
  oscWaveform: OscWaveform;
  oscFreq: number;
  oscVolume: number;     // 0–100
  bbFixed: boolean;
  bbMinHz: number;
  bbMaxHz: number;
  bbCurrentHz: number;
  bnbMethod: BnbMethod;
  modEnabled: boolean;
  modInterval: number;   // ms
  modStep: number;       // Hz
  modTrend: ModTrend;
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
  modEnabled: false,
  modInterval: 500,
  modStep: 0.5,
  modTrend: 'random',
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

  const handleFile = (file: File) => {
    if (file) onChange({ audioFileName: file.name, playState: 'stopped', progress: 0 });
  };

  const formatHz = (v: number) => v < 10 ? v.toFixed(2) : v.toFixed(1);

  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 10, padding: '14px', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#8ecfff' }}>BNB Controls</span>
        <Badge label="Binaural Beat" color="#8ecfff" bg="rgba(88,166,255,0.15)" />
      </div>

      {/* ── 1. File Load ── */}
      <div style={subHeaderStyle as React.CSSProperties}>Audio File</div>
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        style={{
          border: `1px dashed ${dragging ? '#58a6ff' : 'rgba(93,109,134,0.4)'}`,
          borderRadius: 7, padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
          background: dragging ? 'rgba(88,166,255,0.07)' : 'var(--bg-tertiary)',
          marginBottom: 6, transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 12, color: bnb.audioFileName ? '#58a6ff' : 'var(--text-secondary)' }}>
          {bnb.audioFileName || 'Drop WAV / MP3 here or click to browse'}
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept=".wav,.mp3,audio/*" style={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      {/* ── 2. Playback Controls ── */}
      <div style={subHeaderStyle as React.CSSProperties}>Playback</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {([['▶', 'playing'], ['⏸', 'paused'], ['⏹', 'stopped']] as [string, BnbState['playState']][]).map(([icon, state]) => (
          <button key={state} onClick={() => onChange({ playState: state })}
            style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1px solid ${bnb.playState === state ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.playState === state ? 'rgba(88,166,255,0.2)' : 'var(--bg-tertiary)', color: bnb.playState === state ? '#8ecfff' : 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>
            {icon}
          </button>
        ))}
      </div>

      {/* Progress bar */}
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

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Vol</span>
        <input type="range" min={0} max={100} value={bnb.volume}
          onChange={e => onChange({ volume: parseInt(e.target.value) })}
          style={{ flex: 1, accentColor: '#3fb950' }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace,monospace', width: 34, textAlign: 'right' }}>{bnb.volume}%</span>
      </div>

      {/* ── 3. Oscillator Source ── */}
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
              {(['sine', 'square', 'triangle', 'sawtooth'] as OscWaveform[]).map(w => (
                <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Freq (Hz)</span>
            <input type="number" min={20} max={20000} value={bnb.oscFreq}
              onChange={e => onChange({ oscFreq: parseFloat(e.target.value) || 440 })}
              style={inputStyle} disabled={!bnb.oscEnabled} />
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

      {/* ── 4. Binaural Beat Frequency ── */}
      <div style={subHeaderStyle as React.CSSProperties}>Binaural Beat Frequency</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={bnb.bbFixed} onChange={e => onChange({ bbFixed: e.target.checked })} style={{ accentColor: '#58a6ff' }} />
        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>Fixed Frequency</span>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8, opacity: bnb.bbFixed ? 0.4 : 1 }}>
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
      {/* Band shortcuts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        {BNB_BANDS.map(b => (
          <button key={b.label} onClick={() => onChange({ bbMinHz: b.min, bbMaxHz: b.max, bbCurrentHz: (b.min + b.max) / 2, bbFixed: false })}
            style={{ padding: '3px 7px', borderRadius: 5, border: `1px solid ${bnb.bbCurrentHz >= b.min && bnb.bbCurrentHz <= b.max ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.bbCurrentHz >= b.min && bnb.bbCurrentHz <= b.max ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: bnb.bbCurrentHz >= b.min && bnb.bbCurrentHz <= b.max ? '#8ecfff' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {b.sym} {b.label}
          </button>
        ))}
      </div>

      {/* ── 5. Binaural Method ── */}
      <div style={subHeaderStyle as React.CSSProperties}>Binaural Method</div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
        {([['global-ssb', 'Global SSB'], ['band-shift', 'Band-Shift'], ['sub-layer', 'Sub-Layer']] as [BnbMethod, string][]).map(([id, label]) => (
          <button key={id} onClick={() => onChange({ bnbMethod: id })}
            style={{ flex: 1, padding: '5px 4px', borderRadius: 6, border: `1px solid ${bnb.bnbMethod === id ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.bnbMethod === id ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: bnb.bnbMethod === id ? '#8ecfff' : 'var(--text-secondary)', fontSize: 10, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-tertiary)', borderRadius: 6, padding: '7px 9px', marginBottom: 4 }}>
        {BNB_METHOD_DESC[bnb.bnbMethod]}
      </div>

      {/* ── 6. Modulation ── */}
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
            {(['up', 'down', 'random'] as ModTrend[]).map(t => (
              <button key={t} onClick={() => onChange({ modTrend: t })} disabled={!bnb.modEnabled}
                style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${bnb.modTrend === t ? 'rgba(88,166,255,0.6)' : 'var(--border)'}`, background: bnb.modTrend === t ? 'rgba(88,166,255,0.18)' : 'var(--bg-tertiary)', color: bnb.modTrend === t ? '#8ecfff' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                {t === 'up' ? '↑' : t === 'down' ? '↓' : '⇅'} {t}
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

function makeDefaultIndicators(): EegIndicator[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    enabled: i < 2,
    channel: CHANNELS[i % CHANNELS.length],
    band: BANDS[i % BANDS.length],
    direction: 'up' as Direction,
    value: BAND_BASE[BANDS[i % BANDS.length]],
    threshold: BAND_BASE[BANDS[i % BANDS.length]] * 1.2,
    history: [],
  }));
}

export const TrainingView: FC = () => {
  const [indicators, setIndicators] = useState<EegIndicator[]>(makeDefaultIndicators);
  const [cardiac, setCardiac] = useState<CardiacState>({
    lfValue: 0.8, hfValue: 0.65, lfHfRatio: 1.2,
    direction: 'up', threshold: 1.5, history: [],
  });
  const [bnb, setBnb] = useState<BnbState>(DEFAULT_BNB);

  // Session
  const [sessionRunning, setSessionRunning] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [aboveThresholdPct, setAboveThresholdPct] = useState(0);
  const [rewardRate, setRewardRate] = useState(0);
  const [feedbackUrl, setFeedbackUrl] = useState('');
  const [operatorNotes, setOperatorNotes] = useState('');
  const [overallScore, setOverallScore] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(0); // 0=全黑, 100=全透明
  const [simSpeed, setSimSpeed] = useState(1);

  const aboveCountRef = useRef(0);
  const totalCountRef = useRef(0);
  const feedbackWindowRef = useRef<Window | null>(null);

  // ── postMessage helper ──
  const sendToFeedbackWindow = useCallback((data: Record<string, unknown>) => {
    const win = feedbackWindowRef.current;
    if (win && !win.closed) win.postMessage(data, '*');
  }, []);

  const applyOverlay = useCallback((opacityPct: number) => {
    // opacityPct=0 → overlay fully black (overlay CSS opacity=1)
    // opacityPct=100 → overlay invisible (overlay CSS opacity=0)
    sendToFeedbackWindow({ type: 'nfb_overlay', opacity: 1 - opacityPct / 100 });
  }, [sendToFeedbackWindow]);

  // ── Simulation tick ──
  const tick = useCallback(() => {
    const speed = simSpeed;

    // EEG
    setIndicators(prev => prev.map(ind => {
      if (!ind.enabled) return ind;
      const base = BAND_BASE[ind.band];
      const newVal = randomDrift(ind.value, base, speed);
      return { ...ind, value: newVal, history: [...ind.history, newVal].slice(-HISTORY_LEN) };
    }));

    // Cardiac (always simulate)
    setCardiac(c => {
      const next = Math.max(0.3, Math.min(4, c.lfHfRatio + (Math.random() - 0.5) * 0.15 * speed));
      return {
        ...c, lfHfRatio: next,
        lfValue: next * 0.7 + 0.1, hfValue: Math.max(0.05, 0.7 - next * 0.05 + 0.1),
        history: [...c.history, next].slice(-HISTORY_LEN),
      };
    });

    // BNB: drift bbCurrentHz when not fixed
    setBnb(b => {
      if (b.bbFixed) return b;
      const range = b.bbMaxHz - b.bbMinHz;
      if (range <= 0) return b;
      let next = b.bbCurrentHz;
      if (b.modEnabled) {
        const step = b.modStep * (b.modTrend === 'up' ? 1 : b.modTrend === 'down' ? -1 : (Math.random() > 0.5 ? 1 : -1));
        next = Math.max(b.bbMinHz, Math.min(b.bbMaxHz, b.bbCurrentHz + step * speed * 0.1));
      } else {
        next = Math.max(b.bbMinHz, Math.min(b.bbMaxHz, b.bbCurrentHz + (Math.random() - 0.5) * 0.1 * speed));
      }
      return { ...b, bbCurrentHz: next };
    });

    // Session stats
    if (sessionRunning) {
      setSessionDuration(d => d + 1);
      setIndicators(current => {
        const enabled = current.filter(i => i.enabled);
        const above = enabled.filter(i => i.value >= i.threshold).length;
        totalCountRef.current += Math.max(enabled.length, 1);
        aboveCountRef.current += above;
        const pct = Math.round((aboveCountRef.current / totalCountRef.current) * 100);
        setAboveThresholdPct(pct);
        setRewardRate(Math.round(pct * 0.85));
        setOverallScore(Math.min(100, Math.round(pct * 0.9)));
        // Send stats to feedback window
        sendToFeedbackWindow({ type: 'nfb_status', pct, duration: sessionDuration });
        return current;
      });
    }
  }, [simSpeed, sessionRunning, sessionDuration, sendToFeedbackWindow]);

  useEffect(() => {
    const interval = setInterval(tick, Math.round(1000 / simSpeed));
    return () => clearInterval(interval);
  }, [tick, simSpeed]);

  // ── Open feedback window ──
  const openFeedbackWindow = useCallback((url: string) => {
    const win = window.open('', 'nfb_feedback_window', 'width=1280,height=800,resizable=yes');
    if (!win) return;
    feedbackWindowRef.current = win;
    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>NFB Feedback</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:100vw;height:100vh;overflow:hidden;background:#000}
  iframe{position:absolute;inset:0;width:100%;height:100%;border:none}
  #overlay{position:absolute;inset:0;background:#000;opacity:1;pointer-events:none;transition:opacity 0.4s ease}
</style>
</head>
<body>
  <iframe src="${url.replace(/"/g, '&quot;')}" allow="autoplay; fullscreen; camera; microphone" allowfullscreen></iframe>
  <div id="overlay"></div>
  <script>
    window.addEventListener('message', function(e){
      var d = e.data;
      if(d && d.type === 'nfb_overlay'){
        document.getElementById('overlay').style.opacity = d.opacity;
      }
    });
  </script>
</body>
</html>`);
    win.document.close();
    // Start fully opaque, then apply current opacity after a short delay
    setTimeout(() => applyOverlay(overlayOpacity), 600);
  }, [applyOverlay, overlayOpacity]);

  const handleStartSession = useCallback(() => {
    aboveCountRef.current = 0;
    totalCountRef.current = 0;
    setSessionDuration(0);
    setAboveThresholdPct(0);
    setRewardRate(0);
    setOverallScore(0);
    setSessionRunning(true);
    if (feedbackUrl.trim()) openFeedbackWindow(feedbackUrl.trim());
  }, [feedbackUrl, openFeedbackWindow]);

  const handleStopSession = useCallback(() => {
    setSessionRunning(false);
  }, []);

  const handleOverlayChange = (val: number) => {
    setOverlayOpacity(val);
    applyOverlay(val);
  };

  const oddIndicators = indicators.filter(i => i.id % 2 !== 0);
  const evenIndicators = indicators.filter(i => i.id % 2 === 0);
  const enabledIndicators = indicators.filter(i => i.enabled);

  const formatDuration = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  const colStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', paddingRight: 4,
  };
  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 8, padding: '2px 0', borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', overflow: 'hidden' }}>

      {/* ── Column 1: EEG odd ── */}
      <div style={colStyle}>
        <div style={sectionHeaderStyle}>EEG NFB #1 #3 #5</div>
        {oddIndicators.map(ind => (
          <EegCard key={ind.id} indicator={ind}
            onToggle={id => setIndicators(prev => prev.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i))}
            onChannelChange={(id, ch) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, channel: ch } : i))}
            onBandChange={(id, b) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, band: b, threshold: BAND_BASE[b] * 1.2 } : i))}
            onDirectionChange={(id, d) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, direction: d } : i))}
            onThresholdChange={(id, delta) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, threshold: Math.max(0.5, i.threshold + delta) } : i))}
          />
        ))}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginTop: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Sim Speed: {simSpeed.toFixed(1)}×</div>
          <input type="range" min={0.2} max={4} step={0.1} value={simSpeed}
            onChange={e => setSimSpeed(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#58a6ff' }} />
        </div>
      </div>

      {/* ── Column 2: EEG even + Cardiac ── */}
      <div style={colStyle}>
        <div style={sectionHeaderStyle}>EEG NFB #2 #4 + Cardiac</div>
        {evenIndicators.map(ind => (
          <EegCard key={ind.id} indicator={ind}
            onToggle={id => setIndicators(prev => prev.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i))}
            onChannelChange={(id, ch) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, channel: ch } : i))}
            onBandChange={(id, b) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, band: b, threshold: BAND_BASE[b] * 1.2 } : i))}
            onDirectionChange={(id, d) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, direction: d } : i))}
            onThresholdChange={(id, delta) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, threshold: Math.max(0.5, i.threshold + delta) } : i))}
          />
        ))}
        <CardiacCard
          state={cardiac}
          onDirectionChange={d => setCardiac(c => ({ ...c, direction: d }))}
          onThresholdChange={delta => setCardiac(c => ({ ...c, threshold: Math.max(0.1, c.threshold + delta) }))}
        />
      </div>

      {/* ── Column 3: BNB Controls ── */}
      <div style={colStyle}>
        <div style={sectionHeaderStyle}>BNB Controls</div>
        <BnbColumn bnb={bnb} onChange={patch => setBnb(prev => ({ ...prev, ...patch }))} />
      </div>

      {/* ── Column 4: Session Summary ── */}
      <div style={colStyle}>
        <div style={sectionHeaderStyle}>Session Summary</div>

        {/* Progress gauge + stats */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', marginBottom: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ProgressGauge score={overallScore} />
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            {[
              { label: 'Duration', value: formatDuration(sessionDuration) },
              { label: 'Above Threshold', value: `${aboveThresholdPct}%` },
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
                  <span style={{ color: 'var(--text-secondary)' }}>{ind.direction === 'up' ? '↑' : '↓'} {ind.channel} · {ind.band}</span>
                </span>
                <Badge label={met ? '達標' : '未達標'} color={met ? '#3fb950' : '#f85149'} bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'} />
              </div>
            );
          })}
          {/* Cardiac row */}
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
        </div>

        {/* Feedback content */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Feedback Content</div>
          <input type="url" placeholder="Feedback URL (e.g. https://…)"
            value={feedbackUrl} onChange={e => setFeedbackUrl(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, padding: '6px 8px', marginBottom: 8, boxSizing: 'border-box' }} />

          {/* Overlay opacity control */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>遮罩透明度</span>
              <span style={{ fontSize: 11, color: '#58a6ff', fontFamily: 'ui-monospace,monospace' }}>{overlayOpacity}%</span>
            </div>
            <input type="range" min={0} max={100} value={overlayOpacity}
              onChange={e => handleOverlayChange(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#58a6ff' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(93,109,134,0.6)', marginTop: 2 }}>
              <span>全黑</span><span>全透明</span>
            </div>
          </div>

          {/* Overlay preview */}
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
