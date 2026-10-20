// Filters, search and sorting for the Master File import review screen,
// shared by the page (to list rows) and the bulk-decision API (to act on
// "every row matching this filter"), so both always mean the same rows.

export const REVIEW_STATUS_FILTERS = ["all", "flagged", "needs_review", "approved", "rejected"] as const;
export type ReviewStatusFilter = (typeof REVIEW_STATUS_FILTERS)[number];

export const REVIEW_SORTS = {
  row: { label: "File order", sort: { rowNumber: 1 } },
  sku: { label: "SKU (A–Z)", sort: { "coerced.itemNumber": 1, rowNumber: 1 } },
  sku_desc: { label: "SKU (Z–A)", sort: { "coerced.itemNumber": -1, rowNumber: 1 } },
  // A row with no flags has no flags.0, which sorts lowest, so descending
  // puts flagged rows first.
  flagged: { label: "Flagged first", sort: { "flags.0": -1, rowNumber: 1 } },
} as const satisfies Record<string, { label: string; sort: Record<string, 1 | -1> }>;
export type ReviewSort = keyof typeof REVIEW_SORTS;

export type ReviewParams = {
  filter: ReviewStatusFilter;
  q: string;
  category: string;
  brand: string;
  sort: ReviewSort;
};

export function parseReviewParams(sp: Record<string, unknown>): ReviewParams {
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  const filter = str(sp.filter);
  const sort = str(sp.sort);
  return {
    filter: (REVIEW_STATUS_FILTERS as readonly string[]).includes(filter) ? (filter as ReviewStatusFilter) : "all",
    q: str(sp.q),
    category: str(sp.category),
    brand: str(sp.brand),
    sort: sort in REVIEW_SORTS ? (sort as ReviewSort) : "row",
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function reviewQuery(batchId: string, p: ReviewParams): Record<string, unknown> {
  const query: Record<string, unknown> = { batchId };
  if (p.filter === "flagged") query["flags.0"] = { $exists: true };
  if (p.filter === "needs_review" || p.filter === "approved" || p.filter === "rejected") {
    query.reviewStatus = p.filter;
  }
  if (p.category) query["coerced.category"] = p.category;
  if (p.brand) query["coerced.brand"] = p.brand;
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), "i");
    query.$or = [{ "coerced.itemNumber": rx }, { "coerced.title": rx }];
  }
  return query;
}

// URL query for a set of params, leaving out defaults.
export function reviewSearch(p: ReviewParams, page?: number): string {
  const sp = new URLSearchParams();
  if (p.filter !== "all") sp.set("filter", p.filter);
  if (p.q) sp.set("q", p.q);
  if (p.category) sp.set("category", p.category);
  if (p.brand) sp.set("brand", p.brand);
  if (p.sort !== "row") sp.set("sort", p.sort);
  if (page && page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
