import { type FC, type ReactNode } from 'react';
import { T, type Lang } from '../../../i18n';
import type { SessionConfig } from '../../SessionConfig';
import type { ControllerState } from '../GameSessionController';

export interface SelectBloomStepProps {
  lang: Lang;
  isActive: boolean;
  config: SessionConfig;
  controllerState: ControllerState;
  openSubjectButton: ReactNode;
  statusPill: ReactNode;
  onStart: () => void;
  onBack: () => void;
}

export const SelectBloomStep: FC<SelectBloomStepProps> = ({
  lang,
  isActive,
  controllerState,
  openSubjectButton,
  statusPill,
  onStart,
  onBack,
}) => {
  const canStart = isActive && controllerState === 'preview';
  const blockReason = !isActive
    ? T(lang, 'gameNoIndicatorsHint')
    : controllerState !== 'preview'
      ? T(lang, 'gameWaitingSubjectHint')
      : '';

  return (
    <div>
      <div style={{ marginBottom: 14, color: 'rgba(200,215,235,0.75)' }}>
        {lang === 'zh'
          ? '沒有時間限制 · 先完成沙畫，再持續放鬆讓樹木滿開即完成訓練'
          : 'No time limit · complete the sand pattern, then relax to bloom the trees'}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          marginBottom: 18,
          padding: '14px 20px',
          borderRadius: 10,
          background: 'rgba(196,106,170,0.08)',
          border: '1px solid rgba(196,106,170,0.30)',
        }}
      >
        <div style={{ fontSize: 28 }}>🌸</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(196,106,170,0.75)', marginBottom: 4 }}>
            {lang === 'zh' ? '訓練目標' : 'Training Goal'}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#ffd6e0' }}>
            {lang === 'zh' ? '滿開 100%' : 'Full Bloom 100%'}
          </div>
        </div>
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
          onClick={onStart}
          style={{
            padding: '10px 24px',
            borderRadius: 6,
            background: canStart ? '#c46aaa' : 'rgba(93,109,134,0.3)',
            color: canStart ? '#fff' : 'rgba(200,215,235,0.4)',
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
