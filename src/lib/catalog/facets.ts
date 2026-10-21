import { unstable_cache, revalidateTag } from "next/cache";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";

// Whole-catalog lookups the Catalog page needs on every render: the headline
// counts, the filter dropdown values and which base SKUs have more than one
// member (a real variation family). They read every catalog item, so they're
// cached for up to two minutes, and every route that adds or changes catalog
// items calls refreshCatalogFacets() so a change shows up straight away.
const TAG = "catalog-facets";

export type CatalogFacets = {
  counts: { total: number; complete: number; incomplete: number; pendingApproval: number };
  familySkus: string[];
  categories: string[];
  brands: string[];
  platings: string[];
};

export const loadCatalogFacets = unstable_cache(
  async (): Promise<CatalogFacets> => {
    await connectDB();
    const [totals, families, categories, brands, platings] = await Promise.all([
      Item.aggregate<{ total: number; complete: number; pendingApproval: number }>([
        { $match: { inCatalog: true } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            complete: { $sum: { $cond: ["$masterRecordComplete", 1, 0] } },
            pendingApproval: { $sum: { $cond: [{ $eq: ["$catalogApproval.status", "pending"] }, 1, 0] } },
          },
        },
      ]),
      Item.aggregate<{ _id: string }>([
        { $match: { inCatalog: true, baseSku: { $ne: null } } },
        { $group: { _id: "$baseSku", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $project: { _id: 1 } },
      ]),
      Item.distinct("category", { inCatalog: true }),
      Item.distinct("brand", { inCatalog: true }),
      Item.distinct("specs.plating", { inCatalog: true }),
    ]);
    const clean = (values: unknown[]) => values.filter((v): v is string => typeof v === "string" && v !== "");
    const t = totals[0] ?? { total: 0, complete: 0, pendingApproval: 0 };
    return {
      counts: {
        total: t.total,
        complete: t.complete,
        incomplete: t.total - t.complete,
        pendingApproval: t.pendingApproval,
      },
      familySkus: families.map((r) => r._id),
      categories: clean(categories).sort(),
      brands: clean(brands).sort((a, b) => a.localeCompare(b)),
      platings: clean(platings).sort(),
    };
  },
  // Bump the version when the result's shape changes, so an entry cached in
  // the old shape is never served to new code.
  [TAG, "v2"],
  { revalidate: 120, tags: [TAG] }
);

export function refreshCatalogFacets(): void {
  revalidateTag(TAG);
}
