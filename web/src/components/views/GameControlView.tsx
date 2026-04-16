import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import type { EegPacket, FilterParams } from '../../types/eeg';
import { useBandPower, type BandPowerMatrix } from '../../hooks/useBandPower';
import { type Lang, T } from '../../i18n';
import { useGameOverlayOpacity } from '../../hooks/useGameOverlayOpacity';
import { createGameChannel, type GameChannel } from '../../services/gameChannel';
import { GameSessionController, type ControllerState } from '../../game/control/GameSessionController';
import type { SessionConfig, SessionDurationSec } from '../../game/SessionConfig';
import { SelectGameStep } from '../../game/control/sessionWizard/SelectGameStep';
import { SelectDurationStep } from '../../game/control/sessionWizard/SelectDurationStep';
import { OpenSubjectWindowButton } from '../../game/control/OpenSubjectWindowButton';
import { SubjectWindowStatus } from '../../game/control/SubjectWindowStatus';
import { TherapistHud } from '../../game/control/TherapistHud';
import { SessionReportView } from '../../game/control/sessionReport';

export interface GameControlViewProps {
  packets: EegPacket[] | undefined;
  filterParams: FilterParams;
  hidden: boolean;
  lang: Lang;
  isConnected: boolean;
}

function bandPowerToMetricMap(bp: BandPowerMatrix | null): Record<string, number> | null {
  if (!bp) return null;
  // Channel order: Fp1 Fp2 T7 T8 O1 O2 Fz Pz
  // Band order:    Delta Theta Alpha SMR Beta Hi-Beta Gamma
  const Fz = 6;
  const Theta = 1;
  const Beta = 4;
  return {
    Fz_Beta: bp[Fz]?.[Beta] ?? 0,
    Fz_Theta: bp[Fz]?.[Theta] ?? 0,
  };
}

export const GameControlView: FC<GameControlViewProps> = ({ packets, filterParams, lang, isConnected }) => {
  const bandPower = useBandPower(packets, filterParams);

  const [step, setStep] = useState<'game' | 'duration' | 'active' | 'report'>('game');
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [controllerState, setControllerState] = useState<ControllerState>('idle');
  const controllerRef = useRef<GameSessionController | null>(null);
  const channelRef = useRef<GameChannel | null>(null);
  const subjectWindowRef = useRef<Window | null>(null);

  const metrics = useMemo(() => bandPowerToMetricMap(bandPower), [bandPower]);
  const { oo, ta, isActive } = useGameOverlayOpacity(metrics);

  // Create channel + controller once
  useEffect(() => {
    const ch = createGameChannel();
    const ctrl = new GameSessionController({ channel: ch });
    channelRef.current = ch;
    controllerRef.current = ctrl;
    const unsub = ctrl.onChange(() => setControllerState(ctrl.state));
    return () => {
      unsub();
      ctrl.dispose();
      ch.close();
      channelRef.current = null;
      controllerRef.current = null;
    };
  }, []);

  // Broadcast OO every tick while RUN ACTIVE
  useEffect(() => {
    if (controllerState !== 'runActive') return;
    const ch = channelRef.current;
    if (!ch) return;
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      ch.post({ kind: 'oo', t: performance.now() - startedAt, oo, ta });
    }, 100);
    return () => window.clearInterval(id);
  }, [controllerState, oo, ta]);

  // Broadcast main heartbeat
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const id = window.setInterval(() => {
      ch.post({ kind: 'heartbeatMain', t: performance.now() });
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const onOpenSubject = () => {
    const w = window.open('/nfb-game.html', 'soramynd-subject', 'popup,width=1280,height=800');
    if (!w) {
      alert(T(lang, 'gameSubjectPopupBlocked'));
      return;
    }
    subjectWindowRef.current = w;
    controllerRef.current?.openSubjectWindow();
  };

  const onStart = (duration: SessionDurationSec) => {
    if (!sessionConfig || !controllerRef.current) return;
    const cfgWithDur: SessionConfig = { ...sessionConfig, plannedDurationSec: duration };
    setSessionConfig(cfgWithDur);
    controllerRef.current.configure(cfgWithDur);
    controllerRef.current.start();
    setStep('active');
  };

  if (!isConnected) {
    return (
      <div style={{ padding: 32, color: 'rgba(200,215,235,0.7)' }}>
        {T(lang, 'gameConnectRequired')}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: '#e4ecfa' }}>
      <h2 style={{ margin: '0 0 20px' }}>{T(lang, 'tabGames')}</h2>

      {step === 'game' && (
        <SelectGameStep
          lang={lang}
          onSelect={(cfg) => {
            setSessionConfig(cfg);
            setStep('duration');
          }}
          onPreview={(cfg) => controllerRef.current?.previewLoadGame(cfg)}
        />
      )}

      {step === 'duration' && sessionConfig && (
        <SelectDurationStep
          lang={lang}
          isActive={isActive}
          config={sessionConfig}
          controllerState={controllerState}
          openSubjectButton={<OpenSubjectWindowButton lang={lang} state={controllerState} onOpen={onOpenSubject} />}
          statusPill={<SubjectWindowStatus lang={lang} state={controllerState} />}
          onStart={onStart}
          onBack={() => setStep('game')}
        />
      )}

      {step === 'active' && controllerRef.current && (
        <TherapistHud
          lang={lang}
          controller={controllerRef.current}
          controllerState={controllerState}
          oo={oo}
          ta={ta}
          onReportComplete={() => setStep('report')}
        />
      )}

      {step === 'report' && controllerRef.current && (
        <SessionReportView
          lang={lang}
          report={controllerRef.current.buildReport()}
          onDone={() => setStep('game')}
        />
      )}
    </div>
  );
};
