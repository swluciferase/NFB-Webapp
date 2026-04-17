import type { SessionReport } from '../game/SessionConfig';
import { gameSessionLog } from './gameSessionLog';

const API_BASE = import.meta.env.VITE_ARTISEBIO_API ?? 'https://artisebio-api.sigmacog.xyz';

export interface UploadArgs {
  sessionId: string;
  sessionToken: string;    // JWT provided by the join flow; '' if standalone
  report: SessionReport;
  reportHtml: string;
}

export interface UploadResult {
  ok: boolean;
  error?: string;
}

async function uploadCsv(sessionId: string, sessionToken: string, csv: string): Promise<boolean> {
  if (!sessionToken) return true;
  const form = new FormData();
  form.append('session_token', sessionToken);
  form.append('file', new Blob([csv], { type: 'text/csv' }), `${sessionId}.csv`);
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/upload-csv`, {
    method: 'POST',
    body: form,
  });
  return res.ok;
}

async function putResult(
  sessionId: string,
  sessionToken: string,
  report: SessionReport,
  reportHtml: string,
): Promise<boolean> {
  if (!sessionToken) return true;
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/result`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_token: sessionToken,
      results: report,
      report_html: reportHtml,
    }),
  });
  return res.ok;
}

function reportToCsv(report: SessionReport): string {
  // Run-by-run table; raw rlSeries omitted to stay under the 50 MB limit.
  const header = ['runIndex', 'startedAt', 'durationMs', 'qualityPercent', 'isValid'].join(',');
  const rows = report.runs.map((r) =>
    [r.runIndex, r.startedAt, r.durationMs, r.qualityPercent, r.isValid].join(','),
  );
  return [header, ...rows].join('\n');
}

export const gameSessionApi = {
  async upload(args: UploadArgs): Promise<UploadResult> {
    const { sessionId, sessionToken, report, reportHtml } = args;
    try {
      const csvOk = await uploadCsv(sessionId, sessionToken, reportToCsv(report));
      if (!csvOk) throw new Error('CSV upload failed');
      const resultOk = await putResult(sessionId, sessionToken, report, reportHtml);
      if (!resultOk) throw new Error('result PUT failed');
      await gameSessionLog.dequeue(sessionId);
      return { ok: true };
    } catch (err) {
      await gameSessionLog.enqueue(report);
      return { ok: false, error: (err as Error).message };
    }
  },

  async flushPending(sessionToken: string): Promise<number> {
    const pending = await gameSessionLog.list();
    let flushed = 0;
    for (const r of pending) {
      const res = await this.upload({
        sessionId: r.sessionId,
        sessionToken,
        report: r,
        reportHtml: '',
      });
      if (res.ok) flushed++;
    }
    return flushed;
  },
};
