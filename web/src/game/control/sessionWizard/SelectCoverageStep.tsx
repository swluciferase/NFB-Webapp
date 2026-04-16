import { useState, type FC, type ReactNode } from 'react';
import { T, type Lang } from '../../../i18n';
import type { SessionConfig, SessionCoveragePct } from '../../SessionConfig';
import type { ControllerState } from '../GameSessionController';

export interface SelectCoverageStepProps {
  lang: Lang;
  isActive: boolean;
  config: SessionConfig;
  controllerState: ControllerState;
  openSubjectButton: ReactNode;
  statusPill: ReactNode;
  onStart: (pct: SessionCoveragePct) => void;
  onBack: () => void;
}

const CHOICES: SessionCoveragePct[] = [50, 66, 80, 95];

export const SelectCoverageStep: FC<SelectCoverageStepProps> = ({
  lang,
  isActive,
  controllerState,
  openSubjectButton,
  statusPill,
  onStart,
  onBack,
}) => {
  const [pct, setPct] = useState<SessionCoveragePct>(80);
  const canStart = isActive && controllerState === 'preview';
  const blockReason = !isActive
    ? T(lang, 'gameNoIndicatorsHint')
    : controllerState !== 'preview'
      ? T(lang, 'gameWaitingSubjectHint')
      : '';

  return (
    <div>
      <div style={{ marginBottom: 14, color: 'rgba(200,215,235,0.75)' }}>
        {T(lang, 'gameStep2ZentangleDesc')}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {CHOICES.map((n) => (
          <button
            key={n}
            onClick={() => setPct(n)}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: `1px solid ${pct === n ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
              background: pct === n ? 'rgba(88,166,255,0.08)' : 'transparent',
              color: '#e4ecfa',
              cursor: 'pointer',
              fontWeight: 600,
              minWidth: 72,
            }}
          >
            {n}%
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.55)', marginBottom: 18 }}>
        {lang === 'zh'
          ? '沒有時間限制 · 達到目標完成度即結束本回合'
          : 'No time limit · the run ends once the target coverage is reached'}
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
          onClick={() => onStart(pct)}
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
