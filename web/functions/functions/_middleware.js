/**
 * Cloudflare Pages middleware.
 * - soramynd.sigmacog.xyz/* → redirect to www.sigmacog.xyz/soramynd/
 * - All other hosts (nfb-webapp.pages.dev, etc.) → pass through.
 */
export async function onRequest({ request, next }) {
  const host = new URL(request.url).hostname;
  if (host === 'soramynd.sigmacog.xyz') {
    return Response.redirect('https://www.sigmacog.xyz/soramynd/', 301);
  }
  return next();
}
