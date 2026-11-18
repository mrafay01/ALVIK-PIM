import type { LucideIcon } from "lucide-react";

const TONE_CLASSES: Record<"neutral" | "brand" | "good" | "warn" | "critical", { icon: string; bg: string }> = {
  neutral: { icon: "text-ink-faint", bg: "bg-neutral-pill" },
  brand: { icon: "text-brand", bg: "bg-brand-bg" },
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
  tone?: "neutral" | "brand" | "good" | "warn" | "critical";
}) {
  const t = TONE_CLASSES[tone];

  return (
    // suppressHydrationWarning: browser extensions (Bitdefender's
    // Anti-tracker being the common one) inject a bis_skin_checked
    // attribute onto plain wrapper divs after they scan the page, which
    // React otherwise flags as a hydration mismatch even though the actual
    // rendered content is identical. Cosmetic-only; real mismatches still
    // surface normally.
    <div
      className="bg-surface-raised border border-border rounded-md shadow-sm px-5 py-[18px] flex items-center gap-3.5 min-w-0"
      suppressHydrationWarning
    >
      {Icon && (
        <span className={`flex items-center justify-center w-11 h-11 rounded-[14px] shrink-0 ${t.bg}`}>
          <Icon size={20} className={t.icon} strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0" suppressHydrationWarning>
        <div className="text-[0.78rem] font-semibold text-ink-faint mb-0.5 truncate" suppressHydrationWarning>
          {label}
        </div>
        <div className="text-[1.65rem] font-bold text-ink font-display tabular-nums tracking-tight leading-tight" suppressHydrationWarning>
          {value}
        </div>
      </div>
    </div>
  );
}
