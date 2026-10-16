import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import Item from "@/models/Item";
import { setDotPath } from "@/lib/import/setDotPath";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import { splitSku } from "@/lib/catalog/sku";
import { isObjectId } from "@/lib/ids";

const PRICING_FIELD_MAP: Record<string, string> = {
  "pricing.msrp": "msrp",
  "pricing.newMsrp": "msrp", // "new" MSRP supersedes the old one in the same history entry
  "pricing.ruePrice": "ruePrice",
  "pricing.effectiveDate": "effectiveDate",
};

// `update` is nested (for building a new document); `flat` keeps the
// dotted paths so an existing item is updated field by field — merging a
// nested { specs: {...} } would replace the item's whole specs object and
// drop every spec this row left blank.
function buildUpdate(coerced: Record<string, unknown>) {
  const update: Record<string, unknown> = {};
  const flat: Record<string, unknown> = {};
  const pricingEntry: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(coerced)) {
    if (path === "itemNumber" || value === null || value === undefined) continue;
    if (path in PRICING_FIELD_MAP) {
      pricingEntry[PRICING_FIELD_MAP[path]] = value;
      continue;
    }
    setDotPath(update, path, value);
    flat[path] = value;
  }

  const hasPricingData = Object.keys(pricingEntry).length > 0;
  if (hasPricingData) {
    pricingEntry.source = "master_file_import";
    if (!pricingEntry.effectiveDate) pricingEntry.effectiveDate = new Date();
  }

  return { update, flat, pricingEntry, hasPricingData };
}

// POST: write every approved, not-yet-committed row into `items`. Rejected
// and still-pending rows are left untouched — this can be run again after
// more rows get approved, and it's safe to re-run since committed rows are
// skipped.
//
// Batched rather than one row at a time: the original version did an
// `Item.findOne` + `.save()` per approved row, sequentially — each a
// separate MongoDB Atlas round-trip, so a multi-thousand-row batch took
// minutes. This version fetches every candidate item in one query, then
// writes with `bulkWrite` (one network round-trip carrying every op)
// instead of N sequential saves.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const { batchId } = await params;
  if (!isObjectId(batchId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  const batch = await ImportBatch.findById(batchId);
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  const toCommit = await ImportBatchRow.find({
    batchId,
    reviewStatus: "approved",
    committedItemId: null,
  }).lean();

  const errors: { rowId: string; message: string }[] = [];
  const validRows = toCommit.filter((row) => {
    const itemNumber = (row.coerced as Record<string, unknown> | undefined)?.itemNumber;
    if (!itemNumber || typeof itemNumber !== "string") {
      errors.push({ rowId: row._id.toString(), message: "Row has no itemNumber; cannot commit" });
      return false;
    }
    return true;
  });

  // One query for every existing item this batch could touch, instead of
  // one findOne per row.
  const itemNumbers = validRows.map((r) => (r.coerced as Record<string, unknown>).itemNumber as string);
  const existingItems = itemNumbers.length
    ? await Item.find({ itemNumber: { $in: itemNumbers } })
    : [];
  const existingByItemNumber = new Map(existingItems.map((it) => [it.itemNumber, it]));

  // rowIds that resolve to the same itemNumber must all merge into the
  // *same* item, whether it already exists or is being created fresh in
  // this batch — itemNumber has a unique index, so two separate insertOne
  // ops for the same new itemNumber would collide and silently drop the
  // second row. Group rows by itemNumber first, then decide once per
  // itemNumber whether it's an update or an insert.
  const rowsByItemNumber = new Map<string, typeof validRows>();
  for (const row of validRows) {
    const itemNumber = (row.coerced as Record<string, unknown>).itemNumber as string;
    const group = rowsByItemNumber.get(itemNumber);
    if (group) group.push(row);
    else rowsByItemNumber.set(itemNumber, [row]);
  }

  const itemOps: Array<
    | { insertOne: { document: Record<string, unknown> } }
    | { updateOne: { filter: { _id: unknown }; update: Record<string, unknown> } }
  > = [];
  // Track which itemNumber maps to which op (and thus which row group), so
  // committedItemId can be resolved after bulkWrite returns.
  const opItemNumbers: string[] = [];
  const opTargets: Types.ObjectId[] = [];
  const rowCommitTarget = new Map<string, Types.ObjectId>(); // rowId -> itemId

  let merged = 0;
  let created = 0;

  for (const [itemNumber, groupRows] of rowsByItemNumber) {
    const existing = existingByItemNumber.get(itemNumber);

    if (existing) {
      // Apply every row targeting this itemNumber in row order, so later
      // rows' fields win and pricingHistory gets one entry per row. The
      // in-memory copy is only used to recompute the completeness gate;
      // the write itself touches just the imported paths.
      const set: Record<string, unknown> = {};
      const newPricing: Record<string, unknown>[] = [];
      for (const row of groupRows) {
        const { flat, pricingEntry, hasPricingData } = buildUpdate((row.coerced ?? {}) as Record<string, unknown>);
        for (const [path, value] of Object.entries(flat)) {
          existing.set(path, value);
          set[path] = value;
        }
        if (hasPricingData) {
          existing.pricingHistory.push(pricingEntry);
          newPricing.push(pricingEntry);
        }
      }
      // Backfill the SKU family fields on older docs that predate them.
      if (existing.itemNumber && !existing.baseSku) {
        const s = splitSku(existing.itemNumber);
        set.baseSku = s.baseSku;
        set.variantSuffix = s.variantSuffix;
      }
      set.masterRecordComplete = isMasterRecordComplete(existing);
      merged += 1;

      itemOps.push({
        updateOne: {
          filter: { _id: existing._id },
          update: {
            $set: set,
            ...(newPricing.length > 0 ? { $push: { pricingHistory: { $each: newPricing } } } : {}),
          },
        },
      });
      opItemNumbers.push(itemNumber);
      opTargets.push(existing._id);
    } else {
      // Brand-new item: fold every row in this group into one document
      // before inserting, same merge order as above.
      const { baseSku, variantSuffix } = splitSku(itemNumber);
      const now = new Date();
      const newId = new Types.ObjectId();
      const doc: Record<string, unknown> = {
        _id: newId,
        itemNumber,
        baseSku,
        variantSuffix,
        status: "live", // legacy import — these are existing catalog items, not new intake
        // Master File rows are the finalized company database — in the
        // catalog directly, no human approval step needed.
        origin: "master_file",
        inCatalog: true,
        catalogApproval: { status: "approved", approvedAt: now },
        pricingHistory: [] as Record<string, unknown>[],
      };
      for (const row of groupRows) {
        const { update, pricingEntry, hasPricingData } = buildUpdate((row.coerced ?? {}) as Record<string, unknown>);
        Object.assign(doc, update);
        if (hasPricingData) (doc.pricingHistory as Record<string, unknown>[]).push(pricingEntry);
      }
      doc.masterRecordComplete = isMasterRecordComplete(
        doc as unknown as Parameters<typeof isMasterRecordComplete>[0]
      );
      itemOps.push({ insertOne: { document: doc } });
      opItemNumbers.push(itemNumber);
      opTargets.push(newId);
      created += 1;
    }
  }

  // ordered:false so one failed write (say, an item number another
  // import created a moment ago) doesn't stop the rest; only the ops that
  // succeeded get their rows marked committed, so a re-run retries the rest.
  const failedOps = new Set<number>();
  if (itemOps.length > 0) {
    try {
      await Item.bulkWrite(itemOps as never, { ordered: false });
    } catch (err) {
      const writeErrors = (err as { writeErrors?: { index?: number; errmsg?: string }[] }).writeErrors ?? [];
      if (writeErrors.length === 0) throw err;
      for (const we of writeErrors) {
        if (typeof we.index !== "number") continue;
        failedOps.add(we.index);
        const message = /E11000/.test(we.errmsg ?? "")
          ? "This item number was created by another import at the same time. Commit again to merge it"
          : we.errmsg ?? "write failed";
        for (const row of rowsByItemNumber.get(opItemNumbers[we.index]) ?? []) {
          errors.push({ rowId: row._id.toString(), message });
        }
      }
    }
  }
  itemOps.forEach((op, i) => {
    if (failedOps.has(i)) {
      if ("insertOne" in op) created -= 1;
      else merged -= 1;
      return;
    }
    rowsByItemNumber.get(opItemNumbers[i])?.forEach((row) => rowCommitTarget.set(row._id.toString(), opTargets[i]));
  });

  // One bulkWrite for every row's committedItemId, instead of N sequential
  // row.save() calls.
  const rowOps = [...rowCommitTarget.entries()].map(([rowId, itemId]) => ({
    updateOne: {
      filter: { _id: rowId },
      update: { $set: { committedItemId: itemId } },
    },
  }));
  if (rowOps.length > 0) {
    await ImportBatchRow.bulkWrite(rowOps, { ordered: false });
  }

  const committed = rowCommitTarget.size;

  const pendingOrUncommitted = await ImportBatchRow.countDocuments({
    batchId,
    reviewStatus: { $ne: "rejected" },
    committedItemId: null,
  });
  if (pendingOrUncommitted === 0) {
    batch.status = "committed";
  }

  await batch.save();

  return NextResponse.json({
    committed,
    created,
    merged,
    errors,
    remaining: toCommit.length - committed,
  });
}
