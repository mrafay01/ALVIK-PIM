import type { Metadata } from "next";
import { Urbanist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// next/font self-hosts these at build time (no runtime request to Google
// Fonts, no render-blocking <link> tags) and exposes each as a CSS variable
// that globals.css's --font-display/--font-body/--font-mono tokens read from.
// Urbanist (the Alvik brand font) is loaded as a variable font, so every
// weight is available (body text uses 450). Geist Mono is for codes/numbers.
//
// `adjustFontFallback: false` opts out of Next.js's size-matching trick that
// generates a per-font fallback metric table at build. That generator is the
// code path that crashes with "Cannot read properties of null (reading '1')"
// when the Google Fonts response doesn't parse — a transient fetch failure
// shouldn't take the whole build down. The explicit `fallback: [...]` list
// is what the browser uses while the real font loads (and if the download
// fails entirely). Every value here is an inline literal because Next.js's
// SWC font-loader plugin refuses symbol references.
const urbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  adjustFontFallback: false,
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Alvik PIM",
  description: "Product & purchase order management",
  // Light/dark browser tabs each get the mark that's visible on them.
  icons: {
    icon: [
      { url: "/logos/Alvik FavIcon Black.png", media: "(prefers-color-scheme: light)" },
      { url: "/logos/Alvik FavIcon White.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

// Sets data-theme on <html> before first paint, so there's no flash of the
// wrong theme while React hydrates. Must run synchronously, before the
// stylesheet's first paint — a useEffect (the pattern the sidebar's
// collapse state uses) runs too late for this because it fires post-mount,
// after the browser has already painted once. "system" (or no stored
// choice at all) means: don't set data-theme, and let globals.css's
// existing `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])`
// rule pick it up from the OS setting.
//
// The script body is defined in @/lib/theme. It runs under the CSP's
// script-src 'unsafe-inline' (see next.config.ts for why that's needed).

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: data-theme is set by the inline script
    // above, synchronously in the browser before React hydrates, which by
    // definition can't match what the server rendered (the server has no
    // access to localStorage) — an expected, intentional mismatch on this
    // one attribute only, not a real content difference.
    <html
      lang="en"
      className={`${urbanist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Deliberately synchronous and inline (not next/script) — must
            block first paint to avoid a theme flash; see the comment
            above. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
