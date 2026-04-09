import type { FC } from 'react';
import type { Lang } from '../../i18n';

export interface HeaderProps {
  lang: Lang;
  onLangToggle: () => void;
}

export const Header: FC<HeaderProps> = ({ lang, onLangToggle }) => {
  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 20px',
      height: 56,
      background: 'linear-gradient(90deg, #0d1520 0%, #101c2e 100%)',
      borderBottom: '1px solid rgba(93,109,134,0.35)',
      flexShrink: 0,
    }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'linear-gradient(135deg, #1a5fa8, #0e3d70)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, color: '#7ec8f5',
          border: '1px solid rgba(100,160,255,0.3)',
          flexShrink: 0,
        }}>
          S
        </div>
        <h1 style={{
          margin: 0,
          fontSize: '1.1rem',
          fontWeight: 600,
          color: '#c5d8f0',
          letterSpacing: '0.03em',
        }}>
          SoraMynd
        </h1>
        <span style={{
          fontSize: 11,
          color: 'rgba(120,150,190,0.55)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          letterSpacing: '0.05em',
          alignSelf: 'flex-end',
          marginBottom: 2,
        }}>
          v{__APP_VERSION__}
        </span>
      </div>

      {/* Right side: lang toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={onLangToggle}
          style={{
            background: 'rgba(30, 48, 72, 0.8)',
            border: '1px solid rgba(93, 109, 134, 0.5)',
            borderRadius: 6,
            color: '#8ecfff',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'background 0.15s',
          }}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </div>
    </header>
  );
};
