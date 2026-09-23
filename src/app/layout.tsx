import type { Metadata } from "next";
import { Montserrat, Quicksand, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${montserrat.variable} ${quicksand.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
