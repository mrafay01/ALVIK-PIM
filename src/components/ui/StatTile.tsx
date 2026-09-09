import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

const TONE_CLASSES: Record<"brass" | "good" | "warn" | "critical", { fg: string; bg: string }> = {
  brass: { fg: "text-brass", bg: "bg-brass-bg" },
  good: { fg: "text-good", bg: "bg-good-bg" },
  warn: { fg: "text-warn", bg: "bg-warn-bg" },
  critical: { fg: "text-critical", bg: "bg-critical-bg" },
};

export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "brass",
  sub,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "brass" | "good" | "warn" | "critical";
  sub?: string;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
        <span className={`flex items-center justify-center w-8 h-8 rounded-sm shrink-0 ${t.bg} ${t.fg}`}>
          <Icon size={16} strokeWidth={2} />
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[1.9rem] font-semibold text-ink leading-none">{value}</span>
      </div>
      {sub && <span className="text-[0.8rem] text-ink-soft">{sub}</span>}
    </Card>
  );
}
