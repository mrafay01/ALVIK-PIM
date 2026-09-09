import type { LucideIcon } from "lucide-react";

const TONE_CLASSES: Record<"neutral" | "brass" | "good" | "warn" | "critical", { icon: string; bg: string }> = {
  neutral: { icon: "text-ink-faint", bg: "bg-neutral-pill" },
  brass: { icon: "text-brass", bg: "bg-brass-bg" },
  good: { icon: "text-good", bg: "bg-good-bg" },
  warn: { icon: "text-warn", bg: "bg-warn-bg" },
  critical: { icon: "text-critical", bg: "bg-critical-bg" },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "neutral" | "brass" | "good" | "warn" | "critical";
}) {
  const t = TONE_CLASSES[tone];

  return (
    <div className="bg-surface-raised border border-border rounded-md shadow-sm px-5 py-[18px] flex items-center gap-3.5 min-w-0">
      {Icon && (
        <span className={`flex items-center justify-center w-10 h-10 rounded-sm shrink-0 ${t.bg}`}>
          <Icon size={19} className={t.icon} strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[0.72rem] font-bold text-ink-faint uppercase tracking-wide mb-0.5">{label}</div>
        <div className="text-2xl font-bold text-ink font-mono leading-tight">{value}</div>
      </div>
    </div>
  );
}
