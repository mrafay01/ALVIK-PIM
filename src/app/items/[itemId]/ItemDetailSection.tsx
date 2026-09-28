import { Card } from "@/components/ui/Card";

// Collapsible variant of SectionCard for the denser jewelry-spec groups —
// a plain <details> gets native disclosure behavior without needing
// "use client" on a page that's otherwise a server component.
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
    <Card padding={0} className="overflow-hidden">
      <details open={defaultOpen} className="group">
        <summary className="flex items-center gap-2 px-5 sm:px-6 py-4 cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden hover:bg-surface-sunken transition-colors duration-150">
          <span className="text-ink-faint text-[0.7rem] transition-transform details-chevron shrink-0">▶</span>
          <h2 className="text-[0.92rem] font-semibold m-0">{title}</h2>
          {hint && <span className="text-[0.78rem] text-ink-faint ml-1 truncate">({hint})</span>}
        </summary>
        <div className="px-5 sm:px-6 pb-5 pt-1 border-t border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {children}
        </div>
      </details>
    </Card>
  );
}
