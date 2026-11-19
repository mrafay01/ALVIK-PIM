// Content-Security-Policy, built per request so scripts can be allowed by a
// one-time nonce instead of 'unsafe-inline'. Pure and Edge-safe: it is
// called from middleware.ts, which generates the nonce and hands it to the
// root layout (x-nonce request header) for the one inline script it ships.
// Next.js reads the nonce from the CSP request header and stamps it onto
// its own framework and page-data scripts while rendering.
//
// - script-src: 'self' + nonce + 'strict-dynamic' (chunks loaded by a
//   trusted script are trusted). Dev also needs 'unsafe-eval' for React
//   Refresh.
// - style-src keeps 'unsafe-inline': React inline style attributes can't
//   carry a nonce.
// - connect-src: SharePoint (browser -> Graph upload URLs). Dev adds
//   websockets and localhost for HMR.
// - img-src allows any https host because item photos are links
//   (SharePoint, or external hosts in demo data).
// `https`: whether this request came in over HTTPS. upgrade-insecure-requests
// is only sent then; on plain http (a local production build) browsers would
// otherwise upgrade same-origin fetches to https and break them.
export function buildCsp(nonce: string, isProd: boolean, https: boolean = isProd): string {
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`;
  const connectSrc = isProd
    ? "connect-src 'self' https://*.sharepoint.com"
    : "connect-src 'self' https://*.sharepoint.com ws: wss: http://localhost:* http://127.0.0.1:*";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    connectSrc,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
