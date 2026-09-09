import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Server-rendered pager for the list screens. Given the current page, the
// page size, and the total row count, it renders Prev/Next links that carry
// the existing query string forward (so a ?status= or ?filter= filter isn't
// dropped when you page).

export const PAGE_SIZE = 50;

export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function Pagination({
  page,
  pageSize = PAGE_SIZE,
  total,
  basePath,
  query = {},
}: {
  page: number;
  pageSize?: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const to = Math.min(clampedPage * pageSize, total);

  function href(targetPage: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v) params.set(k, v);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const linkClass =
    "flex items-center gap-1 px-3 py-1.5 rounded-sm border border-border-strong text-[0.82rem] no-underline text-ink-soft";
  const disabledClass = "opacity-40 pointer-events-none";

  return (
    <div className="flex items-center justify-between mt-4 text-[0.82rem] text-ink-faint">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex gap-1.5">
        <Link
          href={href(clampedPage - 1)}
          className={`${linkClass} ${clampedPage <= 1 ? disabledClass : ""}`}
          aria-disabled={clampedPage <= 1}
        >
          <ChevronLeft size={14} /> Prev
        </Link>
        <span className="flex items-center px-2 font-mono">
          {clampedPage} / {pageCount}
        </span>
        <Link
          href={href(clampedPage + 1)}
          className={`${linkClass} ${clampedPage >= pageCount ? disabledClass : ""}`}
          aria-disabled={clampedPage >= pageCount}
        >
          Next <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
