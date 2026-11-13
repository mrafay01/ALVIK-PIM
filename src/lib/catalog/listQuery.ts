// The Catalog list's filters, shared by the page and the catalog export's
// "all matching" option, so an export of "these filters" is exactly the rows
// the list shows.

export type CatalogTab = "all" | "incomplete" | "pending" | "variations" | "inactive";

export type CatalogFilterParams = {
  filter?: string;
  q?: string;
  category?: string;
  brand?: string;
  plating?: string;
  minPrice?: string;
  maxPrice?: string;
};

export type CatalogListQuery = {
  tab: CatalogTab;
  q: string;
  category: string;
  brand: string;
  plating: string;
  minPrice: number | null;
  maxPrice: number | null;
};

const TABS: CatalogTab[] = ["all", "incomplete", "pending", "variations", "inactive"];

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseCatalogQuery(sp: CatalogFilterParams): CatalogListQuery {
  return {
    tab: TABS.includes(sp.filter as CatalogTab) ? (sp.filter as CatalogTab) : "all",
    q: (sp.q ?? "").trim(),
    category: (sp.category ?? "").trim(),
    brand: (sp.brand ?? "").trim(),
    plating: (sp.plating ?? "").trim(),
    minPrice: num(sp.minPrice),
    maxPrice: num(sp.maxPrice),
  };
}

// Escape a user string for safe use inside a MongoDB $regex.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The $match on items (always inCatalog). familySkus: base SKUs with more
// than one member, for the variations tab (lib/catalog/facets.ts).
export function catalogMatch(query: CatalogListQuery, familySkus: string[]): Record<string, unknown> {
  const match: Record<string, unknown> = { inCatalog: true };
  if (query.tab === "incomplete") match.masterRecordComplete = false;
  if (query.tab === "pending") match["catalogApproval.status"] = "pending";
  if (query.tab === "variations") match.baseSku = { $in: familySkus };
  if (query.tab === "inactive") match.active = false;
  if (query.category) match.category = query.category;
  if (query.brand) match.brand = query.brand;
  if (query.plating) match["specs.plating"] = query.plating;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    match.$or = [{ itemNumber: rx }, { title: rx }, { brand: rx }, { upc: rx }];
  }
  return match;
}

// The latest pricing entry's MSRP, computed in the pipeline for the price
// filter and sort.
export const LATEST_MSRP = { $ifNull: [{ $last: "$pricingHistory.msrp" }, null] };

// The $match on latestMsrp for the price range, or null when there's none.
export function catalogPriceMatch(query: CatalogListQuery): Record<string, unknown> | null {
  const m: Record<string, unknown> = {};
  if (query.minPrice != null) m.$gte = query.minPrice;
  if (query.maxPrice != null) m.$lte = query.maxPrice;
  return Object.keys(m).length > 0 ? { latestMsrp: m } : null;
}
