import { useState, type FC, type ReactNode } from 'react';
import { T, type Lang } from '../../../i18n';
import type { SessionConfig, SessionDurationSec } from '../../SessionConfig';
import type { ControllerState } from '../GameSessionController';

export interface SelectDurationStepProps {
  lang: Lang;
  isActive: boolean;
  config: SessionConfig;
  controllerState: ControllerState;
  openSubjectButton: ReactNode;
  statusPill: ReactNode;
  onStart: (duration: SessionDurationSec) => void;
  onBack: () => void;
}

const DURATIONS: SessionDurationSec[] = [300, 600, 900, 1200];

export const SelectDurationStep: FC<SelectDurationStepProps> = ({
  lang,
  isActive,
  controllerState,
  openSubjectButton,
  statusPill,
  onStart,
  onBack,
}) => {
  const [duration, setDuration] = useState<SessionDurationSec>(300);
  const canStart = isActive && controllerState === 'preview';
  const blockReason = !isActive
    ? T(lang, 'gameNoIndicatorsHint')
    : controllerState !== 'preview'
      ? T(lang, 'gameWaitingSubjectHint')
      : '';

  return (
    <div>
      <div style={{ marginBottom: 14, color: 'rgba(200,215,235,0.75)' }}>
        {T(lang, 'gameStep2Desc')}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: `1px solid ${duration === d ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
              background: duration === d ? 'rgba(88,166,255,0.08)' : 'transparent',
              color: '#e4ecfa',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {d / 60} min
          </button>
        ))}
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
          onClick={() => onStart(duration)}
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
