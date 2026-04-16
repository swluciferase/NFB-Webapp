/**
 * sessionApi.ts — Artise Biomedical session integration for SoraMynd (NFB-Webapp)
 * Reads session_token from URL or steeg_session cookie, fetches subject info,
 * uploads result data on session completion.
 */

const ARTISEBIO_API = import.meta.env.VITE_ARTISEBIO_API ?? 'https://artisebio-api.sigmacog.xyz';

export interface SessionInfo {
  sessionId: number;
  sessionToken: string;
}

/** Read session_token from URL params or steeg_session cookie (set by proxy after redirect). */
export function getSessionTokenFromUrl(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('session_token');
  if (fromUrl) return fromUrl;
  const cookieMatch = document.cookie.match(/steeg_session=([^;]+)/);
  if (cookieMatch) return decodeURIComponent(cookieMatch[1]);
  return null;
}

/** Fetch session info from backend using the JWT token. Returns null if standalone (no token). */
export async function fetchSessionInfo(token: string): Promise<SessionInfo | null> {
  try {
    const r = await fetch(`${ARTISEBIO_API}/sessions/token/${encodeURIComponent(token)}`);
    if (!r.ok) return null;
    const d = await r.json() as { session_id: number };
    return { sessionId: d.session_id, sessionToken: token };
  } catch {
    return null;
  }
}
