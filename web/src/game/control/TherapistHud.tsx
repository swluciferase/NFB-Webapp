import { useEffect, type CSSProperties, type FC } from 'react';
import { T, type Lang } from '../../i18n';
import type { ControllerState, GameSessionController } from './GameSessionController';

export interface TherapistHudProps {
  lang: Lang;
  controller: GameSessionController;
  controllerState: ControllerState;
  oo: number;
  ta: number;
  onReportComplete: () => void;
}

export const TherapistHud: FC<TherapistHudProps> = ({
  lang,
  controller,
  controllerState,
  oo,
  ta,
  onReportComplete,
}) => {
  useEffect(() => {
    if (controllerState === 'sessionReport') onReportComplete();
  }, [controllerState, onReportComplete]);

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <Stat label={T(lang, 'gameHudOO')} value={`${Math.round(oo)}%`} />
        <Stat label={T(lang, 'gameHudTA')} value={`${Math.round(ta)}%`} />
        <Stat label={T(lang, 'gameHudRuns')} value={`${controller.runs.length}`} />
        <Stat label={T(lang, 'gameHudState')} value={controllerState} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {controllerState === 'runActive' && (
          <button onClick={() => controller.pause()} style={btnStyle('#f0a93e')}>
            {T(lang, 'gameHudPause')}
          </button>
        )}
        {controllerState === 'paused' && (
          <button onClick={() => controller.resume()} style={btnStyle('#3fb950')}>
            {T(lang, 'gameHudResume')}
          </button>
        )}
        {controllerState === 'runRest' && (
          <button onClick={() => controller.start()} style={btnStyle('#58a6ff')}>
            {T(lang, 'gameHudNextRun')}
          </button>
        )}
        <button onClick={() => controller.abort()} style={btnStyle('#f85149')}>
          {T(lang, 'gameHudAbort')}
        </button>
      </div>
    </div>
  );
};

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      padding: 14,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(93,109,134,0.25)',
    }}
  >
    <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.5)' }}>{label}</div>
    <div
      style={{
        fontSize: 22,
        fontWeight: 700,
        color: '#8ecfff',
        marginTop: 4,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      {value}
    </div>
  </div>
);

function btnStyle(bg: string): CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 6,
    background: bg,
    color: '#0a0f1a',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  };
}
