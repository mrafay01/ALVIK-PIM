import { NextRequest, NextResponse } from "next/server";
import { Types, type HydratedDocument } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import Quotation, { type QuotationDoc } from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import Item from "@/models/Item";
import CatalogConflict from "@/models/CatalogConflict";
import { applyRowToItem } from "@/lib/quote-import/applyToItem";
import { reconcileRowAgainstCatalogItem } from "@/lib/catalog/reconcile";
import { splitSku } from "@/lib/catalog/sku";
import { attachQuotationToPurchaseOrder } from "@/lib/purchase-orders/fromQuotation";
import logger from "@/lib/logger";
import { isObjectId } from "@/lib/ids";
import { refreshCatalogFacets } from "@/lib/catalog/facets";

const QUOTE_ROLES = ROLE_SETS.quotes;
const COMMIT_LOCK_TTL_MS = 5 * 60 * 1000;

// Fields a quote row never writes. Left out of the merge's $set so a
// photo upload, conflict resolution or catalog decision that lands while
// this commit is running isn't overwritten with the stale copy read here.
const NOT_FROM_QUOTE = [
  "_id",
  "__v",
  "createdAt",
  "updatedAt",
  "media",
  "imageCompleteness",
  "conflictCount",
  "inCatalog",
  "catalogApproval",
  "catalogSubmittedAt",
  "active",
  "marketplaceDescriptions",
  "lastEditedBy",
];

// POST: write every approved, not-yet-committed row of this quote.
//
// Two branches, per the model agreed on 2026-10-12:
//   - Row targets an existing in-catalog item → RECONCILE: non-
//     authoritative fields merge in-place as before, but every
//     authoritative-field divergence becomes a CatalogConflict doc
//     and the item's stored value is left untouched. The row still
//     gets committedItemId set so it's not re-committed, but it also
//     carries conflict ids for the review page's badge.
//   - Everything else (new item, or existing not-in-catalog item) →
//     unchanged behaviour: dot-set every value, pipeline builds the
//     item up.
//
// Safe to re-run: committed rows are skipped.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ quotationId: string }> }
) {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;

  const { quotationId } = await params;
  if (!isObjectId(quotationId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  const exists = await Quotation.exists({ _id: quotationId });
  if (!exists) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  // One commit per quote at a time — see Quotation.commitLockedAt.
  const now = new Date();
  const quotation = await Quotation.findOneAndUpdate(
    {
      _id: quotationId,
      $or: [
        { commitLockedAt: null },
        { commitLockedAt: { $lt: new Date(now.getTime() - COMMIT_LOCK_TTL_MS) } },
      ],
    },
    { $set: { commitLockedAt: now } },
    { new: true, timestamps: false }
  );
  if (!quotation) {
    return NextResponse.json(
      { error: "This quote is already being committed. Wait a moment and refresh the page." },
      { status: 409 }
    );
  }

  try {
    const res = await commitQuotation(quotation, quotationId);
    refreshCatalogFacets();
    return res;
  } finally {
    await Quotation.updateOne(
      { _id: quotationId, commitLockedAt: now },
      { $unset: { commitLockedAt: "" } },
      { timestamps: false }
    );
  }
}

async function commitQuotation(
  quotation: HydratedDocument<QuotationDoc>,
  quotationId: string
) {
  const toCommit = await QuotationRow.find({
    quotationId,
    reviewStatus: "approved",
    committedItemId: null,
  })
    .select("rowNumber coerced")
    .sort({ rowNumber: 1 })
    .lean();

  const errors: { rowId: string; message: string }[] = [];
  type Row = (typeof toCommit)[number];
  const rowsByKey = new Map<string, Row[]>();
  for (const row of toCommit) {
    const c = (row.coerced ?? {}) as Record<string, unknown>;
    const cz = typeof c.itemNumber === "string" ? c.itemNumber.trim() : "";
    const vsku = typeof c.vendorSku === "string" ? c.vendorSku.trim() : "";
    const key = cz ? `cz:${cz}` : vsku ? `vsku:${vsku}` : "";
    if (!key) {
      errors.push({ rowId: String(row._id), message: "Row has no CZ item number and no vendor item#; cannot commit" });
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
  const opTargets: Types.ObjectId[] = [];
  const rowTarget = new Map<string, Types.ObjectId>();
  // Conflicts to persist after the item write finishes — one entry per
  // divergent authoritative field. itemId is the TARGET item's _id,
  // which we already have for the "existing in-catalog" branch below
  // (newly inserted items can't produce conflicts since they have no
  // prior catalog value to compare against).
  type PendingConflict = {
    rowId: Types.ObjectId;
    itemId: Types.ObjectId;
    field: string;
    fieldLabel: string;
    catalogValue: unknown;
    incomingValue: unknown;
  };
  const pendingConflicts: PendingConflict[] = [];
  // Per-item counter so we can $inc conflictCount in one call per item.
  const conflictsPerItem = new Map<string, number>();

  let created = 0;
  let merged = 0;

  for (const [key, groupRows] of rowsByKey) {
    const doc = key.startsWith("cz:") ? czMap.get(key) : vskuMap.get(key);

    if (doc) {
      const inCatalog = (doc as unknown as { inCatalog?: boolean }).inCatalog === true;
      const plain = doc.toObject({ depopulate: true }) as Record<string, unknown>;
      if (!Array.isArray(plain.pricingHistory)) plain.pricingHistory = [];

      for (const row of groupRows) {
        const coerced = (row.coerced ?? {}) as Record<string, unknown>;
        if (inCatalog) {
          // Reconcile branch — authoritative fields that differ are
          // held as conflicts; everything else merges normally.
          const { conflicts, pricingEntry } = reconcileRowAgainstCatalogItem(plain, coerced);
          if (pricingEntry) (plain.pricingHistory as Record<string, unknown>[]).push(pricingEntry);
          for (const c of conflicts) {
            pendingConflicts.push({
              rowId: row._id as Types.ObjectId,
              itemId: doc._id as Types.ObjectId,
              field: c.field.path,
              fieldLabel: c.field.label,
              catalogValue: c.catalogValue,
              incomingValue: c.incomingValue,
            });
          }
          if (conflicts.length > 0) {
            const idKey = String(doc._id);
            conflictsPerItem.set(idKey, (conflictsPerItem.get(idKey) ?? 0) + conflicts.length);
          }
        } else {
          const entry = applyRowToItem(plain, coerced);
          if (entry) (plain.pricingHistory as Record<string, unknown>[]).push(entry);
        }
      }

      if (!plain.vendorId) plain.vendorId = quotation.vendorId;
      for (const field of NOT_FROM_QUOTE) delete plain[field];
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: plain } } });
      opKeys.push(key);
      opTargets.push(doc._id as Types.ObjectId);
      merged += 1;
    } else {
      // Tag every manually-committed quote item with its intake origin
      // + source PO (the vendor's own PO number from the quote, which
      // was either typed on the import form or auto-filled from the
      // file's preamble). This is what the Un-Verified Items page reads
      // for the "Added via" column and the "From PO" column.
      // _id assigned here rather than by the server so each row can be
      // linked to its item even when other writes in the batch fail.
      const freshId = new Types.ObjectId();
      const fresh: Record<string, unknown> = {
        _id: freshId,
        status: "quoted",
        origin: "quotation",
        vendorId: quotation.vendorId,
        pricingHistory: [] as Record<string, unknown>[],
        intakeSource: "manual_quote",
        ...(quotation.poNumber ? { sourcePoNumber: quotation.poNumber } : {}),
      };
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
      opTargets.push(freshId);
      created += 1;
    }
  }

  // ordered:false lets every independent write go through even if one
  // fails (e.g. an item number another commit took a moment ago); only
  // the ops that actually succeeded get their rows linked below.
  const failedOps = new Set<number>();
  if (ops.length > 0) {
    try {
      await Item.bulkWrite(ops as never, { ordered: false });
    } catch (err) {
      const writeErrors = (err as { writeErrors?: { index?: number; errmsg?: string }[] }).writeErrors ?? [];
      if (writeErrors.length === 0) throw err;
      for (const we of writeErrors) {
        if (typeof we.index === "number") failedOps.add(we.index);
        const groupRows = typeof we.index === "number" ? rowsByKey.get(opKeys[we.index]) ?? [] : [];
        const message = /E11000/.test(we.errmsg ?? "")
          ? "Another item already uses this CZ item number"
          : we.errmsg ?? "write failed";
        if (groupRows.length === 0) errors.push({ rowId: "(batch)", message });
        for (const row of groupRows) errors.push({ rowId: String(row._id), message });
      }
    }
  }
  ops.forEach((_, i) => {
    if (failedOps.has(i)) {
      created -= "insertOne" in ops[i] ? 1 : 0;
      merged -= "updateOne" in ops[i] ? 1 : 0;
      return;
    }
    rowsByKey.get(opKeys[i])?.forEach((row) => rowTarget.set(String(row._id), opTargets[i]));
  });

  // Conflicts only for items whose merge actually went through.
  const okItemIds = new Set([...rowTarget.values()].map(String));
  const writtenConflicts = pendingConflicts.filter((c) => okItemIds.has(String(c.itemId)));
  for (const id of conflictsPerItem.keys()) if (!okItemIds.has(id)) conflictsPerItem.delete(id);

  // Write conflicts and bump the per-item counter. Both are optional
  // and only touched when the reconcile branch actually produced any —
  // the fast path for pipeline items pays nothing.
  if (writtenConflicts.length > 0) {
    await CatalogConflict.insertMany(
      writtenConflicts.map((c) => ({
        itemId: c.itemId,
        quotationId: quotation._id,
        quotationRowId: c.rowId,
        field: c.field,
        fieldLabel: c.fieldLabel,
        catalogValue: c.catalogValue,
        incomingValue: c.incomingValue,
        status: "pending",
      })),
      { ordered: false }
    );
    const counterOps = [...conflictsPerItem.entries()].map(([itemId, inc]) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(itemId) },
        update: { $inc: { conflictCount: inc } },
      },
    }));
    if (counterOps.length > 0) await Item.bulkWrite(counterOps, { ordered: false });
  }

  const rowOps = [...rowTarget.entries()].map(([rowId, itemId]) => ({
    updateOne: { filter: { _id: rowId }, update: { $set: { committedItemId: itemId } } },
  }));
  if (rowOps.length > 0) await QuotationRow.bulkWrite(rowOps, { ordered: false });

  const newItemIds = [...new Set([...rowTarget.values()].map(String))].map((id) => new Types.ObjectId(id));
  if (newItemIds.length > 0) {
    await Quotation.updateOne(
      { _id: quotationId },
      { $addToSet: { itemIds: { $each: newItemIds } } }
    );
  }

  // Make the quote visible on the Purchase Orders table: create (or attach
  // to) the PO for this quote's PO number, with the committed items as line
  // items. A failure here is reported but doesn't undo the item commit — the
  // items are already written, and re-running commit (or the backfill
  // migration) retries the link idempotently.
  let purchaseOrder: { poId: string; created: boolean; linesAdded: number } | null = null;
  if (rowTarget.size > 0) {
    try {
      const linked = await attachQuotationToPurchaseOrder(quotation);
      if (linked) purchaseOrder = { ...linked, poId: String(linked.poId) };
    } catch (err) {
      logger.error("quote commit: linking to purchase order failed", {
        quotationId,
        error: err instanceof Error ? err.message : String(err),
      });
      errors.push({ rowId: "(purchase order)", message: "Items committed, but the purchase order couldn't be created" });
    }
  }

  const remaining = await QuotationRow.countDocuments({
    quotationId,
    reviewStatus: { $ne: "rejected" },
    committedItemId: null,
  });
  if (remaining === 0) {
    await Quotation.updateOne(
      { _id: quotationId },
      { $set: { status: "committed" } }
    );
  }

  return NextResponse.json({
    committed: rowTarget.size,
    created,
    merged,
    conflicts: writtenConflicts.length,
    purchaseOrder,
    errors,
    remaining: toCommit.length - rowTarget.size,
  });
}
