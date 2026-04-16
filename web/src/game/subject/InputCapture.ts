import type { GameChannel } from '../../services/gameChannel';
import type { GameInputEvent } from '../Game';

export function installInputCapture(channel: GameChannel): () => void {
  const handleKey = (e: KeyboardEvent) => {
    let evt: GameInputEvent | null = null;
    if (e.code === 'Space') evt = { type: 'primary' };
    else if (e.code === 'Escape') evt = { type: 'secondary' };
    else if (e.code === 'KeyP') evt = { type: 'pause' };
    else if (e.code === 'ArrowUp') evt = { type: 'direction', dx: 0, dy: -1 };
    else if (e.code === 'ArrowDown') evt = { type: 'direction', dx: 0, dy: 1 };
    else if (e.code === 'ArrowLeft') evt = { type: 'direction', dx: -1, dy: 0 };
    else if (e.code === 'ArrowRight') evt = { type: 'direction', dx: 1, dy: 0 };
    if (!evt) return;
    e.preventDefault();
    channel.post({ kind: 'gameInput', event: evt });
  };
  window.addEventListener('keydown', handleKey);
  return () => window.removeEventListener('keydown', handleKey);
}
