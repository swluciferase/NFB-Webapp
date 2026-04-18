import { useEffect, useRef, useState, type FC } from 'react';
import { T, type Lang } from '../../i18n';
import type { SessionReport } from '../SessionConfig';
import { gameSessionApi } from '../../services/gameSessionApi';
import { getSessionTokenFromUrl, fetchSessionInfo } from '../../services/sessionApi';

export interface SessionReportViewProps {
  lang: Lang;
  report: SessionReport;
  onDone: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function flattenRL(report: SessionReport): number[] {
  const out: number[] = [];
  for (const r of report.runs) {
    if (r.rlSeries.length > 0) out.push(...r.rlSeries);
  }
  return out;
}

/** Extract the rl2Series (pitcher RL) from gameSpecific across all runs. */
function flattenRL2(report: SessionReport): number[] {
  const out: number[] = [];
  for (const r of report.runs) {
    const s2 = r.gameSpecific.rl2Series;
    if (Array.isArray(s2)) out.push(...(s2 as number[]));
  }
  return out;
}

function peakRL(series: number[]): number {
  if (series.length === 0) return 0;
  return Math.max(...series);
}

function stddev(series: number[]): number {
  if (series.length < 2) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((sum, v) => sum + (v - mean) ** 2, 0) / series.length;
  return Math.sqrt(variance);
}

/** Longest continuous streak (in seconds) where RL >= threshold.
 *  Computed on the flattened (cross-run) series so streaks can span innings. */
function longestSustainedSec(series: number[], threshold: number): number {
  let longest = 0;
  let streak = 0;
  for (const v of series) {
    if (v >= threshold) {
      streak++;
      if (streak > longest) longest = streak;
    } else {
      streak = 0;
    }
  }
  return longest;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Aggregate gameSpecific across all runs. */
function aggregateGameSpecific(report: SessionReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of report.runs) {
    for (const [k, v] of Object.entries(r.gameSpecific)) {
      if (typeof v === 'number') out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

// ── RL Curve Chart ─────────────────────────────────────────────────────────

const RLChart: FC<{ series: number[]; series2?: number[]; threshold: number; label1?: string; label2?: string }> = ({ series, series2, threshold, label1, label2 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasDual = series2 && series2.length >= 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || series.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 16, right: hasDual ? 80 : 16, bottom: 32, left: 44 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(130,190,255,0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= 100; y += 25) {
      const py = pad.top + plotH * (1 - y / 100);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.stroke();

      ctx.fillStyle = 'rgba(180,210,255,0.5)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${y}`, pad.left - 6, py + 3);
    }

    // X-axis labels (seconds)
    const totalSec = series.length;
    const xStep = totalSec <= 60 ? 10 : totalSec <= 300 ? 30 : 60;
    ctx.fillStyle = 'rgba(180,210,255,0.5)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let s = 0; s <= totalSec; s += xStep) {
      const px = pad.left + (s / (totalSec - 1)) * plotW;
      ctx.fillText(`${s}s`, px, h - pad.bottom + 18);
    }

    // Threshold line
    if (threshold > 0 && threshold < 100) {
      const ty = pad.top + plotH * (1 - threshold / 100);
      ctx.strokeStyle = 'rgba(248,81,73,0.5)';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, ty);
      ctx.lineTo(pad.left + plotW, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(248,81,73,0.7)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`TA ${threshold}%`, pad.left + plotW + 2, ty + 3);
    }

    // ── Series 2 (pitcher / secondary) — draw first so series 1 is on top ──
    if (hasDual && series2) {
      // Fill area
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top + plotH);
      for (let i = 0; i < series2.length; i++) {
        const x = pad.left + (i / (series2.length - 1)) * plotW;
        const y = pad.top + plotH * (1 - Math.min(100, series2[i]) / 100);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(pad.left + plotW, pad.top + plotH);
      ctx.closePath();
      const grad2 = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      grad2.addColorStop(0, 'rgba(255,176,96,0.15)');
      grad2.addColorStop(1, 'rgba(255,140,60,0.03)');
      ctx.fillStyle = grad2;
      ctx.fill();

      // Line
      ctx.beginPath();
      for (let i = 0; i < series2.length; i++) {
        const x = pad.left + (i / (series2.length - 1)) * plotW;
        const y = pad.top + plotH * (1 - Math.min(100, series2[i]) / 100);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#ffb060';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ── Series 1 (batter / primary) ──
    // Fill area
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    for (let i = 0; i < series.length; i++) {
      const x = pad.left + (i / (series.length - 1)) * plotW;
      const y = pad.top + plotH * (1 - Math.min(100, series[i]) / 100);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, 'rgba(126,232,198,0.25)');
    grad.addColorStop(1, 'rgba(74,139,255,0.05)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const x = pad.left + (i / (series.length - 1)) * plotW;
      const y = pad.top + plotH * (1 - Math.min(100, series[i]) / 100);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#7ee8c6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Legend (dual mode) ──
    if (hasDual) {
      const lx = pad.left + plotW + 8;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      // Series 1
      ctx.fillStyle = '#7ee8c6';
      ctx.fillRect(lx, pad.top + 4, 12, 3);
      ctx.fillStyle = 'rgba(200,215,235,0.7)';
      ctx.fillText(label1 ?? 'RL1', lx + 16, pad.top + 10);
      // Series 2
      ctx.fillStyle = '#ffb060';
      ctx.fillRect(lx, pad.top + 20, 12, 3);
      ctx.fillStyle = 'rgba(200,215,235,0.7)';
      ctx.fillText(label2 ?? 'RL2', lx + 16, pad.top + 26);
    }
  }, [series, series2, threshold, hasDual, label1, label2]);

  if (series.length < 2) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(200,215,235,0.6)', marginBottom: 8, letterSpacing: '0.04em' }}>
        回饋值曲線 · RL Curve
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 200,
          borderRadius: 10,
          background: 'rgba(10,18,35,0.6)',
          border: '1px solid rgba(93,109,134,0.25)',
        }}
      />
    </div>
  );
};

// ── Stat Card ──────────────────────────────────────────────────────────────

const StatCard: FC<{ label: string; value: string; sub?: string; accent?: string }> = ({
  label, value, sub, accent = '#8ecfff',
}) => (
  <div style={{
    padding: 16,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(93,109,134,0.25)',
    flex: 1,
    minWidth: 120,
  }}>
    <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.5)', marginBottom: 6 }}>{label}</div>
    <div style={{
      fontSize: 22, fontWeight: 700, color: accent,
      fontFamily: 'ui-monospace, monospace', lineHeight: 1,
    }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.4)', marginTop: 4 }}>{sub}</div>}
  </div>
);

// ── Game-specific labels ───────────────────────────────────────────────────

const GAME_STAT_LABELS: Record<string, Record<string, { zh: string; en: string }>> = {
  plane: {
    distanceM:        { zh: '飛行距離 (m)', en: 'Distance (m)' },
    score:            { zh: '分數', en: 'Score' },
    fuelLost:         { zh: '損失燃料', en: 'Fuel Lost' },
    timeAboveMidSec:  { zh: '中線以上時間 (s)', en: 'Time Above Mid (s)' },
    hits:             { zh: '命中', en: 'Hits' },
    misses:           { zh: '未命中', en: 'Misses' },
    pickupsCollected: { zh: '拾取補給', en: 'Pickups' },
    redBalloonsDodged:{ zh: '躲避紅球', en: 'Red Dodged' },
  },
  baseball: {
    pitches:       { zh: '投球數', en: 'Pitches' },
    whiffs:        { zh: '揮空', en: 'Whiffs' },
    outs:          { zh: '出局', en: 'Outs' },
    hits:          { zh: '安打', en: 'Hits' },
    homeRuns:      { zh: '全壘打', en: 'Home Runs' },
    totalBases:    { zh: '壘打數', en: 'Total Bases' },
    runsScored:    { zh: '得分', en: 'Runs Scored' },
    calledStrikes: { zh: '好球', en: 'Called Strikes' },
    meanCharge:    { zh: '平均蓄力', en: 'Mean Charge' },
    ballparkM:     { zh: '全壘打牆 (m)', en: 'HR Wall (m)' },
  },
};

function getGameStatLabel(gameId: string, key: string, lang: Lang): string {
  return GAME_STAT_LABELS[gameId]?.[key]?.[lang] ?? key;
}

// ── Main Component ─────────────────────────────────────────────────────────

export const SessionReportView: FC<SessionReportViewProps> = ({ lang, report, onDone }) => {
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    setUploadState('uploading');
    (async () => {
      const token = getSessionTokenFromUrl();
      if (!token) {
        setUploadState('ok');
        return;
      }
      const info = await fetchSessionInfo(token);
      if (!info) {
        setUploadState('error');
        setErr('無法驗證 session token');
        return;
      }
      const r = await gameSessionApi.upload({
        sessionId: String(info.sessionId),
        sessionToken: info.sessionToken,
        report,
        reportHtml: buildReportHtml(report),
      });
      if (r.ok) {
        setUploadState('ok');
      } else {
        setUploadState('error');
        setErr(r.error ?? '');
      }
    })();
  }, [report]);

  const allRL = flattenRL(report);
  const allRL2 = flattenRL2(report);
  const peak = peakRL(allRL);
  const sd = stddev(allRL);
  const sustainedThreshold = report.lastTa ?? 50;
  const longestSustained = longestSustainedSec(allRL, sustainedThreshold);
  const gs = aggregateGameSpecific(report);
  const isDual = allRL2.length >= 2;

  // Game-specific stat keys to display (exclude 'score' and internal arrays)
  const gameStatKeys = Object.keys(gs).filter((k) => k !== 'score' && k !== 'rl2Series');

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{T(lang, 'gameReportTitle')}</h3>

      {/* ── Row 1: Session overview cards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <StatCard
          label={T(lang, 'gameReportGame')}
          value={`${report.gameId}`}
          sub={report.gameMode}
        />
        <StatCard
          label={T(lang, 'gameReportPlanned')}
          value={
            report.plannedCoveragePct != null
              ? `${report.plannedCoveragePct}%`
              : report.plannedInnings != null
                ? `${report.plannedInnings} ${T(lang, report.plannedInnings === 1 ? 'gameInningSingular' : 'gameInningPlural')}`
                : formatDuration(report.plannedDurationSec ?? 0)
          }
        />
        <StatCard
          label={T(lang, 'gameReportActual')}
          value={formatDuration(report.actualDurationSec)}
        />
        <StatCard
          label={T(lang, 'gameReportRuns')}
          value={`${report.runs.length}`}
          sub={lang === 'zh' ? `${report.validRunsCount} 有效` : `${report.validRunsCount} valid`}
        />
      </div>

      {/* ── Row 2: RL analysis cards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <StatCard
          label={T(lang, 'gameReportAvgRL')}
          value={`${Math.round(report.avgRL)}%`}
          accent="#7ee8c6"
        />
        <StatCard
          label={lang === 'zh' ? '最高回饋值' : 'Peak RL'}
          value={`${Math.round(peak)}%`}
          accent="#ffd166"
        />
        <StatCard
          label={lang === 'zh' ? '回饋值標準差' : 'RL Std Dev'}
          value={sd.toFixed(1)}
          accent="#c4a0ff"
        />
        <StatCard
          label={lang === 'zh' ? '持續回饋時間' : 'Sustained'}
          value={formatDuration(longestSustained)}
          sub={lang === 'zh' ? `連續 ≥ ${sustainedThreshold}%` : `streak ≥ ${sustainedThreshold}%`}
          accent="#58a6ff"
        />
      </div>

      {/* ── Row 3: Game-specific stat cards ── */}
      {gameStatKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {gs.score != null && (
            <StatCard
              label={lang === 'zh' ? '總分' : 'Total Score'}
              value={`${Math.round(gs.score)}`}
              accent="#ffd166"
            />
          )}
          {gameStatKeys.map((k) => (
            <StatCard
              key={k}
              label={getGameStatLabel(report.gameId, k, lang)}
              value={`${Math.round(gs[k])}`}
            />
          ))}
        </div>
      )}

      {/* ── RL Curve Chart ── */}
      <RLChart
        series={allRL}
        series2={isDual ? allRL2 : undefined}
        threshold={sustainedThreshold}
        label1={isDual ? 'Team A' : undefined}
        label2={isDual ? 'Team B' : undefined}
      />

      {/* ── Upload status ── */}
      <div style={{ marginTop: 16, marginBottom: 16, fontSize: 12, color: 'rgba(200,215,235,0.6)' }}>
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

function buildReportHtml(r: SessionReport): string {
  const allRL = flattenRL(r);
  const peak = peakRL(allRL);
  const sd = stddev(allRL);
  const gs = aggregateGameSpecific(r);
  return `<!DOCTYPE html><html><body>
<h1>SoraMynd GamePack — Session Report</h1>
<ul>
<li>Game: ${r.gameId} (${r.gameMode})</li>
<li>Theme: ${r.themeId}</li>
<li>Planned: ${r.plannedCoveragePct != null ? `${r.plannedCoveragePct}% target coverage` : r.plannedInnings != null ? `${r.plannedInnings} innings` : `${r.plannedDurationSec ?? 0}s`} · Actual: ${r.actualDurationSec}s</li>
<li>Runs: ${r.runs.length} (valid ${r.validRunsCount})</li>
<li>Avg Reward Level: ${r.avgRL.toFixed(1)}%</li>
<li>Peak RL: ${peak.toFixed(1)}%</li>
<li>RL Std Dev: ${sd.toFixed(1)}</li>
${gs.score != null ? `<li>Score: ${Math.round(gs.score)}</li>` : ''}
${gs.distanceM != null ? `<li>Distance: ${Math.round(gs.distanceM)}m</li>` : ''}
</ul>
</body></html>`;
}
