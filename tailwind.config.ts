import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Alvik PIM — Tailwind theme
 * Maps directly onto the CSS custom-property tokens defined in
 * src/app/globals.css. Colors/radii/shadows resolve through var(--token)
 * so the existing dark-first / [data-theme="light"] switching keeps
 * working unchanged — Tailwind classes are a thin utility layer over
 * the same design tokens, not a second source of truth.
 */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",

        surface: "var(--surface)",
        "surface-sunken": "var(--surface-sunken)",
        "surface-raised": "var(--surface-raised)",
        "surface-overlay": "var(--surface-overlay)",

        border: "var(--border)",
        "border-strong": "var(--border-strong)",

        brand: "var(--brand)",
        "brand-soft": "var(--brand-soft)",
        "brand-bg": "var(--brand-bg)",
        "brand-hover": "var(--brand-hover)",
        "on-brand": "var(--on-brand)",
        // Solid green fills (primary buttons, bars, toggles). Text uses `brand`.
        "brand-fill": "var(--brand-fill)",
        "brand-fill-hover": "var(--brand-fill-hover)",

        "navy-deep": "var(--navy-deep)",
        "navy-soft": "var(--navy-soft)",

        good: "var(--good)",
        "good-bg": "var(--good-bg)",
        warn: "var(--warn)",
        "warn-bg": "var(--warn-bg)",
        critical: "var(--critical)",
        "critical-bg": "var(--critical-bg)",
        "neutral-pill": "var(--neutral-pill-bg)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        btn: "var(--shadow-btn)",
        "btn-quiet": "var(--shadow-btn-quiet)",
      },
      backgroundColor: {
        "brand-glow": "var(--brand-glow)",
        glass: "var(--glass)",
      },
    },
  },
  plugins: [
    // `live:` = "not disabled". Lets one class string give hover/press
    // effects to links and enabled buttons, never to a disabled button
    // (src/components/ui/buttonStyles.ts).
    plugin(({ addVariant }) => {
      addVariant("live", "&:not(:disabled)");
    }),
  ],
} satisfies Config;
