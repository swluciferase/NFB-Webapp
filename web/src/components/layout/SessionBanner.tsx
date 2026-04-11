import { useState, useEffect, type FC } from 'react';
import type { Lang } from '../../i18n';
import type { ConnectionStatus } from '../../services/serial';

export interface SessionBannerProps {
  lang: Lang;
  status: ConnectionStatus;
  isRecording: boolean;
  deviceId: string | null;
  packetRate: number;
  elapsed: number;           // ms (seed; banner ticks internally)
  samplesCount: number;
  goodTimeSec: number;
  goodPercent: number;
  targetDurationSec: number; // Infinity = manual
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function fmtGood(sec: number): string {
  return `${Math.floor(sec / 60).toString().padStart(2, '0')}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
}

const SbItem: FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '.28rem .9rem',
    borderRight: '1px solid var(--border)',
    minWidth: 80,
    flexShrink: 0,
  }}>
    <div style={{ fontSize: '.52rem', color: 'var(--text)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.12rem' }}>
      {label}
    </div>
    <div style={{
      fontSize: '.82rem',
      fontFamily: "'Crimson Pro', 'Georgia', serif",
      fontWeight: 300,
      color: color ?? 'var(--cream)',
      letterSpacing: '-.02em',
      lineHeight: 1,
    }}>
      {value}
    </div>
  </div>
);

export const SessionBanner: FC<SessionBannerProps> = ({
  lang, status, isRecording, deviceId, packetRate,
  elapsed: elapsedSeed, samplesCount, goodTimeSec, goodPercent, targetDurationSec,
}) => {
  // Tick every second while recording so duration display is live
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isRecording) { setTick(0); return; }
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);
  void tick; // trigger re-render
  const elapsed = isRecording ? elapsedSeed + tick * 1000 : 0;

  const isConnected = status === 'connected';
  const shortId = deviceId?.startsWith('STEEG_') ? deviceId.slice(6) : (deviceId ?? '--');

  const progressPct = isFinite(targetDurationSec) && targetDurationSec > 0
    ? Math.min(100, (goodTimeSec / targetDurationSec) * 100)
    : 0;

  return (
    <div style={{
      flexShrink: 0,
      background: 'var(--bg4)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      minHeight: 36,
    }}>

      {/* Live / idle indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.3rem',
        padding: '.28rem 1rem',
        borderRight: '1px solid var(--border)',
        fontSize: '.52rem',
        color: isRecording ? 'var(--green)' : isConnected ? 'var(--muted)' : 'var(--dim)',
        letterSpacing: '.06em',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        <div style={{
          width: 4, height: 4, borderRadius: '50%',
          background: 'currentColor',
          animation: isRecording ? 'pulse 1.4s infinite' : 'none',
        }} />
        {isRecording
          ? (lang === 'zh' ? 'SESSION · 錄製中' : 'SESSION · Recording')
          : isConnected
            ? (lang === 'zh' ? 'SESSION · 已連線' : 'SESSION · Connected')
            : (lang === 'zh' ? 'SESSION · 待機' : 'SESSION · Idle')}
      </div>

      {/* Time */}
      <SbItem
        label={lang === 'zh' ? '時長' : 'Duration'}
        value={isRecording ? fmt(elapsed) : '--:--'}
      />

      {/* Samples */}
      <SbItem
        label={lang === 'zh' ? '樣本' : 'Samples'}
        value={isRecording ? (samplesCount > 999 ? `${Math.floor(samplesCount/1000)}k` : samplesCount.toString()) : '--'}
        color="var(--teal)"
      />

      {/* Good time */}
      <SbItem
        label={lang === 'zh' ? '有效時間' : 'Good Time'}
        value={isRecording ? fmtGood(goodTimeSec) : '--:--'}
        color="var(--green)"
      />

      {/* Quality % */}
      <SbItem
        label={lang === 'zh' ? '品質%' : 'Quality%'}
        value={isRecording ? `${goodPercent}%` : '--'}
        color={goodPercent >= 80 ? 'var(--green)' : goodPercent >= 50 ? 'var(--amber)' : 'var(--red)'}
      />

      {/* Progress bar */}
      {isFinite(targetDurationSec) && (
        <div style={{
          flex: 1, height: 3,
          background: 'rgba(255,255,255,.04)',
          borderRadius: 1,
          margin: '0 1rem',
          minWidth: 40,
        }}>
          <div style={{
            height: '100%', borderRadius: 1,
            background: 'linear-gradient(90deg, var(--plum), var(--mauve))',
            width: `${progressPct}%`,
            transition: 'width .5s',
          }} />
        </div>
      )}

      {/* Device + packet rate — right side */}
      <div style={{
        marginLeft: 'auto',
        display: 'flex', alignItems: 'center',
        borderLeft: '1px solid var(--border)',
        padding: '.28rem 1rem',
        gap: '.6rem',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '.52rem', color: isConnected ? 'var(--teal)' : 'var(--dim)', letterSpacing: '.06em' }}>
          {isConnected ? shortId : (lang === 'zh' ? '未連線' : 'Not connected')}
        </span>
        {isConnected && (
          <span style={{ fontSize: '.52rem', color: 'var(--muted)', letterSpacing: '.06em' }}>
            {packetRate} pkt/s
          </span>
        )}
      </div>
    </div>
  );
};
