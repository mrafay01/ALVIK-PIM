import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import Item from "@/models/Item";
import { applyRowToItem } from "@/lib/quote-import/applyToItem";
import { splitSku } from "@/lib/catalog/sku";

const QUOTE_ROLES = ["buying_purchasing", "buyer_merchandiser", "marketplace_listing"] as const;

// POST: write every approved, not-yet-committed row of this quote into
// `items` as a new quoted item (status "quoted" — the start of the pilot
// lifecycle, same as the manual intake form). Safe to re-run: committed
// rows are skipped. Rows sharing a CZ item number merge into one item so a
// duplicate line can't collide on the unique index.
//
// Batched like the legacy import commit: one query for existing items, then
// a single bulkWrite, rather than a save() per row.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ quotationId: string }> }
) {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;

  const { quotationId } = await params;
  await connectDB();
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const toCommit = await QuotationRow.find({
    quotationId,
    reviewStatus: "approved",
    committedItemId: null,
  })
    .sort({ rowNumber: 1 })
    .lean();

  // A row's identity is its CZ item number if it has one, otherwise the
  // vendor's own item number (many quote sheets have no CZ number yet — it's
  // assigned in a later step). Key rows as "cz:<n>" or "vsku:<n>" so the two
  // namespaces can't collide, and so the right existing-item lookup is used
  // for each.
  const errors: { rowId: string; message: string }[] = [];
  type Row = (typeof toCommit)[number];
  const rowsByKey = new Map<string, Row[]>();
  for (const row of toCommit) {
    const c = (row.coerced ?? {}) as Record<string, unknown>;
    const cz = typeof c.itemNumber === "string" ? c.itemNumber.trim() : "";
    const vsku = typeof c.vendorSku === "string" ? c.vendorSku.trim() : "";
    const key = cz ? `cz:${cz}` : vsku ? `vsku:${vsku}` : "";
    if (!key) {
      errors.push({ rowId: String(row._id), message: "Row has no CZ item number and no vendor item# — cannot commit" });
      continue;
    }
    const group = rowsByKey.get(key);
    if (group) group.push(row);
    else rowsByKey.set(key, [row]);
  }

  const czNumbers = [...rowsByKey.keys()].filter((k) => k.startsWith("cz:")).map((k) => k.slice(3));
  const vskus = [...rowsByKey.keys()].filter((k) => k.startsWith("vsku:")).map((k) => k.slice(5));
  const [existingByCz, existingByVsku] = await Promise.all([
    czNumbers.length ? Item.find({ itemNumber: { $in: czNumbers } }) : Promise.resolve([]),
    vskus.length
      ? Item.find({ vendorId: quotation.vendorId, vendorSku: { $in: vskus }, itemNumber: null })
      : Promise.resolve([]),
  ]);
  const czMap = new Map(existingByCz.map((it) => [`cz:${it.itemNumber}`, it]));
  const vskuMap = new Map(existingByVsku.map((it) => [`vsku:${it.vendorSku}`, it]));

  type InsertOp = { insertOne: { document: Record<string, unknown> } };
  type UpdateOp = { updateOne: { filter: { _id: unknown }; update: Record<string, unknown> } };
  const ops: (InsertOp | UpdateOp)[] = [];
  const opKeys: string[] = [];
  const rowTarget = new Map<string, Types.ObjectId>();
  let created = 0;
  let merged = 0;

  for (const [key, groupRows] of rowsByKey) {
    const doc = key.startsWith("cz:") ? czMap.get(key) : vskuMap.get(key);

    if (doc) {
      // Merge onto a plain copy so partial dot-paths (specs.ringSize) don't
      // replace whole subdocuments (specs) — applyRowToItem deep-sets.
      const plain = doc.toObject({ depopulate: true }) as Record<string, unknown>;
      if (!Array.isArray(plain.pricingHistory)) plain.pricingHistory = [];
      for (const row of groupRows) {
        const entry = applyRowToItem(plain, (row.coerced ?? {}) as Record<string, unknown>);
        if (entry) (plain.pricingHistory as Record<string, unknown>[]).push(entry);
      }
      if (!plain.vendorId) plain.vendorId = quotation.vendorId;
      for (const row of groupRows) rowTarget.set(String(row._id), doc._id);
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: plain } } });
      opKeys.push(key);
      merged += 1;
    } else {
      const fresh: Record<string, unknown> = {
        status: "quoted",
        // A quote never puts an item in the catalog directly — someone
        // submits it and an admin approves (see the submit-to-catalog /
        // catalog-approve routes).
        origin: "quotation",
        vendorId: quotation.vendorId,
        pricingHistory: [] as Record<string, unknown>[],
      };
      // Only set itemNumber for CZ-keyed rows; vendor-SKU-only rows leave it
      // unset so the later CZ-assignment step fills it (and so two such rows
      // can't collide on the unique sparse index).
      if (key.startsWith("cz:")) {
        const num = key.slice(3);
        fresh.itemNumber = num;
        const s = splitSku(num);
        fresh.baseSku = s.baseSku;
        fresh.variantSuffix = s.variantSuffix;
      }
      for (const row of groupRows) {
        const entry = applyRowToItem(fresh, (row.coerced ?? {}) as Record<string, unknown>);
        if (entry) (fresh.pricingHistory as Record<string, unknown>[]).push(entry);
      }
      ops.push({ insertOne: { document: fresh } });
      opKeys.push(key);
      created += 1;
    }
  }

  let bulkResult;
  if (ops.length > 0) {
    try {
      bulkResult = await Item.bulkWrite(ops as never, { ordered: false });
    } catch (err) {
      const writeErrors = (err as { writeErrors?: { errmsg?: string }[] }).writeErrors ?? [];
      if (writeErrors.length === 0) throw err;
      for (const we of writeErrors) errors.push({ rowId: "(batch)", message: we.errmsg ?? "write failed" });
    }
  }

  if (bulkResult?.insertedIds) {
    for (const [opIndex, itemId] of Object.entries(bulkResult.insertedIds)) {
      const key = opKeys[Number(opIndex)];
      rowsByKey.get(key)?.forEach((row) => rowTarget.set(String(row._id), itemId as Types.ObjectId));
    }
  }

  const rowOps = [...rowTarget.entries()].map(([rowId, itemId]) => ({
    updateOne: { filter: { _id: rowId }, update: { $set: { committedItemId: itemId } } },
  }));
  if (rowOps.length > 0) await QuotationRow.bulkWrite(rowOps, { ordered: false });

  // Link every distinct item this commit produced back onto the quotation.
  const newItemIds = [...new Set([...rowTarget.values()].map(String))].map((id) => new Types.ObjectId(id));
  if (newItemIds.length > 0) {
    await Quotation.updateOne(
      { _id: quotationId },
      { $addToSet: { itemIds: { $each: newItemIds } } }
    );
  }

  const remaining = await QuotationRow.countDocuments({
    quotationId,
    reviewStatus: { $ne: "rejected" },
    committedItemId: null,
  });
  if (remaining === 0) {
    quotation.status = "committed";
    quotation.importStatus = "imported";
    await quotation.save();
  }

  return NextResponse.json({
    committed: rowTarget.size,
    created,
    merged,
    errors,
    remaining: toCommit.length - rowTarget.size - errors.length,
  });
}
