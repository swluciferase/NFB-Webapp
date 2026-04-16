import { useEffect, useRef, useState, type FC } from 'react';
import {
  createGameChannel,
  GAME_PROTOCOL_VERSION,
  type GameChannel,
} from '../../services/gameChannel';
import { GameEngine } from './GameEngine';
import { installInputCapture } from './InputCapture';
import type { GameStats } from '../Game';

const HUD_PANEL_STYLE: React.CSSProperties = {
  background: 'rgba(10,18,35,0.72)',
  border: '1px solid rgba(130,190,255,0.3)',
  borderRadius: 14,
  padding: '12px 18px',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  color: '#fff',
  fontFamily: '-apple-system, system-ui, sans-serif',
  pointerEvents: 'none',
};

const HUD_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '2.5px',
  color: 'rgba(180,210,255,0.6)',
};

const HUD_VALUE_STYLE: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  marginTop: 4,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
};

const HUD_SUB_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(180,210,255,0.55)',
  marginTop: 2,
};

// ── Dual baseball scoreboard ───────────────────────────────────────────────

interface DualScoreboardProps {
  teamA: string;
  teamB: string;
  runsA: number[];  // −1 = not yet played
  runsB: number[];
  isBottom: boolean;
  currentInning: number;  // 1-based
  inningTotal: number;
}

const DualScoreboard: FC<DualScoreboardProps> = ({ teamA, teamB, runsA, runsB, isBottom, currentInning, inningTotal }) => {
  const totalA = runsA.filter((r) => r >= 0).reduce((s, r) => s + r, 0);
  const totalB = runsB.filter((r) => r >= 0).reduce((s, r) => s + r, 0);

  const cellStyle = (active: boolean, played: boolean): React.CSSProperties => ({
    width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: played ? 700 : 400,
    color: active ? '#fff' : played ? 'rgba(220,235,255,0.9)' : 'rgba(150,170,200,0.4)',
    background: active ? 'rgba(88,166,255,0.25)' : 'transparent',
    borderRadius: 4,
    transition: 'background 0.2s',
  });

  const innings = Array.from({ length: inningTotal }, (_, i) => i);

  return (
    <div style={{
      position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, pointerEvents: 'none',
      background: 'rgba(8,14,28,0.88)',
      border: '1px solid rgba(130,190,255,0.25)',
      borderRadius: 12, padding: '10px 14px',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      color: '#fff', minWidth: 380,
    }}>
      {/* Header row: inning numbers */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
        <div style={{ width: 80, fontSize: 10, color: 'rgba(150,170,200,0.5)', letterSpacing: '1px' }}>
          {isBottom
            ? <span style={{ fontSize: 9, background: 'rgba(250,140,80,0.2)', color: 'rgba(250,140,80,0.9)', borderRadius: 3, padding: '1px 5px' }}>▼ BOTTOM</span>
            : <span style={{ fontSize: 9, background: 'rgba(88,166,255,0.2)', color: 'rgba(88,166,255,0.9)', borderRadius: 3, padding: '1px 5px' }}>▲ TOP</span>}
        </div>
        {innings.map((i) => (
          <div key={i} style={{ width: 32, textAlign: 'center', fontSize: 10,
            color: (i + 1) === currentInning ? 'rgba(88,166,255,0.9)' : 'rgba(150,170,200,0.45)',
            fontWeight: (i + 1) === currentInning ? 700 : 400 }}>
            {i + 1}
          </div>
        ))}
        <div style={{ width: 36, textAlign: 'center', fontSize: 10, color: 'rgba(150,170,200,0.5)', fontWeight: 700, marginLeft: 4 }}>R</div>
      </div>

      {/* Team A row (top half) */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
        <div style={{ width: 80, fontSize: 12, fontWeight: 600,
          color: !isBottom ? '#88c8ff' : 'rgba(180,210,255,0.6)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {teamA}
        </div>
        {innings.map((i) => {
          const played = runsA[i] >= 0;
          const active = (i + 1) === currentInning && !isBottom;
          return <div key={i} style={cellStyle(active, played)}>{played ? runsA[i] : '—'}</div>;
        })}
        <div style={{ width: 36, textAlign: 'center', fontSize: 15, fontWeight: 800,
          color: totalA > totalB ? '#ffd166' : 'rgba(220,235,255,0.85)', marginLeft: 4 }}>
          {totalA}
        </div>
      </div>

      {/* Team B row (bottom half) */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 80, fontSize: 12, fontWeight: 600,
          color: isBottom ? '#ffb060' : 'rgba(255,180,120,0.6)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {teamB}
        </div>
        {innings.map((i) => {
          const played = runsB[i] >= 0;
          const active = (i + 1) === currentInning && isBottom;
          return <div key={i} style={cellStyle(active, played)}>{played ? runsB[i] : '—'}</div>;
        })}
        <div style={{ width: 36, textAlign: 'center', fontSize: 15, fontWeight: 800,
          color: totalB > totalA ? '#ffd166' : 'rgba(220,235,255,0.85)', marginLeft: 4 }}>
          {totalB}
        </div>
      </div>
    </div>
  );
};

export const SubjectWindowRoot: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<GameStats>({ rl: 0 });
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
    const removeStats = engine.onStats((s) => setStats(s));

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
      removeStats();
      void engine.stop();
      ch.close();
    };
  }, []);

  const ooPct = Math.max(0, Math.min(100, stats.rl));
  // Baseball renders its own scoreboard inside the Pixi scene, so we hide
  // the HTML HUD cards entirely in baseball mode — they were overlapping
  // the new top-center scoreboard on smaller windows.
  const isBaseball    = stats.inning    != null;
  const isDualBaseball = isBaseball && stats.dualTeamAName != null;
  const isZentangle   = stats.coveragePct != null;
  const isKaresanzui  = stats.bloomPct  != null;
  const distanceKm    = ((stats.distanceM ?? 0) / 1000).toFixed(2);
  const coveragePct   = Math.max(0, Math.min(100, stats.coveragePct ?? 0));
  const bloomPct      = Math.max(0, Math.min(100, stats.bloomPct    ?? 0));

  return (
    <>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />

      {/* HUD — top-left: RL / Reward Level (plane only; baseball uses its in-scene HUD) */}
      {!isBaseball && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            left: 20,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div style={HUD_PANEL_STYLE}>
            <div style={HUD_LABEL_STYLE}>回饋值 · Reward Level</div>
            <div style={HUD_VALUE_STYLE}>{ooPct}</div>
            <div
              style={{
                width: 200,
                height: 8,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 4,
                overflow: 'hidden',
                marginTop: 10,
              }}
            >
              <div
                style={{
                  width: `${ooPct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #4a8bff, #7ee8c6 50%, #ffd166)',
                  boxShadow: '0 0 16px rgba(126,232,198,0.6)',
                  borderRadius: 4,
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* HUD — top-right: plane altitude, zentangle coverage, or karesanzui bloom.
          Baseball's scoreboard is drawn in-scene so we skip it there. */}
      {!isBaseball && !isZentangle && !isKaresanzui && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div style={{ ...HUD_PANEL_STYLE, textAlign: 'right' }}>
            <div style={HUD_LABEL_STYLE}>Altitude</div>
            <div style={HUD_VALUE_STYLE}>{stats.altitudeM ?? 0} m</div>
            <div style={HUD_SUB_STYLE}>{distanceKm} km flown</div>
          </div>
        </div>
      )}

      {isZentangle && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div style={{ ...HUD_PANEL_STYLE, textAlign: 'right', minWidth: 220 }}>
            <div style={HUD_LABEL_STYLE}>Progress</div>
            <div style={HUD_VALUE_STYLE}>{coveragePct.toFixed(1)}%</div>
            <div
              style={{
                width: 200,
                height: 8,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 4,
                overflow: 'hidden',
                marginTop: 10,
                marginLeft: 'auto',
              }}
            >
              <div
                style={{
                  width: `${coveragePct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #c98a3f, #6a9b6c)',
                  boxShadow: '0 0 14px rgba(106,155,108,0.55)',
                  borderRadius: 4,
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Karesanzui bloom progress — right panel */}
      {isKaresanzui && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 10, pointerEvents: 'none' }}>
          <div style={{ ...HUD_PANEL_STYLE, textAlign: 'right', minWidth: 220 }}>
            <div style={HUD_LABEL_STYLE}>滿開 · Bloom</div>
            <div style={HUD_VALUE_STYLE}>{bloomPct.toFixed(0)}%</div>
            <div
              style={{
                width: 200, height: 8,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 4, overflow: 'hidden', marginTop: 10, marginLeft: 'auto',
              }}
            >
              <div
                style={{
                  width: `${bloomPct}%`, height: '100%',
                  background: 'linear-gradient(90deg,#6a2a6a,#c46aaa 55%,#ffc0d8)',
                  boxShadow: '0 0 14px rgba(196,106,170,0.55)',
                  borderRadius: 4, transition: 'width 0.15s ease',
                }}
              />
            </div>
            <div style={{ ...HUD_SUB_STYLE, marginTop: 6 }}>
              {bloomPct >= 100 ? '滿開' : bloomPct > 0 ? '開花中…' : '繪製沙畫中'}
            </div>
          </div>
        </div>
      )}

      {/* ── Dual baseball scoreboard ── */}
      {isDualBaseball && (
        <DualScoreboard
          teamA={stats.dualTeamAName!}
          teamB={stats.dualTeamBName!}
          runsA={stats.dualTeamARuns ?? []}
          runsB={stats.dualTeamBRuns ?? []}
          isBottom={stats.dualIsBottomHalf ?? false}
          currentInning={stats.dualCurrentInning ?? 1}
          inningTotal={stats.dualInningTotal ?? 9}
        />
      )}

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
            zIndex: 100,
          }}
        >
          Game engine error: {error}
        </div>
      )}
    </>
  );
};
