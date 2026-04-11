import { type FC, type ReactNode } from 'react';
import type { ConnectionStatus } from '../../services/serial';
import type { DeviceStats } from '../../types/eeg';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';

export interface HomeViewProps {
  status: ConnectionStatus;
  stats: DeviceStats;
  deviceId: string | null;
  lang: Lang;
  onConnect: () => void;
  onDisconnect: () => void;
  /** When true, instructions and notes are NOT rendered (App.tsx renders them at bottom of Col A) */
  hideInstructions?: boolean;
}

const BatteryBar: FC<{ level: number | null }> = ({ level }) => {
  if (level === null) return <span style={{ color: 'var(--muted)', fontSize: '.6rem' }}>--</span>;
  const pct = Math.max(0, Math.min(100, level));
  const color = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
      <div style={{
        width: 34, height: 14, borderRadius: 2,
        border: `1.5px solid ${color}`,
        position: 'relative', overflow: 'hidden',
        background: 'rgba(0,0,0,.3)',
      }}>
        <div style={{
          position: 'absolute', right: -3, top: '50%', transform: 'translateY(-50%)',
          width: 3, height: 6, background: color, borderRadius: '0 1px 1px 0',
        }} />
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: color, transition: 'width .5s',
        }} />
      </div>
      <span style={{ fontSize: '.6rem', color }}>{pct}%</span>
    </div>
  );
};

const InfoRow: FC<{ label: string; value: ReactNode }> = ({ label, value }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '.28rem 0',
    borderBottom: '1px solid rgba(178,168,198,.07)',
  }}>
    <span style={{ fontSize: '.68rem', color: 'var(--text)' }}>{label}</span>
    <span style={{ fontSize: '.66rem', color: 'var(--cream)' }}>{value}</span>
  </div>
);

export const HomeView: FC<HomeViewProps> = ({
  status, stats, deviceId, lang, onConnect, onDisconnect, hideInstructions,
}) => {
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  const statusColor =
    isConnected   ? 'var(--green)' :
    isConnecting  ? 'var(--teal)'  :
    status === 'error' ? 'var(--red)' : 'var(--dim)';

  const statusLabel = (() => {
    switch (status) {
      case 'connected':   return T(lang, 'connected');
      case 'connecting':  return T(lang, 'connecting');
      case 'error':       return T(lang, 'error');
      default:            return T(lang, 'disconnected');
    }
  })();

  const btnBase: React.CSSProperties = {
    padding: '.2rem .6rem', border: '1px solid', borderRadius: 1,
    background: 'transparent', fontFamily: 'inherit',
    fontSize: '.64rem', cursor: 'pointer', letterSpacing: '.04em',
    transition: 'all .15s', flexShrink: 0,
  };

  return (
    <div style={{ flexShrink: 0 }}>
      {/* ── Connect status card ── */}
      <div style={{
        background: 'var(--bg2)',
        border: `1px solid ${isConnected ? 'rgba(106,170,128,.3)' : 'var(--border)'}`,
        borderRadius: 2,
        padding: '.6rem .65rem',
        marginBottom: '.38rem',
        flexShrink: 0,
        transition: 'border-color .3s',
      }}>
        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isConnected ? '.42rem' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusColor,
              boxShadow: isConnected ? '0 0 6px var(--green)' : 'none',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '.74rem', color: 'var(--cream)' }}>{statusLabel}</span>
          </div>
          {isConnected ? (
            <button onClick={onDisconnect} style={{ ...btnBase, borderColor: 'rgba(176,112,112,.4)', color: 'var(--red)' }}>
              {T(lang, 'homeDisconnect')}
            </button>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              style={{
                ...btnBase,
                borderColor: isConnecting ? 'rgba(120,152,168,.4)' : 'rgba(106,170,128,.5)',
                color: isConnecting ? 'var(--teal)' : 'var(--green)',
                cursor: isConnecting ? 'not-allowed' : 'pointer',
              }}
            >
              {isConnecting ? T(lang, 'connecting') : T(lang, 'homeConnect')}
            </button>
          )}
        </div>

        {/* Device info when connected */}
        {isConnected && (<>
          <InfoRow
            label={T(lang, 'homeDeviceId')}
            value={<span style={{ color: 'var(--teal)', fontSize: '.56rem', fontVariantNumeric: 'tabular-nums' }}>{deviceId ?? T(lang, 'unknown')}</span>}
          />
          <InfoRow label={T(lang, 'homeSampleRate')} value={`1000 ${T(lang, 'hz')}`} />
          <InfoRow label={T(lang, 'homePacketRate')} value={`${stats.packetRate} pkt/s`} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.28rem 0' }}>
            <span style={{ fontSize: '.68rem', color: 'var(--text)' }}>{T(lang, 'homeBattery')}</span>
            <BatteryBar level={stats.battery} />
          </div>
        </>)}

        {/* Not connected hint */}
        {!isConnected && (
          <div style={{ marginTop: '.32rem', fontSize: '.64rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            {T(lang, 'homeNotConnectedHint')}
          </div>
        )}
      </div>

      {/* ── Instructions + notes (skipped when hideInstructions=true) ── */}
      {!hideInstructions && (<>
        {/* Instructions card */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 2, padding: '.6rem .65rem', marginBottom: '.3rem',
        }}>
          <div style={{
            fontSize: '.6rem', letterSpacing: '.15em', textTransform: 'uppercase',
            color: 'var(--cream)', marginBottom: '.34rem',
            paddingBottom: '.22rem', borderBottom: '1px solid rgba(178,168,198,.1)',
            display: 'flex', alignItems: 'center', gap: '.32rem',
          }}>
            <span style={{ fontFamily: "'Crimson Pro','Georgia',serif", fontStyle: 'italic', fontSize: '.88rem', color: 'var(--plum)', lineHeight: 1 }}>→</span>
            <span>{T(lang, 'homeInstructions')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.38rem' }}>
            {[T(lang, 'homeStep1'), T(lang, 'homeStep2'), T(lang, 'homeStep3')].map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: '.52rem', alignItems: 'flex-start', fontSize: '.68rem', color: 'var(--text)', lineHeight: 1.52 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: '1px solid rgba(120,152,200,.35)', color: 'var(--teal)',
                  fontSize: '.52rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: '.1rem',
                }}>{i + 1}</div>
                <span>{step.replace(/^\d+\.\s*/, '')}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Notes */}
        <div style={{ fontSize: '.54rem', color: 'var(--muted)', lineHeight: 1.6, background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 1, padding: '.36rem .44rem', marginBottom: '.3rem' }}>
          {T(lang, 'homeRequiresSerial')}
        </div>
        <div style={{ fontSize: '.54rem', color: 'var(--muted)', lineHeight: 1.6, background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 1, padding: '.36rem .44rem' }}>
          {T(lang, 'homeMultiDevice')}
        </div>
      </>)}
    </div>
  );
};
