import { useState, type FC } from 'react';
import type { ImpedanceResult } from '../../types/eeg';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';

export interface ImpedanceViewProps {
  impedanceResults?: ImpedanceResult[];
  isConnected: boolean;
  isRecording: boolean;
  lang: Lang;
  onEnterImpedanceMode: () => void;
  onExitImpedanceMode: () => void;
}

// 10-20 channel positions in a 200×240 viewBox
const ELECTRODE_POSITIONS: { label: string; cx: number; cy: number }[] = [
  { label: 'Fp1', cx: 72,  cy: 52  },
  { label: 'Fp2', cx: 128, cy: 52  },
  { label: 'T7',  cx: 30,  cy: 112 },
  { label: 'T8',  cx: 170, cy: 112 },
  { label: 'O1',  cx: 72,  cy: 182 },
  { label: 'O2',  cx: 128, cy: 182 },
  { label: 'Fz',  cx: 100, cy: 72  },
  { label: 'Pz',  cx: 100, cy: 148 },
];

const NO_SIGNAL_AMPLITUDE_UV = 0.5;
const LOW_IMPEDANCE_NA_KOHM = 10;

function getQuality(kohm: number): ImpedanceResult['quality'] {
  if (kohm < 150) return 'excellent';
  if (kohm < 300) return 'good';
  if (kohm < 600) return 'poor';
  return 'bad';
}

function qualityColor(quality: ImpedanceResult['quality'] | 'unknown' | 'noSignal'): string {
  switch (quality) {
    case 'excellent': return '#3fb950';
    case 'good':      return '#85e89d';
    case 'poor':      return '#e3a030';
    case 'bad':       return '#f85149';
    default:          return '#555e6a';
  }
}

function qualityLabel(quality: ImpedanceResult['quality'] | 'unknown' | 'noSignal', lang: Lang): string {
  switch (quality) {
    case 'excellent': return T(lang, 'impedanceExcellent');
    case 'good':      return T(lang, 'impedanceGood');
    case 'poor':      return T(lang, 'impedancePoor');
    case 'bad':       return T(lang, 'impedanceBad');
    case 'noSignal':  return 'N/A';
    default:          return '--';
  }
}

export const ImpedanceView: FC<ImpedanceViewProps> = ({
  impedanceResults,
  isConnected,
  isRecording,
  lang,
  onEnterImpedanceMode,
  onExitImpedanceMode,
}) => {
  const [isActive, setIsActive] = useState(false);

  const resultByIndex = new Map<number, ImpedanceResult>();
  if (impedanceResults) {
    for (const r of impedanceResults) {
      resultByIndex.set(r.channel, r);
    }
  }

  const handleToggle = () => {
    if (!isConnected || isRecording) return;
    if (isActive) {
      setIsActive(false);
      onExitImpedanceMode();
    } else {
      setIsActive(true);
      onEnterImpedanceMode();
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: '.16rem .42rem',
    border: `1px solid ${isActive ? 'rgba(106,170,128,.5)' : 'rgba(94,88,112,.4)'}`,
    borderRadius: 1,
    background: 'transparent',
    cursor: (isConnected && !isRecording) ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
    fontSize: '.52rem',
    letterSpacing: '.08em',
    color: isActive ? 'var(--green)' : 'var(--muted)',
    opacity: (isConnected && !isRecording) ? 1 : 0.4,
    transition: 'all .15s',
    whiteSpace: 'nowrap' as const,
    marginLeft: 'auto',
    flexShrink: 0,
  };

  const legendItems = [
    { color: 'var(--green)',  label: lang === 'zh' ? '優秀' : 'Excellent', range: '<150k' },
    { color: '#85e89d',       label: lang === 'zh' ? '良好' : 'Good',      range: '<300k' },
    { color: 'var(--amber)',  label: lang === 'zh' ? '尚可' : 'Fair',      range: '<600k' },
    { color: 'var(--red)',    label: lang === 'zh' ? '不良' : 'Poor',      range: '≥600k' },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0, overflow: 'hidden',
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 2,
      padding: '.52rem .58rem',
    }}>

      {/* ── Title + toggle button ── */}
      <div style={{
        fontSize: '.6rem', letterSpacing: '.15em', textTransform: 'uppercase',
        color: 'var(--cream)', marginBottom: '.35rem',
        paddingBottom: '.22rem', borderBottom: '1px solid rgba(178,168,198,.1)',
        display: 'flex', alignItems: 'center', gap: '.32rem', flexShrink: 0,
      }}>
        <span style={{ fontFamily: "'Crimson Pro','Georgia',serif", fontStyle: 'italic', fontSize: '.88rem', color: 'var(--plum)', lineHeight: 1 }}>∘</span>
        <span>{T(lang, 'impedanceTitle')}</span>
        {!isConnected && (
          <span style={{ fontSize: '.5rem', color: 'var(--red)', marginLeft: '.3rem' }}>
            {T(lang, 'impedanceNotConnected')}
          </span>
        )}
        {isRecording && (
          <span style={{ fontSize: '.5rem', color: 'var(--amber)', marginLeft: '.3rem' }}>
            {T(lang, 'impedanceBlockedByRecording')}
          </span>
        )}
        <button onClick={handleToggle} disabled={!isConnected || isRecording} style={btnStyle}>
          {isActive ? T(lang, 'impedanceStop') : T(lang, 'impedanceStart')}
        </button>
      </div>

      {/* ── SVG head diagram — fills available space ── */}
      <svg
        viewBox="0 0 200 240"
        style={{ display: 'block', width: '100%', flex: 1, minHeight: 0, height: 0 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Head outline — oval */}
        <ellipse cx="100" cy="118" rx="88" ry="106"
          fill="rgba(14,20,30,.8)"
          stroke="rgba(94,88,112,.38)"
          strokeWidth="1.5"
        />
        {/* Nose */}
        <path d="M93 16 Q100 8 107 16"
          fill="none" stroke="rgba(94,88,112,.32)" strokeWidth="1.5"
        />
        {/* Left ear */}
        <path d="M12 100 Q4 112 12 124"
          fill="none" stroke="rgba(94,88,112,.32)" strokeWidth="1.5"
        />
        {/* Right ear */}
        <path d="M188 100 Q196 112 188 124"
          fill="none" stroke="rgba(94,88,112,.32)" strokeWidth="1.5"
        />
        {/* Center cross lines */}
        <line x1="100" y1="14" x2="100" y2="224"
          stroke="rgba(94,88,112,.13)" strokeWidth="1" strokeDasharray="4 4"
        />
        <line x1="12" y1="118" x2="188" y2="118"
          stroke="rgba(94,88,112,.13)" strokeWidth="1" strokeDasharray="4 4"
        />

        {/* Electrode nodes */}
        {ELECTRODE_POSITIONS.map((pos, idx) => {
          const result = resultByIndex.get(idx);
          const kohm = result?.impedanceKohm;
          const isNoSignal = result !== undefined && (
            (result.acAmplitude ?? 0) < NO_SIGNAL_AMPLITUDE_UV ||
            result.impedanceKohm < LOW_IMPEDANCE_NA_KOHM
          );
          const quality: ImpedanceResult['quality'] | 'unknown' | 'noSignal' =
            result === undefined ? 'unknown'
            : isNoSignal ? 'noSignal'
            : getQuality(kohm!);
          const color = qualityColor(quality);
          const isDim = quality === 'unknown' || quality === 'noSignal';

          return (
            <g key={pos.label}>
              {/* Glow ring */}
              {!isDim && (
                <circle cx={pos.cx} cy={pos.cy} r={14}
                  fill="none" stroke={color} strokeWidth=".8" opacity=".3"
                />
              )}
              {/* Main circle */}
              <circle
                cx={pos.cx} cy={pos.cy} r={10}
                fill={isDim ? 'rgba(30,42,60,0.9)' : `${color}22`}
                stroke={color}
                strokeWidth={isDim ? 1 : 1.6}
                opacity={isDim ? 0.5 : 1}
              />
              {/* Channel label */}
              <text
                x={pos.cx} y={pos.cy + 1}
                textAnchor="middle" dominantBaseline="middle"
                fill={isDim ? 'rgba(150,165,185,0.5)' : color}
                fontSize="6"
                fontFamily="IBM Plex Mono, monospace"
                fontWeight="700"
              >
                {pos.label}
              </text>
              {/* Impedance value below node */}
              {result !== undefined && (
                <text
                  x={pos.cx} y={pos.cy + 21}
                  textAnchor="middle"
                  fill="rgba(200,220,245,.6)"
                  fontSize="5"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {isNoSignal ? 'N/A' : `${kohm!.toFixed(0)}kΩ`}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Impedance legend with ranges ── */}
      <div style={{ marginTop: '.25rem', flexShrink: 0 }}>
        {/* Gradient bar */}
        <div style={{
          height: 4, borderRadius: 3,
          background: 'linear-gradient(to right, #3fb950, #85e89d 28%, #e3a030 55%, #f85149)',
          marginBottom: '.2rem', position: 'relative',
        }}>
          {[28, 55, 78].map(pct => (
            <div key={pct} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, width: 1, background: 'rgba(20,16,28,0.5)' }} />
          ))}
        </div>
        {/* 4-cell quality labels — single line each */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.15rem' }}>
          {[
            { color: '#3fb950',        label: lang === 'zh' ? '優秀' : 'Excellent', range: '<150 kΩ' },
            { color: '#85e89d',        label: lang === 'zh' ? '良好' : 'Good',      range: '<300 kΩ' },
            { color: 'var(--amber)',   label: lang === 'zh' ? '尚可' : 'Fair',      range: '<600 kΩ' },
            { color: 'var(--red)',     label: lang === 'zh' ? '不良' : 'Poor',      range: '≥600 kΩ' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(20,16,28,.4)', borderRadius: 1, padding: '.12rem .18rem', border: `1px solid ${item.color}22`, display: 'flex', alignItems: 'center', gap: '.2rem', overflow: 'hidden' }}>
              <span style={{ fontSize: '.54rem', color: item.color, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
              <span style={{ fontSize: '.46rem', color: 'var(--muted)', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.range}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
