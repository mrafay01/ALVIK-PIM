import type { Metadata } from "next";
import { Montserrat, Quicksand, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

// next/font self-hosts these at build time (no runtime request to Google
// Fonts, no render-blocking <link> tags) and exposes each as a CSS variable
// that globals.css's --font-display/--font-body/--font-mono tokens read from.
// Montserrat (headings) is capped at 700 — the app never requests or uses a
// heavier weight (800/900) than that for display text, by design.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});
const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CZC PIM",
  description: "Product & purchase order management",
  icons: { icon: "/logos/favicon.svg" },
};

// Sets data-theme on <html> before first paint, so there's no flash of the
// wrong theme while React hydrates. Must run synchronously, before the
// stylesheet's first paint — a useEffect (the pattern the sidebar's
// collapse state uses) runs too late for this because it fires post-mount,
// after the browser has already painted once. "system" (or no stored
// choice at all) means: don't set data-theme, and let globals.css's
// existing `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])`
// rule pick it up from the OS setting.
const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;

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
      className={`${montserrat.variable} ${quicksand.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Deliberately synchronous and inline (not next/script) — must
            block first paint to avoid a theme flash; see themeInitScript's
            own comment above. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
