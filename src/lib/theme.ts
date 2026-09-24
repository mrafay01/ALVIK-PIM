// Shared between layout.tsx's blocking inline script (server-rendered,
// serialized to a string) and ThemeToggle.tsx (client component) — kept in
// its own module rather than exported from layout.tsx itself, since
// importing anything from a file with a Server-Component-only export
// (layout.tsx's `metadata`) into a "use client" file breaks the build.
export const THEME_STORAGE_KEY = "czc-pim-theme";
