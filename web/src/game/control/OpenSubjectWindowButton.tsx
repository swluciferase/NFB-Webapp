import type { FC } from 'react';
import { T, type Lang } from '../../i18n';
import type { ControllerState } from './GameSessionController';

export interface OpenSubjectWindowButtonProps {
  lang: Lang;
  state: ControllerState;
  onOpen: () => void;
}

export const OpenSubjectWindowButton: FC<OpenSubjectWindowButtonProps> = ({ lang, state, onOpen }) => {
  const open = state !== 'idle';
  return (
    <button
      onClick={onOpen}
      style={{
        padding: '10px 18px',
        borderRadius: 6,
        background: open ? 'rgba(88,166,255,0.08)' : '#58a6ff',
        border: `1px solid ${open ? 'rgba(88,166,255,0.4)' : 'transparent'}`,
        color: open ? '#8ecfff' : '#0a0f1a',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {open ? T(lang, 'gameReopenSubject') : T(lang, 'gameOpenSubject')}
    </button>
  );
};
