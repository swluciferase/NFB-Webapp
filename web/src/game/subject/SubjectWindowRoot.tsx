import { useEffect, useRef, useState, type FC } from 'react';
import {
  createGameChannel,
  GAME_PROTOCOL_VERSION,
  type GameChannelMessage,
  type GameChannel,
} from '../../services/gameChannel';

type ConnectionState = 'connecting' | 'ready' | 'closed';

export const SubjectWindowRoot: FC = () => {
  const channelRef = useRef<GameChannel | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [lastMessage, setLastMessage] = useState<string>('waiting for main window…');

  useEffect(() => {
    const ch = createGameChannel();
    channelRef.current = ch;

    const unsub = ch.subscribe((msg: GameChannelMessage) => {
      setLastMessage(msg.kind);
      if (msg.kind === 'hello') {
        setState('ready');
      }
    });

    ch.post({ kind: 'subjectReady', protocolVersion: GAME_PROTOCOL_VERSION });

    // 2s heartbeat
    const hbId = window.setInterval(() => {
      ch.post({ kind: 'heartbeatSubject', t: performance.now() });
    }, 2000);

    // Tell main we are closing
    const onUnload = () => {
      ch.post({ kind: 'subjectClosing' });
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.clearInterval(hbId);
      window.removeEventListener('beforeunload', onUnload);
      unsub();
      ch.close();
      channelRef.current = null;
      setState('closed');
    };
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        letterSpacing: '0.08em',
        color: 'rgba(230,240,255,0.35)',
      }}
    >
      <div>
        SoraMynd NFB Game — {state} · {lastMessage}
      </div>
    </div>
  );
};
