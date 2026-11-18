"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/useTheme";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: MonitorSmartphone },
];

// Compact icon-button + dropdown for the page-header navbar — the full
// 3-pill picker (ThemeToggle.tsx) lives on Settings > Appearance; this is
// the same underlying choice (shared via useTheme), just reachable from
// every page without a trip to Settings.
export function ThemeSwitcherButton() {
  const { choice, setChoice } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const CurrentIcon = OPTIONS.find((o) => o.value === choice)?.icon ?? MonitorSmartphone;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Theme"
        aria-label="Change theme"
        aria-expanded={open}
        className="flex items-center justify-center w-9 h-9 rounded-full border border-border bg-surface-raised shadow-btn-quiet text-ink-soft hover:text-brand cursor-pointer transition-colors duration-150"
      >
        <CurrentIcon size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] w-[160px] bg-surface-raised border border-border rounded-[14px] shadow-lg p-1.5 z-30"
        >
          {OPTIONS.map((opt) => {
            const active = choice === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setChoice(opt.value);
                  setOpen(false);
                }}
                className={`flex items-center gap-2.5 w-full text-left border-0 cursor-pointer text-[0.85rem] px-3 py-2 rounded-[10px] whitespace-nowrap ${
                  active ? "font-semibold text-brand bg-brand-bg" : "bg-transparent text-ink-soft hover:text-ink hover:bg-surface-overlay"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
