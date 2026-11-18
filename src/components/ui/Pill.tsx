type PillTone = "good" | "warn" | "critical" | "neutral" | "brand";

const TONE_CLASSES: Record<PillTone, string> = {
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  critical: "bg-critical-bg text-critical",
  neutral: "bg-neutral-pill text-ink-soft",
  brand: "bg-brand-bg text-brand",
};

export function Pill({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-display text-[0.75rem] font-semibold leading-none px-2.5 py-[5px] rounded-full whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  );
}
