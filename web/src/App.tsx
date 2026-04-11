import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import './App.css';
import { Header } from './components/layout/Header';
import type { PageType } from './components/layout/Header';
import { SessionBanner } from './components/layout/SessionBanner';
// TabType kept for internal guard logic only
import type { TabType } from './components/layout/Sidebar';
import { HomeView } from './components/views/HomeView';
import { ImpedanceView } from './components/views/ImpedanceView';
import { WaveformView } from './components/views/WaveformView';
import { FftView } from './components/views/FftView';
import { RecordView } from './components/views/RecordView';
import { TrainingView, type TrainingSessionStats } from './components/views/TrainingView';
import { ConnectModal } from './components/modals/ConnectModal';
import { useEegStream } from './hooks/useEegStream';
import { useQualityMonitor } from './hooks/useQualityMonitor';
import type { QualityConfig } from './hooks/useQualityMonitor';
import { serialService } from './services/serial';
import type { ConnectionStatus } from './services/serial';
import { ftdiUsbService, type UsbDeviceLike } from './services/ftdiUsb';
import { getAuthorizedFtdiDevices } from './services/ftdiScanner';
import {
  registerConnected,
  registerDisconnected,
  updateRegistrySteegId,
} from './services/deviceRegistry';
import { wasmService } from './services/wasm';
import type {
  SubjectInfo,
  FilterParams,
  FilterBiquadState,
  DeviceConfig,
} from './types/eeg';
import {
  DEFAULT_FILTER_PARAMS,
  makeFilterBiquadState,
  DEFAULT_CONFIG,
  SAMPLE_RATE_HZ,
} from './types/eeg';
import type { RecordedSample } from './services/csvWriter';
import type { Lang } from './i18n';
import { T } from './i18n';

// ── WASM interface types ──

interface SteegParser {
  feed(data: Uint8Array): unknown;
  packets_received(): number;
  packets_lost(): number;
  decode_errors(): number;
  enable_impedance(windowSize: number, sampleRate: number): void;
  disable_impedance(): void;
  free(): void;
}

interface WasmCommands {
  cmd_adc_on(): Uint8Array;
  cmd_adc_off(): Uint8Array;
  cmd_impedance_ac_on(code_set: string): Uint8Array;
  cmd_impedance_ac_off(): Uint8Array;
  cmd_machine_info(): Uint8Array;
}

// ── App-level filter param helpers ──

function computeFilterDesc(fp: FilterParams): string {
  if (!fp.bandpassEnabled) return 'None';
  return `${fp.hpFreq}–${fp.lpFreq} Hz`;
}

function computeNotchDesc(fp: FilterParams): string {
  if (fp.notchFreq === 0) return 'None';
  return `${fp.notchFreq} Hz`;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [activePage, setActivePage] = useState<PageType>('ci');
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lang, setLang] = useState<Lang>('zh');
  const [showConnectModal, setShowConnectModal] = useState(false);

  // Active data source (SerialService or FtdiUsbService) — drives useEegStream
  type AnyService = typeof serialService | typeof ftdiUsbService;
  const [serial, setSerial] = useState<AnyService | null>(null);
  const activeServiceRef = useRef<AnyService>(serialService);
  const [parser, setParser] = useState<SteegParser | null>(null);

  const [config] = useState<DeviceConfig>(DEFAULT_CONFIG);

  // Device ID extracted from first serial number packet
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const deviceIdSeenRef = useRef(false);
  /** USB serialNumber of the device selected in ConnectModal (e.g. "AV0KHCQP").
   *  Compared with machineInfo from firmware to verify the correct COM port was picked. */
  const expectedSerialRef = useRef<string>('');

  // Impedance mode tracking
  const impedanceModeActiveRef = useRef(false);
  const [isImpedanceActive, setIsImpedanceActive] = useState(false);

  // ── Shared filter state ──
  // filterParams is React state (drives UI re-renders)
  // filterBiquadRef is a ref (not React state) — internal IIR delay values
  // Both live in App so they survive tab switching
  const [filterParams, setFilterParams] = useState<FilterParams>(DEFAULT_FILTER_PARAMS);
  const filterBiquadRef = useRef<FilterBiquadState>(makeFilterBiquadState());

  // When filter params change, reset the appropriate biquad states
  const handleFilterChange = useCallback((
    updated: Partial<FilterParams>,
    resetStates?: string[],
  ) => {
    setFilterParams(prev => ({ ...prev, ...updated }));
    if (resetStates) {
      const biquad = filterBiquadRef.current;
      if (resetStates.includes('hp')) {
        biquad.hpState1.fill(0);
        biquad.hpState2.fill(0);
        biquad.dcState.fill(0);
      }
      if (resetStates.includes('lp')) {
        biquad.lpState1.fill(0);
        biquad.lpState2.fill(0);
      }
      if (resetStates.includes('notch')) {
        biquad.notchState.fill(0);
      }
    }
  }, []);

  // ── Subject info ──
  const [subjectInfo, setSubjectInfo] = useState<SubjectInfo>({
    id: '', name: '', dob: '', sex: '', notes: '',
  });

  // ── Recording state ──
  const [isRecording, setIsRecording] = useState(false);
  const [trainingStats, setTrainingStats] = useState<TrainingSessionStats | null>(null);
  const [recordedSamples, setRecordedSamples] = useState<RecordedSample[]>([]);
  const [recordStartTime, setRecordStartTime] = useState<Date | null>(null);
  const recordSamplesRef = useRef<RecordedSample[]>([]);
  const recordTimestampRef = useRef<number>(0); // seconds from start

  // ── Quality monitor config ──
  const [qualityConfig, setQualityConfig] = useState<QualityConfig>({
    enabled: true,
    sensitivity: 3,
    targetDurationSec: 60,
    windowSec: 2,
  });

  // ── Event markers (shared between signal + record views) ──
  const [eventMarkers, setEventMarkers] = useState<{ id: string; time: number; label: string }[]>([]);
  const pendingMarkerRef = useRef<{ id: string; time: number; label: string } | null>(null);

  // ── Initialize WASM and wire serial callbacks ──
  useEffect(() => {
    wasmService.init().then(() => {
      const api = wasmService.api as Record<string, unknown>;
      const P = api.SteegParser as new (ch: number, sr: number) => SteegParser;
      setParser(new P(config.channels, config.sampleRate));
    }).catch(console.error);

    const onStatusChange = (svc: typeof serialService | typeof ftdiUsbService) =>
      (s: ConnectionStatus) => {
        setStatus(s);
        if (s === 'connected') {
          setSerial(svc);
          registerConnected(null);
        } else if (s === 'disconnected' || s === 'error') {
          setSerial(null);
          setDeviceId(null);
          deviceIdSeenRef.current = false;
          expectedSerialRef.current = '';
          registerDisconnected();
        }
      };

    serialService.onStatusChange = onStatusChange(serialService);
    ftdiUsbService.onStatusChange = onStatusChange(ftdiUsbService);

    return () => {
      serialService.onStatusChange = () => {};
      ftdiUsbService.onStatusChange = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recreate parser after WASM trap (poisoned WasmRefCell)
  const handleParserError = useCallback(() => {
    if (!wasmService.isInitialized) return;
    const api = wasmService.api as Record<string, unknown>;
    const P = api.SteegParser as new (ch: number, sr: number) => SteegParser;
    console.warn('[App] Recreating SteegParser after crash');
    setParser(new P(config.channels, config.sampleRate));
  }, [config.channels, config.sampleRate]);

  const { stats: deviceStats, latestPackets, latestImpedance } = useEegStream(
    serial, parser, handleParserError,
  );

  const {
    currentWindowStds,
    goodTimeSec,
    goodPercent,
    shouldAutoStop,
  } = useQualityMonitor(latestPackets, isRecording, qualityConfig);

  // After connection: set device ID from WebUSB productName (only if not already set by modal)
  useEffect(() => {
    if (status !== 'connected') return;
    if (deviceIdSeenRef.current) return;   // handleModalConnect already set it
    getAuthorizedFtdiDevices().then(devices => {
      if (deviceIdSeenRef.current) return; // double-check after async gap
      const dev = devices.find(d => d.serialNumber) ?? devices[0];
      if (!dev) return;
      const GENERIC = ['USB Serial', 'USB Serial Port', 'FT232R USB UART', ''];
      const label = GENERIC.includes(dev.productName.trim()) ? dev.serialNumber : dev.productName.trim();
      if (!label) return;
      const id = `STEEG_${label}`;
      setDeviceId(id);
      updateRegistrySteegId(id);
      deviceIdSeenRef.current = true;
    }).catch(() => {});
  }, [status]);

  // Process machineInfo: validate COM port selection and extract device ID
  useEffect(() => {
    for (const pkt of latestPackets) {
      if (!pkt.machineInfo) continue;

      // Normalize: strip STEEG_ prefix to get the raw USB serial (e.g. "AV0KHCQP")
      const rawSerial = pkt.machineInfo.startsWith('STEEG_')
        ? pkt.machineInfo.slice(6)
        : pkt.machineInfo;

      // Validate: if we have an expected serial, confirm the COM port is correct
      if (expectedSerialRef.current) {
        if (rawSerial !== expectedSerialRef.current) {
          // Wrong COM port selected — disconnect immediately
          const badSerial = rawSerial;
          const expectedSerial = expectedSerialRef.current;
          expectedSerialRef.current = '';
          deviceIdSeenRef.current = false;
          setDeviceId(null);
          void serialService.disconnect();
          setTimeout(() => {
            window.alert(
              `⚠️ Wrong COM port!\n\nExpected device serial: ${expectedSerial}\nConnected port serial:  ${badSerial}\n\nPlease disconnect and select the correct COM port.`
            );
          }, 200);
          return;
        }
        expectedSerialRef.current = ''; // validation passed
      }

      // Set device ID from productName (already set by modal), or fallback to machineInfo
      if (!deviceIdSeenRef.current) {
        const id = pkt.machineInfo.startsWith('STEEG_') ? pkt.machineInfo : `STEEG_${pkt.machineInfo}`;
        setDeviceId(id);
        deviceIdSeenRef.current = true;
        updateRegistrySteegId(id);
      }
      return;
    }
  }, [latestPackets]);

  // Recording: collect raw samples each frame
  useEffect(() => {
    if (!isRecording) return;
    for (const pkt of latestPackets) {
      if (!pkt.eegChannels || pkt.eegChannels.length < 8) continue;
      recordTimestampRef.current += 1 / SAMPLE_RATE_HZ;

      // Check for pending event marker (set during this recording session)
      let eventId: string | undefined;
      let eventName: string | undefined;
      if (pendingMarkerRef.current) {
        eventId = pendingMarkerRef.current.id;
        eventName = pendingMarkerRef.current.label;
        pendingMarkerRef.current = null;
      }

      const sample: RecordedSample = {
        timestamp: recordTimestampRef.current,
        serialNumber: pkt.serialNumber,
        channels: new Float32Array(pkt.eegChannels),
        eventId,
        eventName,
      };
      recordSamplesRef.current.push(sample);
    }
    // Update UI count every batch (don't setRecordedSamples on every packet — too slow)
    // Use length for display only
  }, [latestPackets, isRecording]);

  // WASM commands helper
  const getCommands = useCallback((): WasmCommands | null => {
    if (!wasmService.isInitialized) return null;
    return wasmService.api as unknown as WasmCommands;
  }, []);

  // On connect: request machine info then start ADC
  useEffect(() => {
    if (status !== 'connected') return;
    const cmds = getCommands();
    if (!cmds) return;
    const svc = activeServiceRef.current;
    const t = setTimeout(async () => {
      try {
        await svc.write(cmds.cmd_machine_info());
        await new Promise(r => setTimeout(r, 100));
        await svc.write(cmds.cmd_adc_on());
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [status, getCommands, parser]);

  // ── Connection handlers ──
  const handleConnect = useCallback(() => {
    setShowConnectModal(true);
  }, []);

  const handleModalConnect = useCallback(async (
    port: SerialPort | null,
    displayId?: string,
    usbSerial?: string,
  ) => {
    setShowConnectModal(false);
    if (!port) return;
    activeServiceRef.current = serialService;
    if (displayId) {
      setDeviceId(displayId);
      deviceIdSeenRef.current = true;
      updateRegistrySteegId(displayId);
    }
    if (usbSerial) {
      expectedSerialRef.current = usbSerial;
    }
    try {
      await serialService.connectToPort(port, { baudRate: config.baudRate });
    } catch (e) {
      console.error('Connect failed:', e);
    }
  }, [config.baudRate]);

  /** Android / WebUSB path: connect directly via raw FTDI USB driver */
  const handleModalConnectUsb = useCallback(async (
    device: UsbDeviceLike,
    displayId: string,
  ) => {
    setShowConnectModal(false);
    activeServiceRef.current = ftdiUsbService;
    if (displayId) {
      setDeviceId(displayId);
      deviceIdSeenRef.current = true;
      updateRegistrySteegId(displayId);
    }
    try {
      await ftdiUsbService.connectToDevice(device, config.baudRate);
    } catch (e) {
      console.error('FTDI USB connect failed:', e);
    }
  }, [config.baudRate]);

  const handleDisconnect = useCallback(async () => {
    const svc = activeServiceRef.current;
    try {
      if (impedanceModeActiveRef.current) {
        const cmds = getCommands();
        if (cmds) await svc.write(cmds.cmd_impedance_ac_off());
        impedanceModeActiveRef.current = false;
      }
      await svc.disconnect();
    } catch { /* ignore */ }
  }, [getCommands]);

  // ── Impedance handlers ──
  const handleEnterImpedance = useCallback(async () => {
    if (isRecording) return;
    const cmds = getCommands();
    if (!serial || !cmds) return;
    impedanceModeActiveRef.current = true;
    setIsImpedanceActive(true);
    await serial.write(cmds.cmd_impedance_ac_on('reference'));
    parser?.enable_impedance(config.impedanceWindow, config.sampleRate);
  }, [isRecording, serial, getCommands, parser, config.impedanceWindow, config.sampleRate]);

  const handleExitImpedance = useCallback(async () => {
    const cmds = getCommands();
    if (!serial || !cmds) return;
    await serial.write(cmds.cmd_impedance_ac_off());
    impedanceModeActiveRef.current = false;
    setIsImpedanceActive(false);
    parser?.disable_impedance?.();
    setTimeout(async () => {
      try {
        if (serial.isConnected) await serial.write(cmds.cmd_adc_on());
      } catch { /* ignore */ }
    }, 100);
  }, [serial, getCommands, parser]);

  // ── Recording handlers ──
  const handleStartRecording = useCallback(() => {
    recordSamplesRef.current = [];
    recordTimestampRef.current = 0;
    const now = new Date();
    setRecordStartTime(now);
    setRecordedSamples([]);
    setIsRecording(true);
  }, []);

  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
    setRecordedSamples([...recordSamplesRef.current]);
  }, []);

  // Periodically sync recordedSamples length for display (every 2s)
  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      setRecordedSamples([...recordSamplesRef.current]);
    }, 2000);
    return () => clearInterval(id);
  }, [isRecording]);

  // Auto-stop recording when quality monitor signals target reached
  // (RecordView also calls onStopRecording, but we guard here too)
  const autoStopFiredRef = useRef(false);
  useEffect(() => {
    if (!isRecording) {
      autoStopFiredRef.current = false;
      return;
    }
    if (shouldAutoStop && !autoStopFiredRef.current) {
      autoStopFiredRef.current = true;
      handleStopRecording();
    }
  }, [shouldAutoStop, isRecording, handleStopRecording]);

  // ── Event marker handler (from waveform OR record views) ──
  const handleEventMarker = useCallback((marker: { id: string; time: number; label: string }) => {
    setEventMarkers(prev => [...prev, marker]);
    if (isRecording) {
      pendingMarkerRef.current = marker;
    }
  }, [isRecording]);

  // Keyboard M key for event markers (global, when recording)
  useEffect(() => {
    if (!isRecording) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        handleEventMarker({
          id: Math.random().toString(36).substring(2, 9),
          time: Date.now(),
          label: `M${eventMarkers.length + 1}`,
        });
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isRecording, handleEventMarker, eventMarkers.length]);

  const isConnected = status === 'connected';

  // Page switching guards
  const handlePageChange = (page: PageType) => {
    if (page === 'signal' && !isConnected) return;
    if (page === 'signal' && isImpedanceActive) return;
    setActivePage(page);
    // Keep activeTab in sync for any internal logic that still references it
    if (page === 'signal')   setActiveTab('signal');
    if (page === 'training') setActiveTab('training');
    if (page === 'ci')       setActiveTab('home');
  };

  // Tab switching guards (kept for backward compat / internal callers)
  const handleTabChange = (tab: TabType) => {
    const restricted = ['impedance', 'signal', 'fft', 'record'] as TabType[];
    if (restricted.includes(tab) && !isConnected) return;
    if (tab === 'impedance' && isRecording) return;
    if (tab === 'signal' && isImpedanceActive) return;
    setActiveTab(tab);
  };
  void handleTabChange; // suppress unused-var lint

  // ── Shared column style for CI 3-column page ──
  const ciColStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
  };

  return (
    <div className="app-container">
      <Header
        lang={lang}
        onLangToggle={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
        activePage={activePage}
        onPageChange={handlePageChange}
      />
      <SessionBanner
        lang={lang}
        status={status}
        isRecording={isRecording}
        deviceId={deviceId}
        packetRate={deviceStats.packetRate}
        elapsed={isRecording && recordStartTime ? Date.now() - recordStartTime.getTime() : 0}
        samplesCount={recordedSamples.length}
        goodTimeSec={goodTimeSec}
        goodPercent={goodPercent}
        targetDurationSec={qualityConfig.targetDurationSec}
        trainingStats={trainingStats}
      />
      <div className="main-layout">

        {/* ── CI page: Col A (connect+impedance) + Col B+C (record split) ── */}
        {activePage === 'ci' && (
          <div style={{
            display: 'flex',
            flex: 1,
            gap: '1px',
            background: 'var(--border)',
            overflow: 'hidden',
          }}>
            {/* Col A: Connect + Impedance (grows) + Instructions (pinned bottom) */}
            <div style={{
              flex: 1,
              minWidth: 0,
              background: 'var(--bg)',
              overflow: 'hidden',
              padding: '.6rem .55rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
              minHeight: 0,
            }}>
              {/* Section title */}
              <div style={{
                fontSize: '.6rem', letterSpacing: '.15em', textTransform: 'uppercase',
                color: 'var(--cream)', marginBottom: '.44rem',
                paddingBottom: '.24rem', borderBottom: '1px solid rgba(178,168,198,.1)',
                display: 'flex', alignItems: 'center', gap: '.32rem', flexShrink: 0,
              }}>
                <span style={{ fontFamily: "'Crimson Pro','Georgia',serif", fontStyle: 'italic', fontSize: '.88rem', color: 'var(--plum)', lineHeight: 1 }}>⊙</span>
                <span>{lang === 'zh' ? '裝置連接' : 'Device Connection'}</span>
              </div>
              {/* Connect card (no instructions) */}
              <HomeView
                status={status}
                stats={deviceStats}
                deviceId={deviceId}
                lang={lang}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                hideInstructions={true}
              />
              {/* Impedance card — grows to fill remaining space */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: '.38rem' }}>
                <ImpedanceView
                  impedanceResults={latestImpedance ?? undefined}
                  isConnected={isConnected}
                  isRecording={isRecording}
                  lang={lang}
                  onEnterImpedanceMode={handleEnterImpedance}
                  onExitImpedanceMode={handleExitImpedance}
                />
              </div>
              {/* Instructions + notes — pinned to bottom */}
              <div style={{ flexShrink: 0, marginTop: 'auto' }}>
                <div style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 2, padding: '.6rem .65rem', marginBottom: '.3rem',
                }}>
                  <div style={{
                    fontSize: '.6rem', letterSpacing: '.15em', textTransform: 'uppercase',
                    color: 'var(--cream)', marginBottom: '.34rem',
                    paddingBottom: '.22rem', borderBottom: '1px solid rgba(178,168,198,.1)',
                    display: 'flex', alignItems: 'center', gap: '.32rem',
                  }}>
                    <span style={{ fontFamily: "'Crimson Pro','Georgia',serif", fontStyle: 'italic', fontSize: '.88rem', color: 'var(--plum)', lineHeight: 1 }}>→</span>
                    <span>{T(lang, 'homeInstructions')}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.38rem' }}>
                    {[T(lang, 'homeStep1'), T(lang, 'homeStep2'), T(lang, 'homeStep3')].map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: '.52rem', alignItems: 'flex-start', fontSize: '.68rem', color: 'var(--text)', lineHeight: 1.52 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          border: '1px solid rgba(120,152,200,.35)', color: 'var(--teal)',
                          fontSize: '.52rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: '.1rem',
                        }}>{i + 1}</div>
                        <span>{step.replace(/^\d+\.\s*/, '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: '.54rem', color: 'var(--muted)', lineHeight: 1.6, background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 1, padding: '.36rem .44rem' }}>
                  {T(lang, 'homeRequiresSerial')}
                </div>
              </div>
            </div>

            {/* Col B + C: RecordView in split layout */}
            <RecordView
              layout="split"
              lang={lang}
              isConnected={isConnected}
              isRecording={isRecording}
              subjectInfo={subjectInfo}
              onSubjectInfoChange={setSubjectInfo}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
              recordedSamples={recordedSamples}
              deviceId={deviceId}
              filterDesc={computeFilterDesc(filterParams)}
              notchDesc={computeNotchDesc(filterParams)}
              startTime={recordStartTime}
              onEventMarker={handleEventMarker}
              eventMarkers={eventMarkers}
              qualityConfig={qualityConfig}
              onQualityConfigChange={setQualityConfig}
              currentWindowStds={currentWindowStds}
              goodTimeSec={goodTimeSec}
              goodPercent={goodPercent}
              shouldAutoStop={shouldAutoStop}
            />
          </div>
        )}

        {/* ── Signal+FFT page ── */}
        {activePage === 'signal' && (
          <div style={{ display: 'flex', flex: 1, gap: '1px', background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ flex: 2, minWidth: 0, overflow: 'hidden', background: 'var(--bg)' }}>
              <WaveformView
                packets={latestPackets}
                filterParams={filterParams}
                filterBiquadRef={filterBiquadRef}
                onFilterChange={handleFilterChange}
                lang={lang}
                isRecording={isRecording}
                onEventMarker={handleEventMarker}
                eventMarkers={eventMarkers}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', background: 'var(--bg)' }}>
              <FftView
                packets={latestPackets}
                filterParams={filterParams}
                filterBiquadRef={filterBiquadRef}
                lang={lang}
              />
            </div>
          </div>
        )}

        {/* ── Training page (always mounted) ── */}
        <div style={{
          display: activePage === 'training' ? 'flex' : 'none',
          flex: 1,
          overflow: 'hidden',
        }}>
          <TrainingView
            packets={isConnected ? latestPackets : undefined}
            filterParams={filterParams}
            hidden={activePage !== 'training'}
            lang={lang}
            onSessionTick={setTrainingStats}
          />
        </div>
      </div>

      {/* Recording badge on signal/training pages */}
      {isRecording && activePage !== 'ci' && (
        <div style={{
          position: 'fixed', bottom: 14, right: 14,
          background: 'rgba(176,112,112,0.12)',
          border: '1px solid rgba(176,112,112,0.35)',
          borderRadius: 2,
          padding: '.3rem .7rem',
          display: 'flex', alignItems: 'center', gap: '.3rem',
          zIndex: 100,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--rose)', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: '.6rem', color: 'var(--rose)', letterSpacing: '.06em' }}>
            {T(lang, 'signalRecording')} · {recordedSamples.length.toLocaleString()}
          </span>
        </div>
      )}

      {/* Connect Modal */}
      {showConnectModal && (
        <ConnectModal
          lang={lang}
          onConnect={(port, displayId, usbSerial) => handleModalConnect(port, displayId, usbSerial)}
          onConnectUsb={(device, displayId) => handleModalConnectUsb(device, displayId)}
          onClose={() => setShowConnectModal(false)}
        />
      )}
    </div>
  );
}

export default App;
