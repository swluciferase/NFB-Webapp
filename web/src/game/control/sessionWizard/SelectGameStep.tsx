import { useEffect, useState, type FC } from 'react';
import { T, type Lang } from '../../../i18n';
import type { SessionConfig } from '../../SessionConfig';
import type { Theme } from '../../Game';
import { NfbSettingsPanel } from './NfbSettingsPanel';

const THEMES: Array<{ id: Theme['id']; labelZh: string; labelEn: string }> = [
  { id: 'papercut', labelZh: '剪紙', labelEn: 'Papercut' },
  { id: 'ghibli', labelZh: '吉卜力', labelEn: 'Ghibli' },
  { id: 'geometric', labelZh: '幾何', labelEn: 'Geometric' },
];

export interface SelectGameStepProps {
  lang: Lang;
  onSelect: (cfg: SessionConfig) => void;
  onPreview?: (cfg: SessionConfig) => void;
}

interface CardDef {
  id: 'plane' | 'golf' | 'maze';
  titleKey: string;
  taglineKey: string;
  enabled: boolean;
  modes: Array<{ id: string; labelKey: string }>;
}

const CARDS: CardDef[] = [
  {
    id: 'plane',
    titleKey: 'gamePlaneTitle',
    taglineKey: 'gamePlaneTagline',
    enabled: true,
    modes: [{ id: 'auto', labelKey: 'gameModeStandard' }],
  },
  {
    id: 'golf',
    titleKey: 'gameGolfTitle',
    taglineKey: 'gameGolfTagline',
    enabled: false,
    modes: [],
  },
  {
    id: 'maze',
    titleKey: 'gameMazeTitle',
    taglineKey: 'gameMazeTagline',
    enabled: false,
    modes: [],
  },
];

export const SelectGameStep: FC<SelectGameStepProps> = ({ lang, onSelect, onPreview }) => {
  const [picked, setPicked] = useState<CardDef['id'] | null>(null);
  const [modeId, setModeId] = useState<string>('auto');
  const [themeId, setThemeId] = useState<Theme['id']>('papercut');

  // Live preview: whenever the loadout changes and a game is picked, push
  // a loadGame to the subject window so the therapist can preview the look
  // before locking in a duration.
  useEffect(() => {
    if (!picked || !onPreview) return;
    onPreview({ gameId: picked, modeId, themeId, lang, plannedDurationSec: 300 });
  }, [picked, modeId, themeId, lang, onPreview]);

  const pickedCard = CARDS.find((c) => c.id === picked);

  return (
    <div>
      <div style={{ marginBottom: 12, color: 'rgba(200,215,235,0.75)' }}>
        {T(lang, 'gameStep1Desc')}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
          marginBottom: 18,
        }}
      >
        {CARDS.map((c) => {
          const isPicked = picked === c.id;
          return (
            <button
              key={c.id}
              disabled={!c.enabled}
              onClick={() => {
                if (!c.enabled) return;
                setPicked(c.id);
                setModeId(c.modes[0]?.id ?? 'auto');
              }}
              style={{
                padding: 16,
                borderRadius: 10,
                border: `1px solid ${isPicked ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
                background: isPicked ? 'rgba(88,166,255,0.08)' : 'rgba(255,255,255,0.02)',
                color: c.enabled ? '#e4ecfa' : 'rgba(200,215,235,0.25)',
                cursor: c.enabled ? 'pointer' : 'not-allowed',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {T(lang, c.titleKey)}
                {!c.enabled && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 400,
                      marginLeft: 8,
                      color: 'rgba(200,215,235,0.4)',
                    }}
                  >
                    {T(lang, 'gameComingSoon')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.55)' }}>
                {T(lang, c.taglineKey)}
              </div>
            </button>
          );
        })}
      </div>

      {pickedCard && pickedCard.modes.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>{T(lang, 'gameSelectMode')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {pickedCard.modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setModeId(m.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: `1px solid ${modeId === m.id ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
                  background: modeId === m.id ? 'rgba(88,166,255,0.08)' : 'transparent',
                  color: '#e4ecfa',
                  cursor: 'pointer',
                }}
              >
                {T(lang, m.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          {lang === 'zh' ? '主題' : 'Theme'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {THEMES.map((th) => (
            <button
              key={th.id}
              onClick={() => setThemeId(th.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: `1px solid ${themeId === th.id ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
                background: themeId === th.id ? 'rgba(88,166,255,0.08)' : 'transparent',
                color: '#e4ecfa',
                cursor: 'pointer',
              }}
            >
              {lang === 'zh' ? th.labelZh : th.labelEn}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <NfbSettingsPanel lang={lang} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          disabled={!pickedCard}
          onClick={() => {
            if (!pickedCard) return;
            onSelect({
              gameId: pickedCard.id,
              modeId,
              themeId,
              lang,
              plannedDurationSec: 300,
            });
          }}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            background: pickedCard ? '#58a6ff' : 'rgba(93,109,134,0.3)',
            color: '#0a0f1a',
            fontWeight: 600,
            cursor: pickedCard ? 'pointer' : 'not-allowed',
            border: 'none',
          }}
        >
          {T(lang, 'gameNext')}
        </button>
      </div>
    </div>
  );
};
