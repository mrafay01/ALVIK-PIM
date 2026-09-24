"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export type ThemeChoice = "dark" | "light" | "system";

function applyTheme(choice: ThemeChoice) {
  if (choice === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", choice);
  }
}

// Shared by ThemeToggle.tsx (Settings > Appearance's 3-pill picker) and
// ThemeSwitcherButton.tsx (the compact navbar icon) so both read/write the
// same localStorage key through one place rather than duplicating the
// effect + try/catch dance.
export function useTheme() {
  // Starts "system" on the server and every client's first render (no
  // access to localStorage during SSR or before mount) — the real stored
  // choice is read in the effect below, right after mount. This can only
  // ever move the SELECTED control after mount, never flash the page's
  // actual colors (those are already correct pre-hydration via the inline
  // script in layout.tsx), so it's a harmless, expected one-frame UI
  // update, not a hydration mismatch.
  const [choice, setChoiceState] = useState<ThemeChoice>("system");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "light") setChoiceState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  function setChoice(next: ThemeChoice) {
    setChoiceState(next);
    applyTheme(next);
    try {
      if (next === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      /* ignore — theme still applies for this page view, just won't persist */
    }
  }

  return { choice, setChoice };
}
