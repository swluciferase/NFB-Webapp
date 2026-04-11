import type { FC } from 'react';
import type { Lang } from '../../i18n';

export type PageType = 'ci' | 'signal' | 'training';

export interface HeaderProps {
  lang: Lang;
  onLangToggle: () => void;
  activePage: PageType;
  onPageChange: (page: PageType) => void;
}

const TAB_LABELS: Record<PageType, { zh: string; en: string }> = {
  ci:       { zh: '連線 · 記錄', en: 'Connect · Record' },
  signal:   { zh: '訊號 · 頻譜', en: 'Signal · FFT'     },
  training: { zh: '訓練',        en: 'Training'          },
};

export const Header: FC<HeaderProps> = ({
  lang, onLangToggle, activePage, onPageChange,
}) => {
  return (
    <header style={{
      padding: '.44rem 1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg2)',
      flexShrink: 0,
      gap: '.7rem',
    }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexShrink: 0 }}>
        <div style={{
          fontFamily: "'Crimson Pro', 'Georgia', serif",
          fontStyle: 'italic',
          fontSize: '1.3rem',
          fontWeight: 300,
          color: 'var(--mauve)',
          letterSpacing: '-.05em',
          lineHeight: 1,
        }}>
          ψ
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: '.68rem',
            color: 'var(--cream)',
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            lineHeight: 1.2,
          }}>
            SoraMynd
          </div>
          <div style={{
            fontSize: '.48rem',
            color: 'var(--muted)',
            letterSpacing: '.06em',
            marginTop: '.07rem',
          }}>
            Neurofeedback · v{__APP_VERSION__}
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{
        display: 'flex',
        gap: '1px',
        background: 'var(--border)',
        margin: '0 .7rem',
      }}>
        {(['ci', 'signal', 'training'] as PageType[]).map(page => {
          const isActive = activePage === page;
          return (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              style={{
                padding: '.27rem .85rem',
                background: isActive ? 'var(--bg3)' : 'var(--bg2)',
                border: 'none',
                color: isActive ? 'var(--mauve)' : 'var(--text)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '.65rem',
                cursor: 'pointer',
                letterSpacing: '.07em',
                textTransform: 'uppercase',
                transition: 'all .15s',
                whiteSpace: 'nowrap',
              }}
            >
              {TAB_LABELS[page][lang]}
            </button>
          );
        })}
      </div>

      {/* Right side: lang toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: 0, marginLeft: 'auto' }}>
        {/* Lang toggle — two buttons side-by-side */}
        <div style={{ display: 'flex', gap: '1px', background: 'var(--border)' }}>
          <button
            onClick={() => lang !== 'zh' && onLangToggle()}
            style={{
              padding: '.2rem .5rem',
              border: 'none',
              background: lang === 'zh' ? 'var(--bg3)' : 'var(--bg2)',
              color: lang === 'zh' ? 'var(--mauve)' : 'var(--muted)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '.56rem',
              cursor: 'pointer',
              letterSpacing: '.06em',
              transition: 'all .15s',
            }}
          >
            中
          </button>
          <button
            onClick={() => lang !== 'en' && onLangToggle()}
            style={{
              padding: '.2rem .5rem',
              border: 'none',
              background: lang === 'en' ? 'var(--bg3)' : 'var(--bg2)',
              color: lang === 'en' ? 'var(--mauve)' : 'var(--muted)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '.56rem',
              cursor: 'pointer',
              letterSpacing: '.06em',
              transition: 'all .15s',
            }}
          >
            EN
          </button>
        </div>
      </div>
    </header>
  );
};
