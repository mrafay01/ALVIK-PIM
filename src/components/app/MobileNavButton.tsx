"use client";

import { Menu } from "lucide-react";
import { OPEN_NAV_EVENT } from "./Sidebar";

// Menu button in the page header on phones/tablets (hidden on desktop,
// where the sidebar is always visible). Opens the sidebar drawer.
export function MobileNavButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
      aria-label="Open menu"
      className="lg:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-full border border-border bg-surface-raised shadow-btn-quiet text-ink cursor-pointer shrink-0"
    >
      <Menu size={18} />
    </button>
  );
}
