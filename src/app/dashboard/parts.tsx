import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ArrowUpRight } from "lucide-react";

// Building blocks for the dashboard. Server components; no client JS.

type Tone = "brand" | "good" | "warn" | "critical" | "neutral";

const TONE: Record<Tone, { chip: string; text: string; bar: string }> = {
  brand: { chip: "bg-brand-bg text-brand", text: "text-brand", bar: "var(--brand-fill)" },
  good: { chip: "bg-good-bg text-good", text: "text-good", bar: "var(--good)" },
  warn: { chip: "bg-warn-bg text-warn", text: "text-warn", bar: "var(--warn)" },
  critical: { chip: "bg-critical-bg text-critical", text: "text-critical", bar: "var(--critical)" },
  neutral: { chip: "bg-surface-sunken text-ink-soft", text: "text-ink-soft", bar: "var(--ink-faint)" },
};

export function KpiTile({
  href,
  icon: Icon,
  label,
  value,
  sub,
  subTone = "neutral",
  tone = "brand",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  sub?: string;
  subTone?: Tone;
  tone?: Tone;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-5 no-underline shadow-sm transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className={`flex items-center justify-center w-9 h-9 rounded-md ${TONE[tone].chip}`}>
          <Icon size={17} strokeWidth={2} />
        </span>
        <ArrowUpRight
          size={16}
          className="text-ink-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        />
      </div>
      <div>
        <div className="font-display text-[2rem] leading-none font-semibold text-ink tabular-nums">
          {value.toLocaleString()}
        </div>
        <div className="mt-1.5 text-[0.82rem] font-medium text-ink-soft">{label}</div>
      </div>
      {sub && <div className={`text-[0.76rem] font-medium ${TONE[subTone].text}`}>{sub}</div>}
    </Link>
  );
}

export function Panel({
  title,
  subtitle,
  href,
  linkLabel = "View all",
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col rounded-lg border border-border bg-surface-raised shadow-sm ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h2 className="text-[0.98rem] font-semibold text-ink m-0">{title}</h2>
          {subtitle && <p className="text-[0.78rem] text-ink-faint mt-1 mb-0">{subtitle}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-[0.78rem] font-semibold text-ink-faint no-underline hover:text-brand"
          >
            {linkLabel} <ArrowRight size={13} />
          </Link>
        )}
      </header>
      <div className="flex-1 px-5 pb-5">{children}</div>
    </section>
  );
}

// The open PO pipeline as a row of stages, each sized against the busiest.
export function PipelineFlow({
  stages,
}: {
  stages: { key: string; label: string; count: number; href: string }[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
      {stages.map((s, i) => (
        <Link
          key={s.key}
          href={s.href}
          className="group flex flex-col justify-between gap-3 rounded-md border border-border bg-surface px-3 py-3 no-underline transition-colors duration-150 hover:border-brand min-h-[108px]"
        >
          <div className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-wide text-ink-faint">
            <span className="font-mono text-brand">{String(i + 1).padStart(2, "0")}</span>
          </div>
          <div>
            <div className="font-display text-[1.45rem] font-semibold leading-none text-ink tabular-nums">{s.count}</div>
            <div className="mt-1 text-[0.74rem] leading-tight text-ink-soft group-hover:text-ink">{s.label}</div>
          </div>
          <div className="h-1 w-full rounded-full bg-surface-sunken overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(s.count / max) * 100}%`, background: s.count ? "var(--brand-fill)" : "transparent" }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function AttentionList({
  items,
}: {
  items: { label: string; detail: string; count: number; href: string; icon: LucideIcon; tone: Tone }[];
}) {
  const open = items.filter((i) => i.count > 0);
  if (open.length === 0) {
    return (
      <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-good-bg text-good text-lg">✓</span>
        <div className="text-[0.88rem] font-semibold text-ink">All clear</div>
        <div className="text-[0.78rem] text-ink-faint">Nothing is waiting on anyone right now.</div>
      </div>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {open.map((i) => (
        <li key={i.label}>
          <Link
            href={i.href}
            className="group flex items-center gap-3 rounded-md px-2.5 py-2.5 no-underline transition-colors duration-150 hover:bg-surface-sunken"
          >
            <span className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-md ${TONE[i.tone].chip}`}>
              <i.icon size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.85rem] font-semibold text-ink">{i.label}</span>
              <span className="block truncate text-[0.74rem] text-ink-faint">{i.detail}</span>
            </span>
            <span className={`font-mono text-[0.95rem] font-semibold tabular-nums ${TONE[i.tone].text}`}>{i.count}</span>
            <ArrowRight size={14} className="shrink-0 text-ink-faint group-hover:text-brand" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// A single-value ring: the share of the catalog that's publish-ready.
export function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-[132px] h-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="12" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke="var(--good)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[1.6rem] font-semibold leading-none text-ink">{pct}%</span>
        <span className="mt-1 text-[0.68rem] uppercase tracking-wide text-ink-faint">{label}</span>
      </div>
    </div>
  );
}

export function LegendRow({ color, label, value, href }: { color: string; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-sm px-1.5 py-1 no-underline hover:bg-surface-sunken">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 text-[0.82rem] text-ink-soft">{label}</span>
      <span className="font-mono text-[0.85rem] font-semibold text-ink tabular-nums">{value.toLocaleString()}</span>
    </Link>
  );
}

export function CoverageBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[0.8rem]">
        <span className="font-medium text-ink-soft">{label}</span>
        <span className="font-mono text-ink tabular-nums">
          {pct}% <span className="text-ink-faint">· {value.toLocaleString()}</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-sunken overflow-hidden">
        <div className="h-full rounded-full bg-brand-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ago(d: Date | string | null | undefined, now: Date): string {
  if (!d) return "";
  const s = Math.max(0, Math.round((now.getTime() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
