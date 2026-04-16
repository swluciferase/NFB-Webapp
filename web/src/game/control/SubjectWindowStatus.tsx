import type { FC } from 'react';
import { T, type Lang } from '../../i18n';
import type { ControllerState } from './GameSessionController';

export interface SubjectWindowStatusProps {
  lang: Lang;
  state: ControllerState;
}

function display(state: ControllerState): { c: string; k: string } {
  switch (state) {
    case 'idle':
      return { c: 'rgba(200,215,235,0.4)', k: 'gameSubjectIdle' };
    case 'connecting':
      return { c: '#f0a93e', k: 'gameSubjectConnecting' };
    case 'preview':
      return { c: '#3fb950', k: 'gameSubjectReady' };
    case 'runActive':
      return { c: '#58a6ff', k: 'gameSubjectActive' };
    case 'runRest':
      return { c: '#58a6ff', k: 'gameSubjectRest' };
    case 'paused':
      return { c: '#f0a93e', k: 'gameSubjectPaused' };
    case 'subjectLost':
      return { c: '#f85149', k: 'gameSubjectLost' };
    case 'sessionReport':
      return { c: 'rgba(200,215,235,0.4)', k: 'gameSubjectDone' };
  }
}

export const SubjectWindowStatus: FC<SubjectWindowStatusProps> = ({ lang, state }) => {
  const { c, k } = display(state);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${c}`,
        color: c,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: c }} />
      {T(lang, k)}
    </span>
  );
};
