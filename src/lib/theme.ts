// Shared between layout.tsx's blocking inline script (server-rendered,
// serialized to a string) and ThemeToggle.tsx (client component) — kept in
// its own module rather than exported from layout.tsx itself, since
// importing anything from a file with a Server-Component-only export
// (layout.tsx's `metadata`) into a "use client" file breaks the build.
export const THEME_STORAGE_KEY = "czc-pim-theme";

// The exact inline-boot script layout.tsx renders. Centralized here (and
// not reformatted) so next.config.ts can compute a stable SHA-256 of it
// and emit a Content-Security-Policy allowing just this one script,
// letting us drop 'unsafe-inline' from script-src entirely. Any edit to
// this string invalidates the hash — the build will fail until
// next.config.ts recomputes it, which is intentional.
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();`;
