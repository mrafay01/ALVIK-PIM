import { Types } from "mongoose";
import Item from "@/models/Item";
import ImportBatchRow from "@/models/ImportBatchRow";
import { loadCatalogFacets } from "@/lib/catalog/facets";
import { parseCatalogQuery, catalogMatch, catalogPriceMatch, LATEST_MSRP, type CatalogFilterParams } from "@/lib/catalog/listQuery";
import { masterFileFieldLabel } from "@/lib/import/parseMasterFile";
import {
  MAX_EXPORT_ITEMS,
  recordFromItem,
  recordFromStagedRow,
  type ExportRow,
  type ExportableItem,
} from "@/lib/catalog/masterFileExport";

// Loads what the catalog export writes. A SKU is exported from its item
// when one exists; a SKU that is only a Master File row not yet in the
// catalog (in Flagged Items, or still on its import's review page) is
// exported from that row. "Flagged" means the SKU has such a row that is
// in Flagged Items or carries an issue, whether or not it's also in the
// catalog (e.g. a re-import waiting to be fixed).

// SKUs are matched ignoring case, like people type them.
const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;

// Uncommitted, not-excluded Master File rows.
const STAGED_PENDING = { committedItemId: null, reviewStatus: { $ne: "rejected" } };

const ITEM_FIELDS =
  "itemNumber title description title2 description2 brand category upc specs pricingHistory inCatalog";

type StagedRow = {
  _id: Types.ObjectId;
  coerced?: Record<string, unknown>;
  flags?: { field: string; message: string; rawValue?: unknown }[];
  parkedAt?: Date | null;
};

type StagedInfo = { row: StagedRow; flagged: boolean; parked: boolean; issues: string[] };

const key = (sku: string) => sku.trim().toLowerCase();

function issuesOf(rows: StagedRow[]): string[] {
  const out = new Set<string>();
  for (const r of rows) for (const f of r.flags ?? []) out.add(`${masterFileFieldLabel(f.field)}: ${f.message}`);
  return [...out];
}

// The newest pending row per SKU, plus whether any pending row for it is flagged.
async function stagedBySku(skus: string[]): Promise<Map<string, StagedInfo>> {
  const out = new Map<string, StagedInfo>();
  if (skus.length === 0) return out;
  const rows = (await ImportBatchRow.find({ ...STAGED_PENDING, "coerced.itemNumber": { $in: skus } })
    .select("coerced flags parkedAt")
    .sort({ _id: -1 })
    .collation(CASE_INSENSITIVE)
    .lean()) as unknown as StagedRow[];
  const groups = new Map<string, StagedRow[]>();
  for (const r of rows) {
    const sku = r.coerced?.itemNumber;
    if (typeof sku !== "string") continue;
    const list = groups.get(key(sku)) ?? [];
    list.push(r);
    groups.set(key(sku), list);
  }
  for (const [k, list] of groups) {
    const flaggedRows = list.filter((r) => r.parkedAt || (r.flags?.length ?? 0) > 0);
    out.set(k, {
      row: list[0],
      flagged: flaggedRows.length > 0,
      parked: list.some((r) => !!r.parkedAt),
      issues: issuesOf(flaggedRows),
    });
  }
  return out;
}

// Items by SKU (ignoring case); an exact-case match wins over another case.
async function itemsBySku(skus: string[]): Promise<Map<string, ExportableItem & { _id: Types.ObjectId }>> {
  const out = new Map<string, ExportableItem & { _id: Types.ObjectId }>();
  if (skus.length === 0) return out;
  const exact = new Set(skus);
  const items = (await Item.find({ itemNumber: { $in: skus } })
    .select(ITEM_FIELDS)
    .collation(CASE_INSENSITIVE)
    .lean()) as unknown as (ExportableItem & { _id: Types.ObjectId; itemNumber: string })[];
  for (const it of items) {
    const k = key(it.itemNumber);
    if (!out.has(k) || exact.has(it.itemNumber)) out.set(k, it);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 2 of the SKU-list export: what each listed SKU was found as.

export type SkuLookup = {
  sku: string; // as listed in the file
  matchedSku: string | null; // as stored (may differ in case)
  status: "catalog" | "unverified" | "staged" | "not_found";
  title: string | null;
  flagged: boolean;
  parked: boolean; // in Flagged Items
  issues: string[];
};

export async function lookupSkus(skus: string[]): Promise<SkuLookup[]> {
  const [items, staged] = await Promise.all([itemsBySku(skus), stagedBySku(skus)]);
  return skus.map((sku) => {
    const item = items.get(key(sku));
    const st = staged.get(key(sku));
    const base = { sku, flagged: !!st?.flagged, parked: !!st?.parked, issues: st?.flagged ? st.issues : [] };
    if (item) {
      return {
        ...base,
        matchedSku: String(item.itemNumber),
        status: item.inCatalog ? ("catalog" as const) : ("unverified" as const),
        title: (item.title as string | undefined) ?? null,
      };
    }
    if (st) {
      return {
        ...base,
        matchedSku: String(st.row.coerced?.itemNumber ?? sku),
        status: "staged" as const,
        title: (st.row.coerced?.title as string | undefined) ?? null,
      };
    }
    return { ...base, matchedSku: null, status: "not_found" as const, title: null };
  });
}

// ---------------------------------------------------------------------------
// The export itself.

export type ExportSelection =
  | { kind: "items"; itemIds: string[] }
  | { kind: "skus"; skus: string[] }
  | { kind: "filters"; filters: CatalogFilterParams };

export class TooManyToExport extends Error {}

// The catalog items an "items" or "filters" selection means, in SKU order.
async function selectedItems(selection: Exclude<ExportSelection, { kind: "skus" }>) {
  let match: Record<string, unknown>;
  let priceMatch: Record<string, unknown> | null = null;
  if (selection.kind === "items") {
    match = { _id: { $in: selection.itemIds.map((id) => new Types.ObjectId(id)) } };
  } else {
    const query = parseCatalogQuery(selection.filters);
    const { familySkus } = await loadCatalogFacets();
    match = catalogMatch(query, familySkus);
    priceMatch = catalogPriceMatch(query);
  }
  const projection = Object.fromEntries(ITEM_FIELDS.split(" ").map((f) => [f, 1]));
  const items = await Item.aggregate<ExportableItem & { itemNumber?: string }>([
    { $match: match },
    ...(priceMatch ? [{ $addFields: { latestMsrp: LATEST_MSRP } }, { $match: priceMatch }] : []),
    { $sort: { itemNumber: 1 } },
    { $limit: MAX_EXPORT_ITEMS + 1 },
    { $project: projection },
  ]).collation({ locale: "en", numericOrdering: true });
  if (items.length > MAX_EXPORT_ITEMS) throw new TooManyToExport();
  return items;
}

export async function loadExportRows(selection: ExportSelection): Promise<{ rows: ExportRow[]; notFound: string[] }> {
  if (selection.kind === "skus") {
    // In the order of the list; re-looked-up here rather than trusting the
    // screen's earlier answer.
    const [items, staged] = await Promise.all([itemsBySku(selection.skus), stagedBySku(selection.skus)]);
    const rows: ExportRow[] = [];
    const notFound: string[] = [];
    const done = new Set<string>();
    for (const sku of selection.skus) {
      const k = key(sku);
      if (done.has(k)) continue;
      done.add(k);
      const item = items.get(k);
      const st = staged.get(k);
      const flaggedIssues = st?.flagged ? st.issues : null;
      if (item) rows.push({ values: recordFromItem(item), flaggedIssues });
      else if (st) rows.push({ values: recordFromStagedRow(st.row), flaggedIssues });
      else notFound.push(sku);
    }
    return { rows, notFound };
  }

  const items = await selectedItems(selection);
  const staged = await stagedBySku(items.map((it) => it.itemNumber).filter((s): s is string => !!s));
  return {
    rows: items.map((it) => {
      const st = it.itemNumber ? staged.get(key(it.itemNumber)) : undefined;
      return { values: recordFromItem(it), flaggedIssues: st?.flagged ? st.issues : null };
    }),
    notFound: [],
  };
}
