import { Card } from "@/components/ui/Card";

// Standard section header used across the item detail view (and reused by
// the edit form) — an icon, a title, an optional right-aligned meta note,
// consistent top padding/border so every card in a long detail page reads
// as part of one system instead of ad hoc <h2>s with slightly different
// spacing each time.
export function SectionCard({
  title,
  icon,
  meta,
  children,
  id,
}: {
  title: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card padding={0} className="overflow-hidden">
      <div id={id} className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-border scroll-mt-20">
        <h2 className="flex items-center gap-2 text-[0.92rem] font-semibold m-0">
          {icon && <span className="text-brand shrink-0 flex items-center">{icon}</span>}
          {title}
        </h2>
        {meta && <div className="text-[0.76rem] text-ink-faint shrink-0">{meta}</div>}
      </div>
      <div className="px-5 sm:px-6 py-5">{children}</div>
    </Card>
  );
}

// A responsive label/value grid for read-only fields — collapses to a
// single column on narrow screens rather than squeezing 190px cells.
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">{children}</div>
  );
}

export function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">{label}</span>
      <span className={`text-[0.87rem] break-words ${isEmpty ? "text-ink-faint" : "text-ink"}`}>
        {isEmpty ? "—" : value}
      </span>
    </div>
  );
}
