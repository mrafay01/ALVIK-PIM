import path from "path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy. next-auth + the app use inline styles and (in
// dev) eval for HMR; 'unsafe-inline' for styles is required by the current
// Tailwind/inline-style setup. Scripts are locked to same-origin in prod.
const csp = [
  "default-src 'self'",
  `script-src 'self'${isProd ? "" : " 'unsafe-eval'"} 'unsafe-inline'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  // SharePoint/Graph + Monday are called server-side only, so connect-src
  // stays same-origin.
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pins the workspace root to this project. Without this, Next.js infers
  // the root by walking up for lockfiles and lands on an unrelated, empty
  // package-lock.json in the Windows user profile directory (C:\Users\<user>),
  // which triggers a "multiple lockfiles" warning on every build/dev run.
  outputFileTracingRoot: path.join(__dirname),
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
