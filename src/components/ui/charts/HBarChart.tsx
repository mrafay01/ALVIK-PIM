// Horizontal bar chart — no charting library in this repo, so this is a
// small hand-rolled SVG component matching the rest of the app's
// zero-extra-dependency style. Built for status/category breakdowns where
// labels are long (item statuses, PO statuses) — horizontal bars keep
// labels readable without truncation or rotation.
//
// Color: each bar's `tone` maps to the app's existing status tokens
// (good/warn/critical/brass/neutral) via CSS var(--*), so bars reuse the
// exact same palette as the Pill/StatCard components elsewhere in the app
// — no separate chart palette to keep in sync.
const TONE_VAR: Record<string, string> = {
  good: "var(--good)",
  warn: "var(--warn)",
  critical: "var(--critical)",
  brass: "var(--brass)",
  neutral: "var(--ink-faint)",
};

export type HBarDatum = {
  label: string;
  value: number;
  tone?: keyof typeof TONE_VAR;
};

export function HBarChart({
  data,
  height = 26,
  gap = 10,
  valueFormatter = (v: number) => v.toLocaleString(),
}: {
  data: HBarDatum[];
  height?: number;
  gap?: number;
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex flex-col" style={{ gap }}>
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        const color = TONE_VAR[d.tone ?? "neutral"];
        return (
          <div key={d.label} className="flex items-center gap-3">
            <div
              className="text-[0.78rem] text-ink-soft shrink-0 text-right"
              style={{ width: 132 }}
              title={d.label}
            >
              <span className="block truncate">{d.label}</span>
            </div>
            <div
              className="flex-1 min-w-0 rounded-sm bg-surface-sunken relative overflow-hidden"
              style={{ height }}
            >
              <div
                className="h-full rounded-sm flex items-center justify-end px-2 transition-[width] duration-300"
                style={{
                  width: `${Math.max(pct, d.value > 0 ? 3 : 0)}%`,
                  background: color,
                  minWidth: d.value > 0 ? 2 : 0,
                }}
              >
                {pct > 22 && (
                  <span className="text-[0.72rem] font-mono font-semibold text-surface whitespace-nowrap">
                    {valueFormatter(d.value)}
                  </span>
                )}
              </div>
              {pct <= 22 && (
                <span
                  className="absolute top-1/2 -translate-y-1/2 text-[0.72rem] font-mono font-semibold text-ink-soft whitespace-nowrap"
                  style={{ left: `calc(${Math.max(pct, d.value > 0 ? 3 : 0)}% + 8px)` }}
                >
                  {valueFormatter(d.value)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
