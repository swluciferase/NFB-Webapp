import { useEffect, useRef, useState, type FC, type CSSProperties } from 'react';
import type { SubjectInfo } from '../../types/eeg';
import { CHANNEL_LABELS, CHANNEL_COUNT } from '../../types/eeg';
import type { RecordedSample } from '../../services/csvWriter';
import { generateCsv, downloadCsv, buildCsvFilename } from '../../services/csvWriter';
import type { Lang } from '../../i18n';
import { T } from '../../i18n';
import type { QualityConfig } from '../../hooks/useQualityMonitor';
import { analyzeEeg, SAMPLE_RATE } from '../../services/eegReport';
import { type RppgResults } from '../../services/reportPdf';
import { openHtmlReport } from '../../services/eegReportHtml';
import { parseCsv } from '../../services/csvParser';

const VISIOMYND_URL = 'https://rppg-web.pages.dev';
const RPPG_CHANNEL  = 'sgimacog_rppg_sync';

export interface RecordViewProps {
  lang: Lang;
  isConnected: boolean;
  isRecording: boolean;
  subjectInfo: SubjectInfo;
  onSubjectInfoChange: (info: SubjectInfo) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  recordedSamples: RecordedSample[];
  deviceId: string | null;
  filterDesc: string;
  notchDesc: string;
  startTime: Date | null;
  onEventMarker: (marker: { id: string; time: number; label: string }) => void;
  eventMarkers: { id: string; time: number; label: string }[];
  // Quality monitor props
  qualityConfig: QualityConfig;
  onQualityConfigChange: (config: QualityConfig) => void;
  currentWindowStds: Float32Array;
  goodTimeSec: number;
  goodPercent: number;
  shouldAutoStop: boolean;
  /** When 'split', render as two side-by-side columns (B=settings, C=controls) for CI page */
  layout?: 'split';
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const p2 = (n: number) => n.toString().padStart(2, '0');
  const p3 = (n: number) => n.toString().padStart(3, '0');
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(d.getMilliseconds())}`;
}

const TARGET_DURATION_OPTIONS = [
  { value: 30,       label: '30'  },
  { value: 60,       label: '60'  },
  { value: 90,       label: '90'  },
  { value: 120,      label: '120' },
  { value: 150,      label: '150' },
  { value: 180,      label: '180' },
  { value: 300,      label: '300' },
  { value: Infinity, label: ''    },
];

function formatGoodTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const RecordView: FC<RecordViewProps> = ({
  lang,
  isConnected,
  isRecording,
  subjectInfo,
  onSubjectInfoChange,
  onStartRecording,
  onStopRecording,
  recordedSamples,
  deviceId,
  filterDesc,
  notchDesc,
  startTime,
  onEventMarker,
  eventMarkers,
  qualityConfig,
  onQualityConfigChange,
  currentWindowStds,
  goodTimeSec,
  goodPercent,
  shouldAutoStop,
  layout,
}) => {
  const [elapsed, setElapsed] = useState(0);
  const [reportStatus, setReportStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle');
  const [useArtifactRemoval, setUseArtifactRemoval] = useState(false);
  const [enableRppg, setEnableRppg] = useState(false);
  const [rppgResults, setRppgResults] = useState<RppgResults | null>(null);
  const [fileStatus, setFileStatus] = useState<'idle' | 'parsing' | 'analyzing' | 'done' | 'error'>('idle');
  const [fileStatusMsg, setFileStatusMsg] = useState('');
  const [fileDob, setFileDob] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSex, setFileSex] = useState<'M' | 'F' | 'Other' | ''>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStoppedRef = useRef(false);
  const rppgChannelRef = useRef<BroadcastChannel | null>(null);

  // ── rPPG BroadcastChannel setup ─────────────────────────────────────────
  useEffect(() => {
    const ch = new BroadcastChannel(RPPG_CHANNEL);
    rppgChannelRef.current = ch;
    ch.onmessage = (ev) => {
      if (ev.data?.type === 'rppg_done') {
        setRppgResults(ev.data.results as RppgResults);
      }
    };
    return () => { ch.close(); rppgChannelRef.current = null; };
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        if (startTime) {
          setElapsed(Date.now() - startTime.getTime());
        }
      }, 500);
    } else {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [isRecording, startTime]);

  // Open VisioMynd in a new tab with subject info pre-filled
  const openVisioMynd = () => {
    const params = new URLSearchParams();
    if (subjectInfo.name) params.set('name', subjectInfo.name);
    if (subjectInfo.dob)  params.set('dob',  subjectInfo.dob);
    if (subjectInfo.sex)  params.set('sex',  subjectInfo.sex);
    if (subjectInfo.id)   params.set('id',   subjectInfo.id);
    window.open(`${VISIOMYND_URL}?${params.toString()}`, 'visiomynd_rppg');
    // Also broadcast subject info for tabs already open
    rppgChannelRef.current?.postMessage({ type: 'sgimacog_init', subject: subjectInfo });
  };

  const broadcastEegDone = () => {
    rppgChannelRef.current?.postMessage({ type: 'eeg_done' });
  };

  const handleStop = () => {
    broadcastEegDone();
    onStopRecording();
    if (recordedSamples.length > 0 && startTime) {
      const content = generateCsv(
        recordedSamples,
        startTime,
        deviceId ?? 'STEEG_UNKNOWN',
        filterDesc,
        notchDesc,
      );
      const filename = buildCsvFilename(subjectInfo.id || 'recording', startTime);
      downloadCsv(content, filename);
    }
  };

  // Plain stop — no download
  const handleStopOnly = () => {
    broadcastEegDone();
    onStopRecording();
  };

  const handleStopAndReport = async () => {
    const durationSec = recordedSamples.length / SAMPLE_RATE;
    if (durationSec < 90) {
      alert(T(lang, 'recordReportTooShort'));
      return;
    }
    // Stop recording and download CSV first
    onStopRecording();
    if (recordedSamples.length > 0 && startTime) {
      const content = generateCsv(
        recordedSamples,
        startTime,
        deviceId ?? 'STEEG_UNKNOWN',
        filterDesc,
        notchDesc,
      );
      const filename = buildCsvFilename(subjectInfo.id || 'recording', startTime);
      downloadCsv(content, filename);
    }
    // Run EEG analysis asynchronously
    broadcastEegDone();
    setReportStatus('analyzing');
    try {
      const result = await analyzeEeg(recordedSamples, subjectInfo.dob ?? '', useArtifactRemoval);
      if (result.error) {
        alert(`${T(lang, 'recordReportError')}: ${result.error}`);
        setReportStatus('error');
        return;
      }
      await openHtmlReport(result, subjectInfo, startTime, deviceId, rppgResults ?? undefined);
      setReportStatus('done');
    } catch (err) {
      console.error('Report generation error:', err);
      alert(T(lang, 'recordReportError'));
      setReportStatus('error');
    }
  };

  const handleFileReport = async (file: File) => {
    setFileStatus('parsing');
    setFileStatusMsg('');
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.error || parsed.samples.length === 0) {
        setFileStatus('error');
        setFileStatusMsg(T(lang, 'recordFromFileErrParse') + (parsed.error ? ` (${parsed.error})` : ''));
        return;
      }
      const dur = parsed.samples.length / SAMPLE_RATE;
      if (dur < 90) {
        setFileStatus('error');
        setFileStatusMsg(T(lang, 'recordFromFileErrShort') + ` (${dur.toFixed(1)} s)`);
        return;
      }
      setFileStatus('analyzing');
      let result;
      try {
        result = await analyzeEeg(parsed.samples, fileDob || subjectInfo.dob || '', useArtifactRemoval);
      } catch (wasmErr) {
        console.error('analyzeEeg threw:', wasmErr);
        setFileStatus('error');
        setFileStatusMsg(`WASM 分析錯誤: ${wasmErr instanceof Error ? wasmErr.message : String(wasmErr)}`);
        return;
      }
      if (result.error) {
        setFileStatus('error');
        setFileStatusMsg(T(lang, 'recordFromFileErrAnalysis') + `: ${result.error}`);
        return;
      }
      // Build SubjectInfo using the file-section UI fields
      const fileSubject = {
        ...subjectInfo,
        ...(fileName ? { name: fileName } : {}),
        ...(fileSex   ? { sex: fileSex }  : {}),
      };
      try {
        await openHtmlReport(result, fileSubject, parsed.recordDatetime ? new Date(parsed.recordDatetime) : null, parsed.deviceId || deviceId);
      } catch (reportErr) {
        console.error('openHtmlReport threw:', reportErr);
        setFileStatus('error');
        setFileStatusMsg(`報告生成錯誤: ${reportErr instanceof Error ? reportErr.message : String(reportErr)}`);
        return;
      }
      setFileStatus('done');
      setFileStatusMsg(
        `${T(lang, 'recordFromFileSamples')}: ${parsed.samples.length.toLocaleString()}  |  ${T(lang, 'recordFromFileDuration')}: ${Math.floor(dur / 60)}m ${Math.floor(dur % 60)}s`,
      );
    } catch (err) {
      console.error('File report error:', err);
      setFileStatus('error');
      setFileStatusMsg(`${T(lang, 'recordFromFileErrAnalysis')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Auto-stop when quality target is reached — also downloads CSV
  const onStopRecordingRef = useRef(onStopRecording);
  onStopRecordingRef.current = onStopRecording;
  const handleStopRef = useRef(handleStop);
  handleStopRef.current = handleStop;
  useEffect(() => {
    if (!isRecording) {
      autoStoppedRef.current = false;
      return;
    }
    if (shouldAutoStop && !autoStoppedRef.current) {
      autoStoppedRef.current = true;
      handleStopRef.current();
    }
  }, [shouldAutoStop, isRecording]);

  const addMarker = () => {
    const id = Math.random().toString(36).substring(2, 9);
    const time = Date.now();
    const label = `M${eventMarkers.length + 1}`;
    onEventMarker({ id, time, label });
  };



  // ── column style shared across both split-layout cols ──
  const colStyle: CSSProperties = {
    background: 'var(--bg)',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '.6rem .55rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  };

  // ── card / input shared styles ──
  const cardStyle: CSSProperties = {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 2,
    padding: '.6rem .65rem',
    marginBottom: '.4rem',
    flexShrink: 0,
  };
  const inputStyle: CSSProperties = {
    background: 'var(--bg4)',
    border: '1px solid var(--dim)',
    borderRadius: 1,
    color: 'var(--cream)',
    fontSize: '.72rem',
    padding: '.25rem .38rem',
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
  };
  const lblStyle: CSSProperties = {
    fontSize: '.68rem',
    color: 'var(--text)',
    marginBottom: '.2rem',
    letterSpacing: '.04em',
    display: 'block',
  };
  const stitle = (glyph: string, text: string) => (
    <div style={{
      fontSize: '.6rem', letterSpacing: '.15em', textTransform: 'uppercase',
      color: 'var(--cream)', marginBottom: '.44rem',
      paddingBottom: '.24rem', borderBottom: '1px solid rgba(178,168,198,.1)',
      display: 'flex', alignItems: 'center', gap: '.32rem', flexShrink: 0,
    }}>
      <span style={{ fontFamily: "'Crimson Pro','Georgia',serif", fontStyle: 'italic', fontSize: '.88rem', color: 'var(--plum)', lineHeight: 1 }}>{glyph}</span>
      <span>{text}</span>
    </div>
  );

  // ════════════════════════════════════════
  // SETTINGS SECTION (Col B in split mode)
  // ════════════════════════════════════════
  const settingsSection = (
    <>
      {stitle('∫', T(lang, 'recordTitle'))}

      {/* Subject info card */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.32rem', marginBottom: '.32rem' }}>
          <div>
            <label style={lblStyle}>{T(lang, 'recordSubjectId')}</label>
            <input type="text" value={subjectInfo.id}
              onChange={e => onSubjectInfoChange({ ...subjectInfo, id: e.target.value })}
              disabled={isRecording} style={inputStyle} placeholder="S-001" />
          </div>
          <div>
            <label style={lblStyle}>{T(lang, 'recordSubjectName')}</label>
            <input type="text" value={subjectInfo.name}
              onChange={e => onSubjectInfoChange({ ...subjectInfo, name: e.target.value })}
              disabled={isRecording} style={inputStyle} />
          </div>
          <div>
            <label style={lblStyle}>{T(lang, 'recordDob')}</label>
            <input type="date" lang="en" value={subjectInfo.dob}
              onChange={e => onSubjectInfoChange({ ...subjectInfo, dob: e.target.value })}
              disabled={isRecording} style={inputStyle} />
          </div>
          <div>
            <label style={lblStyle}>{T(lang, 'recordSex')}</label>
            <select value={subjectInfo.sex}
              onChange={e => onSubjectInfoChange({ ...subjectInfo, sex: e.target.value as SubjectInfo['sex'] })}
              disabled={isRecording} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">--</option>
              <option value="M">{T(lang, 'recordSexMale')}</option>
              <option value="F">{T(lang, 'recordSexFemale')}</option>
              <option value="Other">{T(lang, 'recordSexOther')}</option>
            </select>
          </div>
        </div>
        <div>
          <label style={lblStyle}>{T(lang, 'recordNotes')}</label>
          <textarea value={subjectInfo.notes}
            onChange={e => onSubjectInfoChange({ ...subjectInfo, notes: e.target.value })}
            disabled={isRecording} rows={2}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 44, lineHeight: 1.55 }} />
        </div>
        {/* CSV report row */}
        <hr style={{ border: 'none', borderTop: '1px solid rgba(178,168,198,.07)', margin: '.28rem 0' }} />
        <div style={{ fontSize: '.48rem', color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '.28rem' }}>
          {T(lang, 'recordFromFile')}
        </div>
        <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileReport(f); e.target.value = ''; }} />
          <div style={{
            flex: 1, padding: '.22rem .4rem', border: '1px dashed var(--dim)', borderRadius: 1,
            fontSize: '.56rem', color: 'var(--muted)', cursor: 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
            onClick={() => fileInputRef.current?.click()}>
            {T(lang, 'recordFromFileParsing') === fileStatusMsg && fileStatus === 'parsing'
              ? T(lang, 'recordFromFileParsing')
              : T(lang, 'recordFromFile')}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={fileStatus === 'parsing' || fileStatus === 'analyzing'}
            style={{
              padding: '.22rem .55rem', border: '1px solid var(--border)', borderRadius: 1,
              background: 'transparent', color: 'var(--mauve)', fontSize: '.54rem',
              cursor: (fileStatus === 'parsing' || fileStatus === 'analyzing') ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', whiteSpace: 'nowrap', letterSpacing: '.04em',
              opacity: (fileStatus === 'parsing' || fileStatus === 'analyzing') ? 0.5 : 1,
            }}>
            {fileStatus === 'analyzing' ? '…' : T(lang, 'recordFromFile').split('').slice(0, 4).join('')}
          </button>
        </div>
        {fileStatus !== 'idle' && (
          <div style={{ fontSize: '.54rem', marginTop: '.2rem', color: fileStatus === 'done' ? 'var(--green)' : fileStatus === 'error' ? 'var(--red)' : 'var(--muted)' }}>
            {fileStatus === 'done' ? `✓ ${fileStatusMsg}` : fileStatus === 'error' ? `✗ ${fileStatusMsg}` : fileStatusMsg || '…'}
          </div>
        )}
      </div>

      {/* Filter · VisioMynd card */}
      <div style={cardStyle}>
        {stitle('⌗', lang === 'zh' ? '濾波 · VisioMynd' : 'Filter · VisioMynd')}
        <div style={{ display: 'flex', gap: 3, marginBottom: '.32rem' }}>
          {[
            { l: T(lang, 'signalBandpass'), v: filterDesc, c: 'var(--teal)' },
            { l: T(lang, 'signalNotch'),    v: notchDesc,  c: 'var(--amber)' },
            { l: T(lang, 'recordArtifactRemoval'), v: useArtifactRemoval ? 'On' : 'Off', c: useArtifactRemoval ? 'var(--green)' : 'var(--muted)' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ flex: 1, background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 1, padding: '.3rem .38rem', textAlign: 'center' }}>
              <div style={{ fontSize: '.54rem', color: 'var(--text)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '.14rem' }}>{l}</div>
              <div style={{ fontSize: '.66rem', color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.42rem', marginBottom: '.3rem' }}>
          <div style={{
            width: 25, height: 12, background: enableRppg ? 'rgba(152,136,168,.3)' : 'rgba(255,255,255,.05)',
            borderRadius: 6, border: `1px solid ${enableRppg ? 'rgba(152,136,168,.3)' : 'var(--border)'}`,
            position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .2s',
          }} onClick={() => { if (!isRecording) setEnableRppg(e => !e); }}>
            <div style={{
              position: 'absolute', width: 6, height: 6, borderRadius: '50%',
              background: enableRppg ? 'var(--mauve)' : 'var(--muted)',
              top: 2, left: enableRppg ? 15 : 2, transition: 'left .18s, background .18s',
            }} />
          </div>
          <span style={{ fontSize: '.7rem', color: 'var(--cream)' }}>{lang === 'zh' ? '同步 VisioMynd 心率結果至報告' : 'Include VisioMynd HRV in report'}</span>
        </div>
        <button onClick={openVisioMynd} style={{
          width: '100%', padding: '.28rem 0', border: '1px solid var(--border)', borderRadius: 1,
          background: 'transparent', color: 'var(--mauve)', fontSize: '.58rem', cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: '.04em',
        }}>
          {lang === 'zh' ? '↗ 開啟 VisioMynd（帶入受試者資訊）' : '↗ Open VisioMynd (pre-fill subject)'}
        </button>
      </div>

      {/* Recording settings card (CCA + target duration + sensitivity) */}
      <div style={cardStyle}>
        {stitle('⌾', T(lang, 'recordQualityGrid'))}
        {/* Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: qualityConfig.enabled ? '.36rem' : 0 }}>
          <div style={{ fontSize: '.6rem', color: 'var(--cream)', letterSpacing: '.04em' }}>{lang === 'zh' ? '品質監控' : 'Quality Monitor'}</div>
          <button onClick={() => onQualityConfigChange({ ...qualityConfig, enabled: !qualityConfig.enabled })}
            style={{
              padding: '.14rem .48rem', border: `1px solid ${qualityConfig.enabled ? 'rgba(106,170,128,.5)' : 'rgba(94,88,112,.4)'}`,
              borderRadius: 1, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '.5rem', letterSpacing: '.1em',
              color: qualityConfig.enabled ? 'var(--green)' : 'var(--muted)',
            }}>
            {qualityConfig.enabled ? T(lang, 'recordQualityEnabled') : T(lang, 'recordQualityDisabled')}
          </button>
        </div>

        {qualityConfig.enabled && (<>
          {/* Row: Target duration + CCA on same row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.34rem' }}>
            <label style={{ ...lblStyle, margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {T(lang, 'recordTargetDuration')}
            </label>
            <input type="range" min={0} max={TARGET_DURATION_OPTIONS.length - 1} step={1}
              value={(() => { const i = TARGET_DURATION_OPTIONS.findIndex(o => o.value === qualityConfig.targetDurationSec); return i >= 0 ? i : 2; })()}
              onChange={e => { const o = TARGET_DURATION_OPTIONS[Number(e.target.value)]; if (o) onQualityConfigChange({ ...qualityConfig, targetDurationSec: o.value }); }}
              disabled={isRecording} style={{ flex: 1, cursor: isRecording ? 'not-allowed' : 'pointer', accentColor: 'var(--mauve)' }} />
            <span style={{ fontSize: '.72rem', color: 'var(--mauve)', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
              {isFinite(qualityConfig.targetDurationSec) ? `${qualityConfig.targetDurationSec}s` : T(lang, 'recordDurationManual')}
            </span>
            <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
            {/* CCA toggle on same row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.38rem', flexShrink: 0 }}>
              <div style={{
                width: 25, height: 12, background: useArtifactRemoval ? 'rgba(152,136,168,.3)' : 'rgba(255,255,255,.05)',
                borderRadius: 6, border: `1px solid ${useArtifactRemoval ? 'rgba(152,136,168,.3)' : 'var(--border)'}`,
                position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .2s',
              }} onClick={() => setUseArtifactRemoval(v => !v)}>
                <div style={{
                  position: 'absolute', width: 6, height: 6, borderRadius: '50%',
                  background: useArtifactRemoval ? 'var(--mauve)' : 'var(--muted)',
                  top: 2, left: useArtifactRemoval ? 15 : 2, transition: 'left .18s, background .18s',
                }} />
              </div>
              <span style={{ fontSize: '.7rem', color: 'var(--cream)', whiteSpace: 'nowrap' }}>
                {lang === 'zh' ? '去雜訊 CCA' : 'CCA'}
              </span>
            </div>
          </div>

          {/* Row: Sensitivity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.38rem', marginBottom: '.36rem' }}>
            <label style={{ ...lblStyle, margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {T(lang, 'recordSensitivity')}
            </label>
            <div style={{ display: 'flex', gap: '.2rem', flex: 1 }}>
              {([1, 2, 3, 4, 5] as const).map(level => (
                <button key={level}
                  onClick={() => onQualityConfigChange({ ...qualityConfig, sensitivity: level })}
                  style={{
                    flex: 1, padding: '.22rem 0', fontSize: '.64rem', fontWeight: 600,
                    border: `1px solid ${qualityConfig.sensitivity === level ? 'rgba(152,136,168,.5)' : 'var(--border)'}`,
                    borderRadius: 1,
                    background: qualityConfig.sensitivity === level ? 'rgba(152,136,168,.08)' : 'transparent',
                    color: qualityConfig.sensitivity === level ? 'var(--mauve)' : 'var(--text)',
                    cursor: 'pointer',
                  }}>
                  {level}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '.56rem', color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {T(lang, 'recordSensitivityLenient')} → {T(lang, 'recordSensitivityStrict')}
            </span>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 3, marginBottom: '.36rem' }}>
            {[
              { l: lang === 'zh' ? '時長' : 'Dur', v: isRecording ? (() => { const s = Math.floor((Date.now() - (startTime?.getTime() ?? Date.now())) / 1000); return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; })() : '--:--' },
              { l: lang === 'zh' ? '樣本' : 'Samp', v: recordedSamples.length > 999 ? `${Math.floor(recordedSamples.length/1000)}k` : (recordedSamples.length > 0 ? String(recordedSamples.length) : '--'), c: 'var(--teal)' },
              { l: lang === 'zh' ? '有效' : 'Good', v: isRecording ? `${Math.floor(goodTimeSec/60).toString().padStart(2,'0')}:${Math.floor(goodTimeSec%60).toString().padStart(2,'0')}` : '--:--', c: 'var(--green)' },
              { l: lang === 'zh' ? '品質%' : 'Qual%', v: isRecording ? `${goodPercent}%` : '--', c: goodPercent >= 80 ? 'var(--green)' : goodPercent >= 50 ? 'var(--amber)' : 'var(--text)' },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ flex: 1, background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 1, padding: '.3rem .34rem', textAlign: 'center' }}>
                <div style={{ fontSize: '.54rem', color: 'var(--text)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '.12rem' }}>{l}</div>
                <div style={{ fontSize: '.78rem', color: c ?? 'var(--cream)' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* 8-channel quality grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginBottom: '.36rem' }}>
            {Array.from({ length: CHANNEL_COUNT }, (_, ch) => {
              const std = currentWindowStds[ch] ?? 0;
              const thresholds = [200, 150, 100, 60, 30];
              const threshold = thresholds[(qualityConfig.sensitivity - 1)] ?? 100;
              const color = std < threshold ? 'var(--green)' : std < threshold * 1.5 ? 'var(--amber)' : 'var(--red)';
              return (
                <div key={ch} style={{
                  background: 'var(--bg4)', border: `1px solid ${color}44`,
                  borderRadius: 1, padding: '.28rem .3rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '.58rem', color: 'var(--text)', marginBottom: '.1rem' }}>{CHANNEL_LABELS[ch]}</div>
                  <div style={{ fontSize: '.64rem', color, fontVariantNumeric: 'tabular-nums' }}>
                    {isRecording ? std.toFixed(0) : '--'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          {isRecording && isFinite(qualityConfig.targetDurationSec) && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.6rem', marginBottom: '.2rem' }}>
                <span style={{ color: 'var(--text)' }}>{T(lang, 'recordGoodTime')}</span>
                <span style={{ color: 'var(--green)' }}>
                  {`${Math.floor(goodTimeSec/60).toString().padStart(2,'0')}:${Math.floor(goodTimeSec%60).toString().padStart(2,'0')}`}
                  {' / '}
                  {`${Math.floor(qualityConfig.targetDurationSec/60).toString().padStart(2,'0')}:${Math.floor(qualityConfig.targetDurationSec%60).toString().padStart(2,'0')}`}
                </span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (goodTimeSec / qualityConfig.targetDurationSec) * 100)}%`,
                  background: 'linear-gradient(90deg, var(--green), #85e89d)',
                  borderRadius: 2, transition: 'width .5s',
                }} />
              </div>
            </div>
          )}
        </>)}
      </div>
    </>
  );

  // ════════════════════════════════════════
  // CONTROLS SECTION (Col C in split mode)
  // ════════════════════════════════════════
  const controlsSection = (
    <>
      {stitle('◉', lang === 'zh' ? '錄製 · 標記' : 'Record · Markers')}

      {/* Recording controls card */}
      <div style={{
        ...cardStyle,
        borderColor: isRecording ? 'rgba(248,81,73,.28)' : 'var(--border)',
        transition: 'border-color .3s',
        padding: '.55rem .6rem',
      }}>
        {/* Status pill + rPPG toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.42rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '.35rem',
            padding: '.25rem .5rem', borderRadius: 1,
            border: `1px solid ${isRecording ? 'rgba(192,112,112,.4)' : 'var(--border)'}`,
            background: isRecording ? 'rgba(192,112,112,.08)' : 'transparent',
            fontSize: '.62rem', color: isRecording ? 'var(--red)' : 'var(--muted)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 4, height: 4, borderRadius: '50%', background: 'currentColor',
              animation: isRecording ? 'pulse .8s infinite' : 'none',
            }} />
            {isRecording
              ? `${T(lang, 'signalRecording')} · ${formatDuration(elapsed)}`
              : (isConnected ? T(lang, 'recordStart') : T(lang, 'recordNotConnected'))}
          </div>
          <div style={{ flex: 1 }} />
          {/* rPPG sync toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.38rem', flexShrink: 0 }}>
            <div style={{
              width: 25, height: 12, background: enableRppg ? 'rgba(152,136,168,.3)' : 'rgba(255,255,255,.05)',
              borderRadius: 6, border: `1px solid ${enableRppg ? 'rgba(152,136,168,.3)' : 'var(--border)'}`,
              position: 'relative', cursor: isRecording ? 'not-allowed' : 'pointer', flexShrink: 0,
              transition: 'background .2s', opacity: isRecording ? 0.6 : 1,
            }} onClick={() => { if (!isRecording) { setEnableRppg(e => !e); if (!enableRppg) openVisioMynd(); } }}>
              <div style={{
                position: 'absolute', width: 6, height: 6, borderRadius: '50%',
                background: enableRppg ? 'var(--mauve)' : 'var(--muted)',
                top: 2, left: enableRppg ? 15 : 2, transition: 'left .18s, background .18s',
              }} />
            </div>
            <span style={{ fontSize: '.7rem', color: 'var(--cream)', whiteSpace: 'nowrap' }}>
              {lang === 'zh' ? '同步 VisioMynd' : 'Sync VisioMynd'}
            </span>
          </div>
        </div>

        {/* 2×2 Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem', marginBottom: '.3rem' }}>
          {/* Start */}
          {!isRecording && (
            <button onClick={() => { if (enableRppg) openVisioMynd(); onStartRecording(); }}
              disabled={!isConnected}
              style={{
                gridColumn: '1 / -1',
                padding: '.56rem 0', border: 'none', borderRadius: 1,
                background: isConnected ? 'rgba(152,136,168,.12)' : 'rgba(60,80,100,.2)',
                color: isConnected ? 'var(--mauve)' : 'var(--muted)',
                border: `1px solid ${isConnected ? 'rgba(152,136,168,.4)' : 'var(--border)'}`,
                fontFamily: 'inherit', fontSize: '.72rem', letterSpacing: '.12em',
                textTransform: 'uppercase', cursor: isConnected ? 'pointer' : 'not-allowed',
              } as CSSProperties}>
              {T(lang, 'recordStart')}
            </button>
          )}
          {isRecording && (<>
            {/* Stop only */}
            <button onClick={handleStopOnly} style={{
              padding: '.3rem 0', border: '1px solid var(--border)', borderRadius: 1,
              background: 'transparent', color: 'var(--text)', fontFamily: 'inherit',
              fontSize: '.66rem', cursor: 'pointer', letterSpacing: '.04em',
            }}>
              {T(lang, 'recordStopOnly')}
            </button>
            {/* Stop + download */}
            <button onClick={handleStop} style={{
              padding: '.3rem 0', border: '1px solid var(--border)', borderRadius: 1,
              background: 'transparent', color: 'var(--text)', fontFamily: 'inherit',
              fontSize: '.64rem', cursor: 'pointer', letterSpacing: '.04em',
            }}>
              {T(lang, 'recordStop')}
            </button>
            {/* Stop + report */}
            <button onClick={handleStopAndReport}
              disabled={reportStatus === 'analyzing'}
              style={{
                gridColumn: '1 / -1',
                padding: '.3rem 0', border: '1px solid rgba(152,136,168,.35)', borderRadius: 1,
                background: 'transparent', color: 'var(--mauve)', fontFamily: 'inherit',
                fontSize: '.62rem', cursor: reportStatus === 'analyzing' ? 'not-allowed' : 'pointer',
                letterSpacing: '.04em', opacity: reportStatus === 'analyzing' ? 0.5 : 1,
              } as CSSProperties}>
              {reportStatus === 'analyzing' ? T(lang, 'recordGeneratingReport') : T(lang, 'recordStopReport')}
            </button>
          </>)}
        </div>

        {/* Event marker button */}
        <button onClick={addMarker} style={{
          width: '100%', padding: '.28rem 0', display: 'block', textAlign: 'center',
          border: '1px solid rgba(220,220,0,.4)', borderRadius: 1,
          background: 'rgba(200,200,0,.08)', color: 'rgba(240,230,80,.95)',
          fontFamily: 'inherit', fontSize: '.62rem', cursor: 'pointer', letterSpacing: '.04em',
        }}>
          {T(lang, 'recordAddMarker')} [M]
        </button>
      </div>

      {/* Event markers list (grows) */}
      <div style={{
        ...cardStyle,
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        marginBottom: 0, overflow: 'hidden',
      }}>
        <div style={{
          fontSize: '.6rem', letterSpacing: '.15em', textTransform: 'uppercase',
          color: 'var(--cream)', marginBottom: '.32rem',
          paddingBottom: '.22rem', borderBottom: '1px solid rgba(178,168,198,.1)',
          display: 'flex', alignItems: 'center', gap: '.32rem', flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Crimson Pro','Georgia',serif", fontStyle: 'italic', fontSize: '.88rem', color: 'var(--plum)', lineHeight: 1 }}>◈</span>
          <span>{lang === 'zh' ? '事件標記' : 'Event Markers'}</span>
        </div>
        <div style={{ fontSize: '.58rem', color: 'var(--muted)', marginBottom: '.26rem', flexShrink: 0 }}>
          {lang === 'zh' ? '按空白鍵或 M 鍵新增標記' : 'Press Space or M to add a marker'}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {eventMarkers.length === 0 ? (
            <div style={{ fontSize: '.58rem', color: 'var(--dim)', padding: '.3rem 0' }}>—</div>
          ) : (
            eventMarkers.map((m, i) => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '.26rem .38rem', borderBottom: '1px solid rgba(178,168,198,.06)',
                fontSize: '.64rem',
              }}>
                <span style={{ color: 'var(--mauve)', fontSize: '.6rem', flexShrink: 0 }}>#{i + 1}</span>
                <span style={{ color: 'var(--cream)', flex: 1, margin: '0 .35rem' }}>{m.label}</span>
                <span style={{ color: 'var(--text)', fontSize: '.56rem' }}>
                  {new Date(m.time).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  if (layout === 'split') {
    return (
      <>
        {/* Col B: settings (flex:2) */}
        <div style={{ ...colStyle, flex: 2 }}>
          {settingsSection}
        </div>
        {/* Col C: controls (flex:1) */}
        <div style={{ ...colStyle, flex: 1 }}>
          {controlsSection}
        </div>
      </>
    );
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '.6rem .55rem' }}>
      {settingsSection}
      {controlsSection}
    </div>
  );
};
