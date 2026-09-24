import type { Config } from "tailwindcss";

/**
 * CZC PIM — Tailwind theme
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

        brass: "var(--brass)",
        "brass-soft": "var(--brass-soft)",
        "brass-bg": "var(--brass-bg)",
        "brass-hover": "var(--brass-hover)",
        "on-brass": "var(--on-brass)",

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
      },
      backgroundColor: {
        "brass-glow": "var(--brass-glow)",
      },
    },
  },
  plugins: [],
} satisfies Config;
