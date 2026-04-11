import type { FC } from 'react';
import type { Lang } from '../../i18n';

export type PageType = 'ci' | 'signal' | 'training';

export interface HeaderProps {
  lang: Lang;
  onLangToggle: () => void;
  activePage: PageType;
  onPageChange: (page: PageType) => void;
  isConnected: boolean;
  isRecording: boolean;
  deviceId: string | null;
  packetRate: number;
}

const TAB_LABELS: Record<PageType, { zh: string; en: string }> = {
  ci:       { zh: '連線·記錄', en: 'Connect·Record' },
  signal:   { zh: '訊號·頻譜', en: 'Signal·FFT'     },
  training: { zh: '訓練',      en: 'Training'        },
};

export const Header: FC<HeaderProps> = ({
  lang, onLangToggle,
  activePage, onPageChange,
  isConnected, isRecording, deviceId, packetRate,
}) => {
  const shortId = deviceId?.startsWith('STEEG_') ? deviceId.slice(6) : deviceId;

  return (
    <header style={{
      display: 'flex',
      alignItems: 'stretch',
      padding: '0 18px',
      height: 48,
      background: 'var(--bg4)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      gap: 0,
    }}>

      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingRight: 20,
        marginRight: 4,
        borderRight: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 5,
          background: 'linear-gradient(135deg, var(--plum), var(--bg3))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 400,
          color: 'var(--mauve)',
          border: '1px solid var(--border)',
          fontFamily: "'Crimson Pro', serif",
          fontStyle: 'italic',
          letterSpacing: '-0.02em',
          flexShrink: 0,
        }}>
          ψ
        </div>
        <span style={{
          fontSize: 13, fontWeight: 500,
          color: 'var(--cream)',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}>
          SoraMynd
        </span>
        <span style={{
          fontSize: 10, color: 'var(--muted)',
          fontWeight: 300, letterSpacing: '0.06em',
          marginTop: 1, flexShrink: 0,
        }}>
          v{__APP_VERSION__}
        </span>
      </div>

      {/* Nav tabs */}
      <nav style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1 }}>
        {(['ci', 'signal', 'training'] as PageType[]).map(page => {
          const isActive = activePage === page;
          const label = TAB_LABELS[page][lang];
          return (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '0 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--mauve)'
                  : '2px solid transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                color: isActive ? 'var(--cream)' : 'var(--muted)',
                fontSize: 12,
                fontWeight: isActive ? 500 : 300,
                letterSpacing: '0.04em',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                paddingBottom: isActive ? 0 : 2,
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* Right side: status + lang */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        paddingLeft: 16, marginLeft: 4,
        borderLeft: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Connection pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 9px',
          borderRadius: 4,
          background: isConnected ? 'rgba(106,170,128,0.12)' : 'rgba(58,53,72,0.6)',
          border: `1px solid ${isConnected ? 'rgba(106,170,128,0.3)' : 'var(--border)'}`,
          fontSize: 11,
          color: isConnected ? 'var(--green)' : 'var(--muted)',
          fontWeight: 400,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isConnected ? 'var(--green)' : 'var(--muted)',
            animation: isConnected ? 'none' : undefined,
            flexShrink: 0,
          }} />
          {isConnected
            ? (shortId ?? (lang === 'zh' ? '已連線' : 'Connected'))
            : (lang === 'zh' ? '未連線' : 'Not connected')}
        </div>

        {/* Recording badge */}
        {isRecording && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 9px',
            borderRadius: 4,
            background: 'rgba(176,112,112,0.15)',
            border: '1px solid rgba(176,112,112,0.35)',
            fontSize: 11, color: 'var(--rose)',
            fontWeight: 400,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--rose)',
              animation: 'pulse 1s infinite',
              flexShrink: 0,
            }} />
            {lang === 'zh' ? '錄製中' : 'REC'}
          </div>
        )}

        {/* Packet rate (when connected) */}
        {isConnected && (
          <span style={{
            fontSize: 11, color: 'var(--muted)',
            fontWeight: 300, whiteSpace: 'nowrap',
          }}>
            {packetRate} pkt/s
          </span>
        )}

        {/* Lang toggle */}
        <button
          onClick={onLangToggle}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--mauve)',
            fontSize: 11,
            fontWeight: 400,
            padding: '3px 8px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
            transition: 'border-color 0.15s, color 0.15s',
            fontFamily: 'inherit',
          }}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </div>
    </header>
  );
};
