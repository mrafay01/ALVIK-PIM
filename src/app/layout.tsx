import type { Metadata } from "next";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// next/font self-hosts these at build time (no runtime request to Google
// Fonts, no render-blocking <link> tags) and exposes each as a CSS variable
// that globals.css's --font-display/--font-body/--font-mono tokens read from.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
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
      className={`${fraunces.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
