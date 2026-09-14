// Vertical bar chart for a short time series (weekly item/PO volume over
// the last ~12 weeks). Hand-rolled SVG, single-hue (brass — this app's
// accent) since it's one series, not a categorical breakdown.
export type TrendDatum = { label: string; value: number };

export function TrendBars({
  data,
  height = 120,
}: {
  data: TrendDatum[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex items-end gap-1.5" style={{ height: height + 24 }}>
      {data.map((d) => {
        const barH = Math.max((d.value / max) * height, d.value > 0 ? 3 : 1);
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0" style={{ height: height + 24 }}>
            <span className="text-[0.68rem] font-mono text-ink-faint">{d.value > 0 ? d.value : ""}</span>
            <div
              className="w-full rounded-t-sm"
              style={{
                height: barH,
                background: d.value > 0 ? "var(--brass)" : "var(--border)",
                minHeight: 2,
              }}
              title={`${d.label}: ${d.value}`}
            />
            <span className="text-[0.66rem] text-ink-faint whitespace-nowrap">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
