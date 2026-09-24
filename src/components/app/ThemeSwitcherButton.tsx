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
        className="flex items-center justify-center w-8 h-8 rounded-sm border border-border-strong bg-transparent text-ink-faint hover:text-ink hover:border-brass cursor-pointer transition-colors duration-150"
      >
        <CurrentIcon size={15} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] w-[150px] bg-surface-raised border border-border-strong rounded-sm shadow-lg py-1.5 z-20"
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
                className={`flex items-center gap-2.5 w-full text-left bg-transparent border-0 cursor-pointer text-[0.83rem] px-3.5 py-2 whitespace-nowrap ${
                  active ? "font-semibold text-brass" : "text-ink-soft hover:text-ink hover:bg-surface-overlay"
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
