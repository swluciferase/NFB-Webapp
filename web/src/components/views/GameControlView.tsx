import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FC } from 'react';
import type { EegPacket, FilterParams } from '../../types/eeg';
import { useBandPower, type BandPowerMatrix } from '../../hooks/useBandPower';
import { type Lang, T } from '../../i18n';
import { useGameOverlayOpacity } from '../../hooks/useGameOverlayOpacity';
import { createGameChannel, type GameChannel } from '../../services/gameChannel';
import { GameSessionController, type ControllerState } from '../../game/control/GameSessionController';
import { SelectGameStep } from '../../game/control/sessionWizard/SelectGameStep';
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
  /** Shared feedback file (set here, read + used in TrainingView for overlay). */
  feedbackFile: File | null;
  setFeedbackFile: (f: File | null) => void;
  /** Shared feedback URL (set here, read + used in TrainingView for overlay). */
  feedbackUrl: string;
  setFeedbackUrl: (u: string) => void;
  /** Called with a start-game function when a game is ready (preview state),
   *  or null when not ready. TrainingView's start button uses this. */
  onGameStartable?: (fn: (() => void) | null) => void;
  /** Called when "開啟受測者視窗" is clicked while classic feedback is selected.
   *  App.tsx routes this to TrainingView to open the feedback window. */
  onOpenClassicWindow?: () => void;
}

function bandPowerToMetricMap(bp: BandPowerMatrix | null): Record<string, number> | null {
  if (!bp) return null;
  const Fz = 6, Theta = 1, Beta = 4;
  return {
    Fz_Beta: bp[Fz]?.[Beta] ?? 0,
    Fz_Theta: bp[Fz]?.[Theta] ?? 0,
  };
}

export const GameControlView: FC<GameControlViewProps> = ({
  packets, filterParams, lang, isConnected,
  feedbackFile, setFeedbackFile, feedbackUrl, setFeedbackUrl,
  onGameStartable, onOpenClassicWindow,
}) => {
  const bandPower = useBandPower(packets, filterParams);

  const [step, setStep] = useState<'game' | 'active' | 'report'>('game');
  const [controllerState, setControllerState] = useState<ControllerState>('idle');
  const [classicSelected, setClassicSelected] = useState(false);
  const [classicWindowOpen, setClassicWindowOpen] = useState(false);
  const [clearTrigger, setClearTrigger] = useState(0);
  const controllerRef = useRef<GameSessionController | null>(null);
  const channelRef = useRef<GameChannel | null>(null);

  // File input refs for 經典回饋 card
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const pptxInputRef  = useRef<HTMLInputElement | null>(null);
  const pdfInputRef   = useRef<HTMLInputElement | null>(null);

  const metrics = useMemo(() => bandPowerToMetricMap(bandPower), [bandPower]);
  const { rl, ta } = useGameOverlayOpacity(metrics);
  const rlRef = useRef(0);
  const taRef = useRef(0);
  useEffect(() => { rlRef.current = rl; }, [rl]);
  useEffect(() => { taRef.current = ta; }, [ta]);

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

  // Expose a start-game function to the parent whenever subject window is ready
  // and classic feedback is NOT selected (classic and games are mutually exclusive).
  useEffect(() => {
    if (controllerState === 'preview' && !classicSelected) {
      onGameStartable?.(() => {
        const ctrl = controllerRef.current;
        if (!ctrl?.config) return;
        ctrl.configure(ctrl.config);
        ctrl.start();
        setStep('active');
      });
    } else {
      onGameStartable?.(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllerState, classicSelected]);

  // Broadcast OO when subject window is live
  useEffect(() => {
    const broadcastStates: ControllerState[] = ['preview', 'runActive', 'runRest'];
    if (!broadcastStates.includes(controllerState)) return;
    const ch = channelRef.current;
    if (!ch) return;
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      ch.post({ kind: 'rl', t: performance.now() - startedAt, rl: rlRef.current, ta: taRef.current });
    }, 100);
    return () => window.clearInterval(id);
  }, [controllerState]);

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
    if (classicSelected) {
      onOpenClassicWindow?.();
      setClassicWindowOpen(true);
      return;
    }
    const w = window.open('/nfb-game.html', 'soramynd-subject', 'popup,width=1280,height=800');
    if (!w) {
      alert(T(lang, 'gameSubjectPopupBlocked'));
      return;
    }
    controllerRef.current?.openSubjectWindow();
  };

  if (!isConnected) {
    return (
      <div style={{ padding: 32, color: 'rgba(200,215,235,0.7)' }}>
        {T(lang, 'gameConnectRequired')}
      </div>
    );
  }

  const fileLabel = feedbackFile
    ? feedbackFile.name.slice(0, 28) + (feedbackFile.name.length > 28 ? '…' : '')
    : feedbackUrl.trim()
      ? feedbackUrl.slice(0, 28) + (feedbackUrl.length > 28 ? '…' : '')
      : null;

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: '#e4ecfa', overflowY: 'auto', flex: 1 }}>

      {/* ── Page header row: title + subject window controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{T(lang, 'tabGames')}</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <OpenSubjectWindowButton
            lang={lang}
            state={classicSelected ? (classicWindowOpen ? 'preview' : 'idle') : controllerState}
            onOpen={onOpenSubject}
          />
          {classicSelected
            ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                border: `1px solid ${classicWindowOpen ? '#3fb950' : 'rgba(200,215,235,0.4)'}`,
                color: classicWindowOpen ? '#3fb950' : 'rgba(200,215,235,0.4)',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: classicWindowOpen ? '#3fb950' : 'rgba(200,215,235,0.4)' }} />
                {classicWindowOpen
                  ? (lang === 'zh' ? '視窗已開啟' : 'Window Open')
                  : (lang === 'zh' ? '尚未開啟' : 'Not Open')}
              </span>
            )
            : <SubjectWindowStatus lang={lang} state={controllerState} />
          }
        </div>
      </div>

      {step === 'game' && (
        <>
          {/* ── 經典回饋（視覺遮罩）card — selectable, mutually exclusive with games ── */}
          <div
            onClick={() => {
              setClassicSelected(true);
              setClearTrigger((n) => n + 1); // tell SelectGameStep to deselect any game
            }}
            style={{
              background: classicSelected ? 'rgba(88,166,255,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${classicSelected ? '#58a6ff' : 'rgba(93,109,134,0.28)'}`,
              borderRadius: 10, padding: '14px 16px', marginBottom: 20,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: classicSelected ? '#58a6ff' : 'rgba(200,215,235,0.55)', letterSpacing: '0.08em', marginBottom: 10 }}>
              {lang === 'zh' ? '經典回饋（視覺遮罩）' : 'Classic Feedback (Visual Mask)'}
            </div>

            {/* URL input */}
            <input
              type="url"
              placeholder={T(lang, 'trainFeedbackUrlPlaceholder')}
              value={feedbackUrl}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { setFeedbackUrl(e.target.value); setFeedbackFile(null); }}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(93,109,134,0.3)',
                borderRadius: 6, color: '#e4ecfa',
                fontSize: 12, padding: '6px 8px', marginBottom: 8,
              }}
            />

            {/* Hidden file inputs */}
            <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) { setFeedbackFile(f); setFeedbackUrl(''); }
                e.target.value = '';
              }}
            />
            <input ref={pptxInputRef} type="file" accept=".pptx" style={{ display: 'none' }}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) { setFeedbackFile(f); setFeedbackUrl(''); }
                e.target.value = '';
              }}
            />
            <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) { setFeedbackFile(f); setFeedbackUrl(''); }
                e.target.value = '';
              }}
            />

            {/* File picker buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {(['video', 'pptx', 'pdf'] as const).map((type) => {
                const labels = {
                  video: T(lang, 'trainVideoBtn'),
                  pptx:  T(lang, 'trainSlideBtn'),
                  pdf:   T(lang, 'trainPdfBtn'),
                };
                const refs = { video: videoInputRef, pptx: pptxInputRef, pdf: pdfInputRef };
                const isSelected = feedbackFile && (
                  type === 'pdf'  ? feedbackFile.name.toLowerCase().endsWith('.pdf')
                  : type === 'pptx' ? feedbackFile.name.toLowerCase().endsWith('.pptx')
                  : !feedbackFile.name.toLowerCase().endsWith('.pdf') && !feedbackFile.name.toLowerCase().endsWith('.pptx')
                );
                return (
                  <button
                    key={type}
                    onClick={() => refs[type].current?.click()}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 6,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${isSelected ? 'rgba(88,166,255,0.6)' : 'rgba(93,109,134,0.3)'}`,
                      background: isSelected ? 'rgba(88,166,255,0.12)' : 'transparent',
                      color: isSelected ? '#58a6ff' : 'rgba(200,215,235,0.7)',
                    }}
                  >
                    {labels[type]}
                  </button>
                );
              })}
            </div>

            {/* Selected file name + clear */}
            {fileLabel && (
              <div style={{ marginTop: 7, fontSize: 11, color: 'rgba(88,166,255,0.75)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '88%' }}>
                  {fileLabel}
                </span>
                {feedbackFile && (
                  <button
                    onClick={() => setFeedbackFile(null)}
                    style={{ background: 'none', border: 'none', color: 'rgba(248,81,73,0.7)', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}
                  >✕</button>
                )}
              </div>
            )}
          </div>

          {/* ── Game selection + per-game params ── */}
          <SelectGameStep
            lang={lang}
            onPreview={(cfg) => controllerRef.current?.previewLoadGame(cfg)}
            onGamePicked={() => { setClassicSelected(false); setClassicWindowOpen(false); }}
            clearTrigger={clearTrigger}
          />
        </>
      )}

      {step === 'active' && controllerRef.current && (
        <TherapistHud
          lang={lang}
          controller={controllerRef.current}
          controllerState={controllerState}
          rl={rl}
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
