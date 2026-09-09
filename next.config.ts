import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pins the workspace root to this project. Without this, Next.js infers
  // the root by walking up for lockfiles and lands on an unrelated, empty
  // package-lock.json in the Windows user profile directory (C:\Users\<user>),
  // which triggers a "multiple lockfiles" warning on every build/dev run.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
