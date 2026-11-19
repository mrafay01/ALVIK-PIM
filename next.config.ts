import path from "path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const isProd = process.env.NODE_ENV === "production";

// The Content-Security-Policy is NOT set here: it carries a per-request
// nonce, so src/middleware.ts builds it (src/lib/csp.ts) for every page.

const securityHeaders = [
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
  // No cross-origin embedder policy (COEP): item photos load from other
  // origins (SharePoint), which it would block. COOP+CORP are the real win.
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
