/**
 * Cloudflare Pages middleware — block direct access.
 * Only requests forwarded by the artisebio-web proxy (x-proxy-secret) are allowed.
 *
 * Also fixes a wrangler direct-upload bug where HTML files get stored as
 * base64 strings and served with content-type: application/octet-stream.
 */
export async function onRequest({ request, env, next }) {
  const secret = env.PROXY_SECRET;
  if (secret && request.headers.get("x-proxy-secret") !== secret) {
    return new Response("Access denied", { status: 403 });
  }

  const resp = await next();

  // Fix: wrangler direct-upload sometimes stores HTML as a base64 string,
  // causing Cloudflare Pages to serve it as application/octet-stream.
  // Detect this condition for HTML paths and correct the response.
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/octet-stream')) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === '/' || p === '' || p.endsWith('.html')) {
      const text = await resp.text();
      const trimmed = text.trim();
      let html = trimmed;
      // If the body is base64-encoded HTML, decode it
      if (!trimmed.startsWith('<') && /^[A-Za-z0-9+/\r\n]+=*$/.test(trimmed)) {
        try { html = atob(trimmed.replace(/\s/g, '')); } catch (_) {}
      }
      const headers = new Headers(resp.headers);
      headers.set('content-type', 'text/html; charset=utf-8');
      return new Response(html, { status: resp.status, headers });
    }
  }

  return resp;
}
