// Donut chart for categorical composition (item origin, catalog approval
// mix, etc). Hand-rolled SVG — no charting library in this repo.
//
// Color: slots pull from a fixed, validated 8-hue categorical order (see
// node scripts/validate_palette.js in the dataviz skill — this exact
// sequence passes CVD-separation, contrast and lightness-band checks
// against this app's dark chart surfaces). Assigned in order, never
// cycled or re-picked per chart, so identity stays consistent.
const CATEGORICAL = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
];

export type DonutDatum = { label: string; value: number };

const R = 60;
const STROKE = 22;
const CIRC = 2 * Math.PI * R;

export function DonutChart({
  data,
  valueFormatter = (v: number) => v.toLocaleString(),
}: {
  data: DonutDatum[];
  valueFormatter?: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox="0 0 160 160" width={160} height={160} className="shrink-0">
        <g transform="translate(80,80) rotate(-90)">
          <circle r={R} fill="none" stroke="var(--surface-sunken)" strokeWidth={STROKE} />
          {total === 0 ? null : (
            data
              .filter((d) => d.value > 0)
              .map((d, i) => {
                const frac = d.value / total;
                const dash = frac * CIRC;
                const el = (
                  <circle
                    key={d.label}
                    r={R}
                    fill="none"
                    stroke={CATEGORICAL[i % CATEGORICAL.length]}
                    strokeWidth={STROKE}
                    strokeDasharray={`${dash} ${CIRC - dash}`}
                    strokeDashoffset={-offset}
                    strokeLinecap={data.filter((x) => x.value > 0).length > 1 ? "butt" : "round"}
                  >
                    <title>{`${d.label}: ${valueFormatter(d.value)}`}</title>
                  </circle>
                );
                offset += dash + 2; // 2px surface gap between adjacent segments
                return el;
              })
          )}
        </g>
        <text
          x={80}
          y={76}
          textAnchor="middle"
          className="font-mono font-bold"
          style={{ fontSize: 22, fill: "var(--ink)" }}
        >
          {total.toLocaleString()}
        </text>
        <text
          x={80}
          y={94}
          textAnchor="middle"
          className="font-body"
          style={{ fontSize: 10, fill: "var(--ink-faint)" }}
        >
          total
        </text>
      </svg>

      <div className="flex flex-col gap-2 min-w-0">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-[0.82rem]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: CATEGORICAL[i % CATEGORICAL.length] }}
            />
            <span className="text-ink-soft truncate">{d.label}</span>
            <span className="font-mono text-ink font-semibold ml-auto pl-3">
              {valueFormatter(d.value)}
            </span>
            <span className="text-ink-faint text-[0.72rem] w-10 text-right">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
