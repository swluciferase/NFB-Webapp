import { useEffect, useRef, useState, type FC } from 'react';
import {
  createGameChannel,
  GAME_PROTOCOL_VERSION,
  type GameChannel,
} from '../../services/gameChannel';
import { GameEngine } from './GameEngine';
import { installInputCapture } from './InputCapture';

export const SubjectWindowRoot: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<GameChannel | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ch = createGameChannel();
    channelRef.current = ch;
    const engine = new GameEngine({ container, channel: ch });
    engineRef.current = engine;
    const removeInput = installInputCapture(ch);

    engine
      .start()
      .then(() => {
        ch.post({ kind: 'subjectReady', protocolVersion: GAME_PROTOCOL_VERSION });
      })
      .catch((err) => setError((err as Error).message));

    const hbId = window.setInterval(() => {
      ch.post({ kind: 'heartbeatSubject', t: performance.now() });
    }, 2000);

    const onUnload = () => ch.post({ kind: 'subjectClosing' });
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.clearInterval(hbId);
      window.removeEventListener('beforeunload', onUnload);
      removeInput();
      void engine.stop();
      ch.close();
    };
  }, []);

  return (
    <>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
      {error && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#100',
            color: '#f85149',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          Game engine error: {error}
        </div>
      )}
    </>
  );
};
