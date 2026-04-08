import { useEffect, useRef, useState, useCallback, type FC } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

type Channel = 'Fp1' | 'Fp2' | 'F3' | 'F4' | 'C3' | 'C4' | 'P3' | 'P4';
type Band = 'Delta' | 'Theta' | 'Alpha' | 'SMR' | 'Beta' | 'Hi-Beta' | 'Gamma';
type Direction = 'up' | 'down';

const CHANNELS: Channel[] = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4'];
const BANDS: Band[] = ['Delta', 'Theta', 'Alpha', 'SMR', 'Beta', 'Hi-Beta', 'Gamma'];

// Band center frequencies for simulation variance
const BAND_BASE: Record<Band, number> = {
  Delta: 18, Theta: 22, Alpha: 28, SMR: 14, Beta: 12, 'Hi-Beta': 8, Gamma: 6,
};

interface EegIndicator {
  id: number;
  enabled: boolean;
  channel: Channel;
  band: Band;
  direction: Direction;
  value: number;       // current μV²
  threshold: number;
  history: number[];   // last 60 values for histogram
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
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    color,
    background: bg,
    letterSpacing: '0.03em',
  }}>{label}</span>
);

// Small histogram canvas
const HistCanvas: FC<{ history: number[]; threshold: number; width?: number; height?: number }> = ({
  history, threshold, width = 180, height = 54,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (history.length < 2) return;
    const max = Math.max(...history, threshold * 1.1, 1);
    const barW = Math.floor(w / history.length);

    history.forEach((v, i) => {
      const barH = Math.round((v / max) * (h - 4));
      const aboveThreshold = v >= threshold;
      ctx.fillStyle = aboveThreshold ? 'rgba(63,185,80,0.75)' : 'rgba(88,166,255,0.55)';
      ctx.fillRect(i * barW, h - barH, barW - 1, barH);
    });

    // Threshold line
    const ty = Math.round(h - (threshold / max) * (h - 4));
    ctx.strokeStyle = 'rgba(248,129,74,0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(w, ty);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [history, threshold]);

  // Use even pixel width
  const evenWidth = width % 2 === 0 ? width : width - 1;
  return (
    <canvas
      ref={canvasRef}
      width={evenWidth}
      height={height}
      style={{ width: evenWidth, height, display: 'block', borderRadius: 4 }}
    />
  );
};

// Small line chart canvas for cardiac history
const LineCanvas: FC<{ history: number[]; threshold: number; color?: string }> = ({
  history, threshold, color = '#58a6ff',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (history.length < 2) return;

    const max = Math.max(...history, threshold * 1.2, 0.1);
    const min = 0;
    const range = max - min;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Threshold line
    const ty = h - ((threshold - min) / range) * (h - 4) - 2;
    ctx.strokeStyle = 'rgba(248,129,74,0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(w, ty);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [history, threshold, color]);

  return (
    <canvas
      ref={canvasRef}
      width={178}
      height={50}
      style={{ width: 178, height: 50, display: 'block', borderRadius: 4 }}
    />
  );
};

// EEG Indicator card
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
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    color: 'var(--text-primary)',
    fontSize: 12,
    padding: '3px 6px',
    cursor: 'pointer',
    flex: 1,
  };

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 10,
      opacity: indicator.enabled ? 1 : 0.55,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>EEG #{indicator.id}</span>
        <button
          onClick={() => onToggle(indicator.id)}
          style={{
            background: indicator.enabled ? 'rgba(63,185,80,0.2)' : 'rgba(100,115,135,0.2)',
            border: `1px solid ${indicator.enabled ? 'rgba(63,185,80,0.5)' : 'rgba(100,115,135,0.4)'}`,
            borderRadius: 5,
            color: indicator.enabled ? '#3fb950' : '#6b7580',
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          {indicator.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Channel + Band selectors */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <select
          value={indicator.channel}
          onChange={e => onChannelChange(indicator.id, e.target.value as Channel)}
          style={selectStyle}
        >
          {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
        </select>
        <select
          value={indicator.band}
          onChange={e => onBandChange(indicator.id, e.target.value as Band)}
          style={selectStyle}
        >
          {BANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Direction buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => onDirectionChange(indicator.id, 'up')}
          style={{
            flex: 1,
            padding: '4px 0',
            borderRadius: 5,
            border: `1px solid ${indicator.direction === 'up' ? 'rgba(63,185,80,0.6)' : 'var(--border)'}`,
            background: indicator.direction === 'up' ? 'rgba(63,185,80,0.15)' : 'var(--bg-tertiary)',
            color: indicator.direction === 'up' ? '#3fb950' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ↑ Up
        </button>
        <button
          onClick={() => onDirectionChange(indicator.id, 'down')}
          style={{
            flex: 1,
            padding: '4px 0',
            borderRadius: 5,
            border: `1px solid ${indicator.direction === 'down' ? 'rgba(248,81,73,0.6)' : 'var(--border)'}`,
            background: indicator.direction === 'down' ? 'rgba(248,81,73,0.15)' : 'var(--bg-tertiary)',
            color: indicator.direction === 'down' ? '#f85149' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ↓ Down
        </button>
      </div>

      {/* Current value + badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>
          {indicator.value.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>μV²</span>
        </span>
        <Badge
          label={aboveThreshold ? (indicator.direction === 'up' ? 'ON' : 'OFF') : (indicator.direction === 'up' ? 'OFF' : 'ON')}
          color={aboveThreshold ? '#3fb950' : '#f85149'}
          bg={aboveThreshold ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'}
        />
      </div>

      {/* Histogram */}
      <div style={{ marginBottom: 8 }}>
        <HistCanvas history={indicator.history} threshold={indicator.threshold} width={180} height={52} />
      </div>

      {/* Threshold control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => onThresholdChange(indicator.id, -1)}
          style={threshBtnStyle}
        >−</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'rgba(248,129,74,0.9)', fontFamily: 'ui-monospace,monospace' }}>
          {indicator.threshold.toFixed(1)} μV²
        </span>
        <button
          onClick={() => onThresholdChange(indicator.id, 1)}
          style={threshBtnStyle}
        >+</button>
      </div>
    </div>
  );
};

const threshBtnStyle: React.CSSProperties = {
  width: 28, height: 24,
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  color: 'var(--text-secondary)',
  fontSize: 14, fontWeight: 700,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1,
};

// Cardiac card
const CardiacCard: FC<{
  state: CardiacState;
  onDirectionChange: (d: Direction) => void;
  onThresholdChange: (delta: number) => void;
}> = ({ state, onDirectionChange, onThresholdChange }) => {
  const ratio = state.lfHfRatio;
  const aboveThreshold = ratio >= state.threshold;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid rgba(88,166,255,0.3)',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#8ecfff' }}>Cardiac</span>
        <Badge label="ViboMynd LF/HF" color="#8ecfff" bg="rgba(88,166,255,0.15)" />
      </div>

      {/* LF / HF values */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LF</span>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>
            {state.lfValue.toFixed(2)}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>HF</span>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#dce9f8', fontWeight: 600 }}>
            {state.hfValue.toFixed(2)}
          </div>
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LF/HF</span>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, color: '#f9a02e', fontWeight: 600 }}>
            {ratio.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Direction */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => onDirectionChange('up')}
          style={{
            flex: 1, padding: '4px 0', borderRadius: 5,
            border: `1px solid ${state.direction === 'up' ? 'rgba(63,185,80,0.6)' : 'var(--border)'}`,
            background: state.direction === 'up' ? 'rgba(63,185,80,0.15)' : 'var(--bg-tertiary)',
            color: state.direction === 'up' ? '#3fb950' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >↑ Up</button>
        <button
          onClick={() => onDirectionChange('down')}
          style={{
            flex: 1, padding: '4px 0', borderRadius: 5,
            border: `1px solid ${state.direction === 'down' ? 'rgba(248,81,73,0.6)' : 'var(--border)'}`,
            background: state.direction === 'down' ? 'rgba(248,81,73,0.15)' : 'var(--bg-tertiary)',
            color: state.direction === 'down' ? '#f85149' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >↓ Down</button>
      </div>

      {/* History chart */}
      <div style={{ marginBottom: 8 }}>
        <LineCanvas history={state.history} threshold={state.threshold} color="#f9a02e" />
      </div>

      {/* Threshold */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <button onClick={() => onThresholdChange(-0.1)} style={threshBtnStyle}>−</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'rgba(248,129,74,0.9)', fontFamily: 'ui-monospace,monospace' }}>
          {state.threshold.toFixed(1)}
        </span>
        <button onClick={() => onThresholdChange(0.1)} style={threshBtnStyle}>+</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Badge
          label={aboveThreshold ? (state.direction === 'up' ? '達標' : '未達標') : (state.direction === 'up' ? '未達標' : '達標')}
          color={aboveThreshold === (state.direction === 'up') ? '#3fb950' : '#f85149'}
          bg={aboveThreshold === (state.direction === 'up') ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'}
        />
      </div>
    </div>
  );
};

// ── Overall progress gauge ─────────────────────────────────────────────────

const ProgressGauge: FC<{ score: number }> = ({ score }) => {
  const r = 52;
  const cx = 70;
  const cy = 70;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);

  // Gradient color: red 0% → yellow 50% → green 100%
  const hue = lerp(0, 120, score / 100);
  const color = `hsl(${hue}, 75%, 52%)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={140} height={140} style={{ overflow: 'visible' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(93,109,134,0.2)" strokeWidth={10} />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }}
        />
        {/* Score text */}
        <text x={cx} y={cy + 6} textAnchor="middle" style={{ fill: '#dce9f8', fontSize: 24, fontWeight: 700, fontFamily: 'ui-monospace,monospace' }}>
          {score}%
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle" style={{ fill: 'var(--text-secondary)', fontSize: 11 }}>
          Overall
        </text>
      </svg>
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
    lfValue: 0.8,
    hfValue: 0.65,
    lfHfRatio: 1.2,
    direction: 'up',
    threshold: 1.5,
    history: [],
  });

  // ViboMynd panel state
  const [viboRunning, setViboRunning] = useState(false);
  const [viboBpm, setViboBpm] = useState(72);
  const [viboBr, setViboBr] = useState(16);
  const [viboLfHf, setViboLfHf] = useState(1.2);
  const [viboSDNN, setViboSDNN] = useState(48);
  const [viboHrvHistory, setViboHrvHistory] = useState<number[]>([]);
  const [viboAnimate, setViboAnimate] = useState(false);

  // Session
  const [sessionRunning, setSessionRunning] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [aboveThresholdPct, setAboveThresholdPct] = useState(0);
  const [rewardRate, setRewardRate] = useState(0);
  const [feedbackUrl, setFeedbackUrl] = useState('');
  const [operatorNotes, setOperatorNotes] = useState('');
  const [overallScore, setOverallScore] = useState(0);
  const [simSpeed, setSimSpeed] = useState(1);

  const sessionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aboveCountRef = useRef(0);
  const totalCountRef = useRef(0);

  // Simulation tick
  const tick = useCallback(() => {
    const speed = simSpeed;

    // EEG simulation
    setIndicators(prev => prev.map(ind => {
      if (!ind.enabled) return ind;
      const base = BAND_BASE[ind.band];
      const newVal = randomDrift(ind.value, base, speed);
      const newHistory = [...ind.history, newVal].slice(-HISTORY_LEN);
      return { ...ind, value: newVal, history: newHistory };
    }));

    // Cardiac simulation
    if (viboRunning) {
      setViboBpm(v => Math.max(55, Math.min(100, v + (Math.random() - 0.5) * 1.5 * speed)));
      setViboBr(v => Math.max(10, Math.min(25, v + (Math.random() - 0.5) * 0.4 * speed)));
      setViboLfHf(v => {
        const next = Math.max(0.3, Math.min(4, v + (Math.random() - 0.5) * 0.15 * speed));
        setCardiac(c => {
          const newHist = [...c.history, next].slice(-HISTORY_LEN);
          return { ...c, lfHfRatio: next, lfValue: next * 0.7 + 0.1, hfValue: 0.7 - next * 0.05 + 0.1, history: newHist };
        });
        return next;
      });
      setViboSDNN(v => Math.max(20, Math.min(80, v + (Math.random() - 0.5) * 2 * speed)));
      setViboHrvHistory(h => [...h, viboLfHf].slice(-HISTORY_LEN));
      setViboAnimate(a => !a);
    }

    // Session stats
    if (sessionRunning) {
      setSessionDuration(d => d + 1);
      setIndicators(current => {
        const enabled = current.filter(i => i.enabled);
        const above = enabled.filter(i => i.value >= i.threshold).length;
        totalCountRef.current += enabled.length;
        aboveCountRef.current += above;
        const pct = totalCountRef.current > 0
          ? Math.round((aboveCountRef.current / totalCountRef.current) * 100)
          : 0;
        setAboveThresholdPct(pct);
        setRewardRate(Math.round(pct * 0.85));
        setOverallScore(Math.min(100, Math.round(pct * 0.9 + (viboRunning ? 10 : 0))));
        return current;
      });
    }
  }, [simSpeed, viboRunning, sessionRunning, viboLfHf]);

  useEffect(() => {
    const interval = setInterval(tick, Math.round(1000 / simSpeed));
    return () => clearInterval(interval);
  }, [tick, simSpeed]);

  const handleStartSession = useCallback(() => {
    aboveCountRef.current = 0;
    totalCountRef.current = 0;
    setSessionDuration(0);
    setAboveThresholdPct(0);
    setRewardRate(0);
    setOverallScore(0);
    setSessionRunning(true);
    if (feedbackUrl) {
      window.open(feedbackUrl, '_blank');
    }
  }, [feedbackUrl]);

  const handleStopSession = useCallback(() => {
    setSessionRunning(false);
  }, []);

  // Split indicators: odd ids → col1, even ids → col2
  const oddIndicators = indicators.filter(i => i.id % 2 !== 0);
  const evenIndicators = indicators.filter(i => i.id % 2 === 0);

  const enabledIndicators = indicators.filter(i => i.enabled);
  const cardiacEnabled = viboRunning;

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const colStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    overflowY: 'auto',
    paddingRight: 4,
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 8,
    padding: '2px 0',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', overflow: 'hidden' }}>

      {/* ── Column 1: EEG odd indicators ── */}
      <div style={colStyle}>
        <div style={sectionHeaderStyle}>EEG NFB #1 #3 #5</div>
        {oddIndicators.map(ind => (
          <EegCard
            key={ind.id}
            indicator={ind}
            onToggle={id => setIndicators(prev => prev.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i))}
            onChannelChange={(id, ch) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, channel: ch } : i))}
            onBandChange={(id, b) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, band: b, threshold: BAND_BASE[b] * 1.2 } : i))}
            onDirectionChange={(id, d) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, direction: d } : i))}
            onThresholdChange={(id, delta) => setIndicators(prev => prev.map(i => i.id === id ? { ...i, threshold: Math.max(0.5, i.threshold + delta) } : i))}
          />
        ))}

        {/* Sim speed */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 14px',
          marginTop: 4,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Sim Speed: {simSpeed.toFixed(1)}×</div>
          <input
            type="range"
            min={0.2} max={4} step={0.1}
            value={simSpeed}
            onChange={e => setSimSpeed(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#58a6ff' }}
          />
        </div>
      </div>

      {/* ── Column 2: EEG even indicators + Cardiac ── */}
      <div style={colStyle}>
        <div style={sectionHeaderStyle}>EEG NFB #2 #4 + Cardiac</div>
        {evenIndicators.map(ind => (
          <EegCard
            key={ind.id}
            indicator={ind}
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

      {/* ── Column 3: ViboMynd ── */}
      <div style={colStyle}>
        <div style={sectionHeaderStyle}>ViboMynd</div>

        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid rgba(88,166,255,0.25)',
          borderRadius: 10,
          padding: '14px',
          marginBottom: 10,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#8ecfff' }}>ViboMynd</span>
            <Badge label="Cardiac HRV" color="#8ecfff" bg="rgba(88,166,255,0.15)" />
          </div>

          {/* Camera preview */}
          <div style={{
            width: '100%',
            height: 80,
            background: viboRunning ? 'rgba(63,185,80,0.08)' : 'rgba(30,40,60,0.8)',
            border: `1px solid ${viboRunning ? 'rgba(63,185,80,0.3)' : 'rgba(93,109,134,0.3)'}`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {viboRunning ? (
              <>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: '#3fb950',
                  boxShadow: '0 0 8px #3fb950',
                  animation: viboAnimate ? 'pulse 0.5s ease' : 'none',
                  marginRight: 8,
                }} />
                <span style={{ fontSize: 12, color: '#3fb950', fontWeight: 600 }}>量測中…</span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Camera inactive</span>
            )}
          </div>

          {/* Vitals */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 7, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Heart Rate</div>
              <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 18, fontWeight: 700, color: '#f85149' }}>
                {viboRunning ? Math.round(viboBpm) : '--'}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>BPM</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <Badge
                  label={viboBpm >= 60 && viboBpm <= 90 ? '正常' : '異常'}
                  color={viboBpm >= 60 && viboBpm <= 90 ? '#3fb950' : '#f85149'}
                  bg={viboBpm >= 60 && viboBpm <= 90 ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'}
                />
              </div>
            </div>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 7, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Breathing</div>
              <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 18, fontWeight: 700, color: '#58a6ff' }}>
                {viboRunning ? Math.round(viboBr) : '--'}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>/min</span>
              </div>
            </div>
          </div>

          {/* LF/HF */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 7, padding: '8px 10px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LF/HF Ratio</span>
              <Badge
                label={viboLfHf >= cardiac.threshold ? '達標' : '未達標'}
                color={viboLfHf >= cardiac.threshold ? '#3fb950' : '#f85149'}
                bg={viboLfHf >= cardiac.threshold ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'}
              />
            </div>
            <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 16, fontWeight: 700, color: '#f9a02e' }}>
              {viboRunning ? viboLfHf.toFixed(2) : '--'}
            </div>
          </div>

          {/* HRV mini chart */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>HRV (LF/HF history)</div>
            <LineCanvas history={viboHrvHistory} threshold={cardiac.threshold} color="#f9a02e" />
          </div>

          {/* SDNN */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>SDNN</span>
            <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, color: '#dce9f8' }}>
              {viboRunning ? `${Math.round(viboSDNN)} ms` : '-- ms'}
            </span>
          </div>

          {/* Start / Stop */}
          <button
            onClick={() => {
              setViboRunning(r => !r);
              if (!viboRunning) {
                setViboHrvHistory([]);
              }
            }}
            style={{
              width: '100%',
              padding: '8px 0',
              borderRadius: 7,
              border: 'none',
              background: viboRunning
                ? 'linear-gradient(90deg, rgba(248,81,73,0.7), rgba(200,50,50,0.6))'
                : 'linear-gradient(90deg, rgba(63,185,80,0.7), rgba(40,140,60,0.6))',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            {viboRunning ? '⏹ Stop ViboMynd' : '▶ Start ViboMynd'}
          </button>
        </div>
      </div>

      {/* ── Column 4: Session Summary ── */}
      <div style={colStyle}>
        <div style={sectionHeaderStyle}>Session Summary</div>

        {/* Overall progress gauge */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px',
          marginBottom: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <ProgressGauge score={overallScore} />

          {/* Stats grid */}
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            {[
              { label: 'Duration', value: formatDuration(sessionDuration) },
              { label: 'Above Threshold', value: `${aboveThresholdPct}%` },
              { label: 'Reward Rate', value: `${rewardRate}%` },
              { label: 'Overlay Opacity', value: '80%' },
            ].map(item => (
              <div key={item.label} style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 7,
                padding: '7px 10px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, fontWeight: 600, color: '#dce9f8' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Indicator summary list */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Active Indicators</div>
          {enabledIndicators.length === 0 && !cardiacEnabled && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: '8px 0' }}>No active indicators</div>
          )}
          {enabledIndicators.map(ind => {
            const met = (ind.direction === 'up' && ind.value >= ind.threshold) ||
                        (ind.direction === 'down' && ind.value < ind.threshold);
            return (
              <div key={ind.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(93,109,134,0.15)' }}>
                <span style={{ fontSize: 12, color: '#dce9f8' }}>
                  EEG #{ind.id} &nbsp;
                  <span style={{ color: 'var(--text-secondary)' }}>{ind.direction === 'up' ? '↑' : '↓'} {ind.channel} · {ind.band}</span>
                </span>
                <Badge
                  label={met ? '達標' : '未達標'}
                  color={met ? '#3fb950' : '#f85149'}
                  bg={met ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'}
                />
              </div>
            );
          })}
          {cardiacEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ fontSize: 12, color: '#dce9f8' }}>
                Cardiac &nbsp;
                <span style={{ color: 'var(--text-secondary)' }}>{cardiac.direction === 'up' ? '↑' : '↓'} LF/HF</span>
              </span>
              <Badge
                label={viboLfHf >= cardiac.threshold === (cardiac.direction === 'up') ? '達標' : '未達標'}
                color={viboLfHf >= cardiac.threshold === (cardiac.direction === 'up') ? '#3fb950' : '#f85149'}
                bg={viboLfHf >= cardiac.threshold === (cardiac.direction === 'up') ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'}
              />
            </div>
          )}
        </div>

        {/* Feedback content */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Feedback Content</div>
          <input
            type="url"
            placeholder="Feedback URL (e.g. https://…)"
            value={feedbackUrl}
            onChange={e => setFeedbackUrl(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '6px 8px',
              marginBottom: 8,
              boxSizing: 'border-box',
            }}
          />

          {/* Overlay preview */}
          <div style={{
            width: '100%',
            height: 54,
            background: 'rgba(20,30,50,0.85)',
            border: '1px dashed rgba(93,109,134,0.4)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}>
            {feedbackUrl ? (
              <span style={{ color: '#58a6ff', fontSize: 11 }}>Overlay preview: {feedbackUrl.slice(0, 30)}{feedbackUrl.length > 30 ? '…' : ''}</span>
            ) : (
              <span>遮罩預覽（輸入 URL 後顯示）</span>
            )}
          </div>

          {/* Start/Stop session */}
          <button
            onClick={sessionRunning ? handleStopSession : handleStartSession}
            style={{
              width: '100%',
              padding: '8px 0',
              borderRadius: 7,
              border: 'none',
              background: sessionRunning
                ? 'linear-gradient(90deg, rgba(248,81,73,0.7), rgba(200,50,50,0.6))'
                : 'linear-gradient(90deg, rgba(88,166,255,0.7), rgba(40,100,200,0.6))',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            {sessionRunning ? '⏹ Stop NFB Session' : '▶ Start NFB Session'}
          </button>
        </div>

        {/* Operator notes */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Operator Notes</div>
          <textarea
            value={operatorNotes}
            onChange={e => setOperatorNotes(e.target.value)}
            placeholder="輸入操作員備注…"
            rows={4}
            style={{
              width: '100%',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '6px 8px',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
    </div>
  );
};
