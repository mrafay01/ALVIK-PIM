import { Card } from "@/components/ui/Card";

// Read-only mirror of the collapsible <Section> in NewCatalogItemForm, minus
// the client-side open/close state — a plain <details> gets the same
// disclosure UI without needing "use client" on a page that's otherwise a
// server component.
export function ItemDetailSection({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card padding={0}>
      <details open={defaultOpen}>
        <summary className="flex items-center gap-2 px-[22px] py-[18px] cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="text-ink-faint text-[0.7rem] transition-transform details-chevron">▶</span>
          <h2 className="text-[0.95rem] m-0">{title}</h2>
          {hint && <span className="text-[0.78rem] text-ink-faint ml-1">— {hint}</span>}
        </summary>
        <div className="px-[22px] pb-[22px] grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-5 gap-y-3.5">
          {children}
        </div>
      </details>
    </Card>
  );
}

export function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">{label}</span>
      <span className={`text-[0.86rem] ${isEmpty ? "text-ink-faint" : "text-ink"}`}>{isEmpty ? "—" : value}</span>
    </div>
  );
}
