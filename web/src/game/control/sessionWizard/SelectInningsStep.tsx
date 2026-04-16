import { useState, type FC, type ReactNode } from 'react';
import { T, type Lang } from '../../../i18n';
import type { SessionConfig, SessionInningCount } from '../../SessionConfig';
import type { ControllerState } from '../GameSessionController';

export interface SelectInningsStepProps {
  lang: Lang;
  isActive: boolean;
  config: SessionConfig;
  controllerState: ControllerState;
  openSubjectButton: ReactNode;
  statusPill: ReactNode;
  onStart: (innings: SessionInningCount) => void;
  onBack: () => void;
}

const INNINGS: SessionInningCount[] = [1, 3, 5, 7, 9];

// Baseball inning = 9 pitches × 18s (5s prep + 10s charge + 3s ball flight) = 162s
const INNING_SEC = 162;

export const SelectInningsStep: FC<SelectInningsStepProps> = ({
  lang,
  isActive,
  controllerState,
  openSubjectButton,
  statusPill,
  onStart,
  onBack,
}) => {
  const [innings, setInnings] = useState<SessionInningCount>(3);
  const canStart = isActive && controllerState === 'preview';
  const blockReason = !isActive
    ? T(lang, 'gameNoIndicatorsHint')
    : controllerState !== 'preview'
      ? T(lang, 'gameWaitingSubjectHint')
      : '';

  const estSec = innings * INNING_SEC;
  const estMin = Math.round(estSec / 60);

  return (
    <div>
      <div style={{ marginBottom: 14, color: 'rgba(200,215,235,0.75)' }}>
        {T(lang, 'gameStep2BaseballDesc')}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {INNINGS.map((n) => (
          <button
            key={n}
            onClick={() => setInnings(n)}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: `1px solid ${innings === n ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
              background: innings === n ? 'rgba(88,166,255,0.08)' : 'transparent',
              color: '#e4ecfa',
              cursor: 'pointer',
              fontWeight: 600,
              minWidth: 68,
            }}
          >
            {n} {T(lang, n === 1 ? 'gameInningSingular' : 'gameInningPlural')}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.55)', marginBottom: 18 }}>
        {lang === 'zh'
          ? `約 ${estMin} 分鐘 · 每局 9 球 · 每球 15 秒（5 秒準備 + 10 秒蓄力）`
          : `~${estMin} min · 9 pitches per inning · 15s each (5s prep + 10s charge)`}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        {openSubjectButton}
        {statusPill}
      </div>

      {blockReason && (
        <div style={{ fontSize: 12, color: '#f0a93e', marginBottom: 10 }}>{blockReason}</div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <button
          onClick={onBack}
          style={{
            padding: '10px 18px',
            borderRadius: 6,
            background: 'transparent',
            border: '1px solid rgba(93,109,134,0.3)',
            color: '#e4ecfa',
            cursor: 'pointer',
          }}
        >
          {T(lang, 'gameBack')}
        </button>
        <button
          disabled={!canStart}
          onClick={() => onStart(innings)}
          style={{
            padding: '10px 24px',
            borderRadius: 6,
            background: canStart ? '#3fb950' : 'rgba(93,109,134,0.3)',
            color: '#0a0f1a',
            fontWeight: 700,
            cursor: canStart ? 'pointer' : 'not-allowed',
            border: 'none',
          }}
        >
          {T(lang, 'gameStart')}
        </button>
      </div>
    </div>
  );
};
