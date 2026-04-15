/**
 * creditApi.ts — Artise credit (service start/end) integration for SoraMynd.
 * Reads steeg_token from cookie or localStorage, then calls the artisebio API.
 * If the user is not logged in (no token), the check is skipped silently.
 * If credits are exhausted (403), throws NoCreditError.
 */

const ARTISEBIO_API = 'https://www.sigmacog.xyz/api';

function getAuthToken(): string | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)steeg_token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    return localStorage.getItem('steeg_token') || null;
  } catch {
    return null;
  }
}

export class NoCreditError extends Error {
  constructor() {
    super('no_credits');
    this.name = 'NoCreditError';
  }
}

/** Call before the service session starts. Returns session_id or null (no token = skip). */
export async function serviceStart(service: string): Promise<number | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const r = await fetch(`${ARTISEBIO_API}/service/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ service }),
    });
    if (r.status === 403) throw new NoCreditError();
    if (!r.ok) return null;
    const d = await r.json() as { session_id: number };
    return d.session_id;
  } catch (e) {
    if (e instanceof NoCreditError) throw e;
    return null;
  }
}

/** Call when the service session ends. Fire-and-forget. */
export function serviceEnd(sessionId: number, durationSeconds: number): void {
  const token = getAuthToken();
  if (!token) return;
  fetch(`${ARTISEBIO_API}/service/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ session_id: sessionId, duration_seconds: Math.round(durationSeconds) }),
  }).catch(() => {});
}
