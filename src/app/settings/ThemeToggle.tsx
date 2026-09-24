"use client";

import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/useTheme";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: MonitorSmartphone },
];

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();

  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((opt) => {
        const active = choice === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setChoice(opt.value)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-sm border text-[0.85rem] font-semibold cursor-pointer transition-colors duration-150 ${
              active
                ? "bg-brass-bg text-brass border-[color:var(--brass-glow)]"
                : "bg-transparent text-ink-soft border-border-strong hover:text-ink hover:border-brass"
            }`}
          >
            <Icon size={15} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
