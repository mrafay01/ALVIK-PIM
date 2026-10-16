import path from "path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy.
// - script-src: 'unsafe-inline' in every environment. The App Router
//   streams each page's data to the browser in inline <script> tags
//   (self.__next_f.push(...)) whose contents change on every request, so
//   they can't be allow-listed by hash; a hash-only policy (what this used
//   to ship in production) blocks them and every page renders blank. The
//   stricter alternative is a per-request nonce set in middleware, which
//   would require middleware to run on every page; until then this is the
//   configuration Next.js documents for apps without nonces. Dev also
//   needs 'unsafe-eval' for HMR / React Refresh.
// - style-src: 'unsafe-inline' remains because the Tailwind runtime and some
//   inline React styles rely on it. Fonts come from Google's CDN.
// - connect-src: 'self' in prod. In dev, websockets to localhost (ws:) and
//   same-origin (http:) are added for Next.js HMR; without those, HMR stays
//   broken and the dashboard flashes blank on every save.
// - Graph and Monday are called server-side (only file uploads go from the
//   browser to SharePoint, see connectSrc); Sentry uses
//   tunnelRoute so its traffic is same-origin either way.
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-eval' 'unsafe-inline'";

// SharePoint: quote/PI files upload from the browser straight to the
// site's pre-authenticated upload URL ({tenant}.sharepoint.com).
const connectSrc = isProd
  ? "connect-src 'self' https://*.sharepoint.com"
  : "connect-src 'self' https://*.sharepoint.com ws: wss: http://localhost:* http://127.0.0.1:*";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  connectSrc,
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Isolates this origin from other windows it might open or that might
  // open it — defence against cross-window attacks like Spectre side
  // channels and tabnapping. Prod uses the strictest value; dev uses
  // same-origin-allow-popups so Next's error-overlay popup still works.
  {
    key: "Cross-Origin-Opener-Policy",
    value: isProd ? "same-origin" : "same-origin-allow-popups",
  },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // No powerful cross-origin isolation (COEP) — enabling it would block
  // Google Fonts, which the UI depends on. Can revisit if fonts move
  // self-hosted later; for now the COOP+CORP pair is the real win.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Pins the workspace root to this project. Without this, Next.js infers
  // the root by walking up for lockfiles and lands on an unrelated, empty
  // package-lock.json in the Windows user profile directory (C:\Users\<user>),
  // which triggers a "multiple lockfiles" warning on every build/dev run.
  outputFileTracingRoot: path.join(__dirname),
  // Lets a verification build go to a separate folder (NEXT_DIST_DIR=…)
  // without disturbing a running dev server's .next directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: "/__sentry_proxy",
});
