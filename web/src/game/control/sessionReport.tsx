import { useEffect, useState, type FC } from 'react';
import { T, type Lang } from '../../i18n';
import type { SessionReport } from '../SessionConfig';
import { gameSessionApi } from '../../services/gameSessionApi';

export interface SessionReportViewProps {
  lang: Lang;
  report: SessionReport;
  onDone: () => void;
}

export const SessionReportView: FC<SessionReportViewProps> = ({ lang, report, onDone }) => {
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    setUploadState('uploading');
    gameSessionApi
      .upload({
        sessionId: report.sessionId,
        sessionToken: '',
        report,
        reportHtml: buildReportHtml(report),
      })
      .then((r) => {
        if (r.ok) {
          setUploadState('ok');
        } else {
          setUploadState('error');
          setErr(r.error ?? '');
        }
      });
  }, [report]);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{T(lang, 'gameReportTitle')}</h3>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(93,109,134,0.25)',
          marginBottom: 16,
        }}
      >
        <ReportRow
          label={T(lang, 'gameReportGame')}
          value={`${report.gameId} · ${report.gameMode}`}
        />
        <ReportRow
          label={T(lang, 'gameReportPlanned')}
          value={`${report.plannedDurationSec}s`}
        />
        <ReportRow
          label={T(lang, 'gameReportActual')}
          value={`${report.actualDurationSec}s`}
        />
        <ReportRow
          label={T(lang, 'gameReportRuns')}
          value={`${report.runs.length} (${report.validRunsCount} valid)`}
        />
        <ReportRow label={T(lang, 'gameReportAvgOO')} value={`${Math.round(report.avgOO)}%`} />
      </div>

      <div style={{ marginBottom: 16, fontSize: 12, color: 'rgba(200,215,235,0.6)' }}>
        {uploadState === 'uploading' && T(lang, 'gameReportUploading')}
        {uploadState === 'ok' && T(lang, 'gameReportUploaded')}
        {uploadState === 'error' && `${T(lang, 'gameReportUploadFailed')} ${err}`}
      </div>

      <button
        onClick={onDone}
        style={{
          padding: '10px 18px',
          borderRadius: 6,
          background: '#58a6ff',
          border: 'none',
          color: '#0a0f1a',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {T(lang, 'gameReportDone')}
      </button>
    </div>
  );
};

const ReportRow: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
    <span style={{ color: 'rgba(200,215,235,0.55)', fontSize: 12 }}>{label}</span>
    <span style={{ color: '#8ecfff', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
      {value}
    </span>
  </div>
);

function buildReportHtml(r: SessionReport): string {
  return `<!DOCTYPE html><html><body>
<h1>SoraMynd GamePack — Session Report</h1>
<ul>
<li>Game: ${r.gameId} (${r.gameMode})</li>
<li>Theme: ${r.themeId}</li>
<li>Planned: ${r.plannedDurationSec}s · Actual: ${r.actualDurationSec}s</li>
<li>Runs: ${r.runs.length} (valid ${r.validRunsCount})</li>
<li>Avg OO: ${r.avgOO.toFixed(1)}%</li>
</ul>
</body></html>`;
}
