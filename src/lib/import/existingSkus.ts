import Item from "@/models/Item";

export type ExistingSku = { sku: string; inCatalog: boolean };

// Which of these staged SKUs already belong to an item, matched ignoring
// capitals as the commit does (lib/import/commitRows.ts). Keyed by the
// lower-case SKU. The review screens show it per row: committing such a
// row updates that item instead of creating one.
export async function existingItemsBySku(skus: unknown[]): Promise<Map<string, ExistingSku>> {
  const list = [...new Set(skus.filter((s): s is string => typeof s === "string" && s.trim() !== ""))];
  if (list.length === 0) return new Map();
  const items = await Item.find({ itemNumber: { $in: list } })
    .collation({ locale: "en", strength: 2 })
    .select("itemNumber inCatalog")
    .lean();
  return new Map(
    items.map((it) => [String(it.itemNumber).toLowerCase(), { sku: String(it.itemNumber), inCatalog: it.inCatalog === true }])
  );
}
