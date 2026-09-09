type PillTone = "good" | "warn" | "critical" | "neutral" | "brass";

const TONE_CLASSES: Record<PillTone, string> = {
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  critical: "bg-critical-bg text-critical",
  neutral: "bg-neutral-pill text-ink-soft",
  brass: "bg-brass-bg text-brass",
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
      className={`inline-flex items-center gap-1.5 font-mono text-[0.72rem] font-semibold tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  );
}
