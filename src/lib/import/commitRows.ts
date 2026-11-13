import { Types } from "mongoose";
import ImportBatchRow from "@/models/ImportBatchRow";
import Item from "@/models/Item";
import { setDotPath } from "@/lib/import/setDotPath";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";
import { splitSku } from "@/lib/catalog/sku";

// The Master File's price columns: folded into one pricingHistory entry.
const PRICING_PATHS = new Set(["pricing.msrp", "pricing.newMsrp", "pricing.ruePrice", "pricing.effectiveDate"]);

// `update` is nested (for building a new document); `flat` keeps the
// dotted paths so an existing item is updated field by field — merging a
// nested { specs: {...} } would replace the item's whole specs object and
// drop every spec this row left blank.
export function buildUpdate(coerced: Record<string, unknown>) {
  const update: Record<string, unknown> = {};
  const flat: Record<string, unknown> = {};
  const pricingEntry: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(coerced)) {
    if (path === "itemNumber" || value === null || value === undefined) continue;
    // Only the Master File's own columns are ever written onto an item.
    if (!isMasterFileField(path)) continue;
    if (PRICING_PATHS.has(path)) continue; // handled below
    setDotPath(update, path, value);
    flat[path] = value;
  }

  const present = (v: unknown) => v !== null && v !== undefined && v !== "";
  const msrp = coerced["pricing.msrp"];
  const newMsrp = coerced["pricing.newMsrp"];
  const ruePrice = coerced["pricing.ruePrice"];
  const effectiveDate = coerced["pricing.effectiveDate"];
  // NEW MSRP supersedes MSRP as the item's current price. (Decided
  // explicitly, not by key order: a fixed MSRP is re-added at the end of
  // `coerced` and used to overwrite the new one.)
  if (present(newMsrp)) pricingEntry.msrp = newMsrp;
  else if (present(msrp)) pricingEntry.msrp = msrp;
  if (present(ruePrice)) pricingEntry.ruePrice = ruePrice;
  if (present(effectiveDate)) pricingEntry.effectiveDate = effectiveDate;

  const hasPricingData = Object.keys(pricingEntry).length > 0;
  if (hasPricingData) {
    pricingEntry.source = "master_file_import";
    // The sheet's own MSRP / NEW MSRP / Date cells, kept as written so the
    // catalog export can give them back column for column (the entry's
    // msrp holds only the current price, and its date defaults to today).
    const masterFile: Record<string, unknown> = {};
    if (present(msrp)) masterFile.msrp = msrp;
    if (present(newMsrp)) masterFile.newMsrp = newMsrp;
    if (present(effectiveDate)) masterFile.effectiveDate = effectiveDate;
    pricingEntry.masterFile = masterFile;
    if (!pricingEntry.effectiveDate) pricingEntry.effectiveDate = new Date();
  }

  return { update, flat, pricingEntry, hasPricingData };
}

import ImportBatch from "@/models/ImportBatch";
import { coerceMasterFileValue, isMasterFileField } from "@/lib/import/parseMasterFile";

export type CommitResult = {
  committed: number;
  created: number;
  merged: number;
  errors: { rowId: string; message: string }[];
  remaining: number;
};

// Writes staged Master File rows matching `filter` into the catalog
// (new items are created; an existing item number is merged field by
// field). Used by the batch review page and the Flagged Items page, which
// can span several batches. Rows already committed are skipped, so this is
// safe to re-run. Each touched batch's counters and status are refreshed.
export async function commitImportRows(filter: Record<string, unknown>): Promise<CommitResult> {
  const toCommit = await ImportBatchRow.find({ ...filter, committedItemId: null }).select("batchId coerced").lean();

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

  // A committed row has done its job: its values now live on the item.
  // Delete it rather than keep a copy of the whole file around, and add it
  // to its import's "committed" count.
  const committedIds = [...rowCommitTarget.keys()];
  if (committedIds.length > 0) {
    const perBatch = new Map<string, number>();
    for (const row of toCommit) {
      if (rowCommitTarget.has(row._id.toString())) {
        const k = String(row.batchId);
        perBatch.set(k, (perBatch.get(k) ?? 0) + 1);
      }
    }
    await ImportBatchRow.deleteMany({ _id: { $in: committedIds } });
    await bumpBatchCounts(perBatch, "approvedRows");
  }

  const committed = rowCommitTarget.size;
  await updateBatchStatus([...new Set(toCommit.map((r) => String(r.batchId)))]);
  return { committed, created, merged, errors, remaining: toCommit.length - committed };
}

// A Master File can have many thousands of rows, and committing them all
// in one request could run past the 60 s serverless limit. This commits
// the rows matching `filter` 500 at a time in _id order, stopping after
// ~timeBudgetMs. When rows are left it returns `next` (the last row id it
// reached) and the screen calls again with `after: next`, so each row is
// tried once per run: a row that fails stays where it is with its error and
// isn't retried by the following calls. Each slice is approved
// (reviewedBy/At) just before it's committed.
const COMMIT_SLICE_ROWS = 500;

export type SlicedCommitResult = Omit<CommitResult, "remaining"> & { next: string | null };

export async function commitImportRowsInSlices(
  filter: Record<string, unknown>,
  opts: { reviewedBy?: Types.ObjectId; after?: string; timeBudgetMs?: number } = {}
): Promise<SlicedCommitResult> {
  const deadline = Date.now() + (opts.timeBudgetMs ?? 40_000);
  let cursor = opts.after ? new Types.ObjectId(opts.after) : null;
  const out: SlicedCommitResult = { committed: 0, created: 0, merged: 0, errors: [], next: null };
  const pending = () => ({ $and: [filter, { committedItemId: null }, ...(cursor ? [{ _id: { $gt: cursor } }] : [])] });

  do {
    const ids = (await ImportBatchRow.find(pending()).select("_id").sort({ _id: 1 }).limit(COMMIT_SLICE_ROWS).lean()).map(
      (r) => r._id
    );
    if (ids.length === 0) return out; // all done
    cursor = ids[ids.length - 1];
    await ImportBatchRow.updateMany(
      { _id: { $in: ids } },
      { $set: { reviewStatus: "approved", reviewedBy: opts.reviewedBy, reviewedAt: new Date() } }
    );
    const r = await commitImportRows({ _id: { $in: ids } });
    out.committed += r.committed;
    out.created += r.created;
    out.merged += r.merged;
    out.errors.push(...r.errors);
  } while (Date.now() < deadline);

  if (await ImportBatchRow.exists(pending())) out.next = String(cursor);
  return out;
}

async function bumpBatchCounts(perBatch: Map<string, number>, field: "approvedRows" | "rejectedRows") {
  for (const [batchId, n] of perBatch) {
    await ImportBatch.updateOne({ _id: batchId }, { $inc: { [field]: n } });
  }
}

// Excluded rows will never be imported: delete them and count them on
// their import as "excluded".
export async function excludeImportRows(filter: Record<string, unknown>): Promise<number> {
  const rows = await ImportBatchRow.find({ ...filter, committedItemId: null }).select("_id batchId").lean();
  if (rows.length === 0) return 0;
  const perBatch = new Map<string, number>();
  for (const r of rows) perBatch.set(String(r.batchId), (perBatch.get(String(r.batchId)) ?? 0) + 1);
  await ImportBatchRow.deleteMany({ _id: { $in: rows.map((r) => r._id) } });
  await bumpBatchCounts(perBatch, "rejectedRows");
  await updateBatchStatus([...perBatch.keys()]);
  return rows.length;
}

// An import is "needs_review" while rows are still waiting on its review
// page (only then does Recent imports link back to it), "reviewed" when
// the only rows left are in Flagged Items, and "committed" (done) when no
// rows are left at all.
export async function updateBatchStatus(batchIds: string[]): Promise<void> {
  for (const batchId of batchIds) {
    const [waiting, parked] = await Promise.all([
      ImportBatchRow.countDocuments({ batchId, parkedAt: null, committedItemId: null, reviewStatus: { $ne: "rejected" } }),
      ImportBatchRow.countDocuments({ batchId, parkedAt: { $ne: null }, committedItemId: null, reviewStatus: { $ne: "rejected" } }),
    ]);
    const status = waiting > 0 ? "needs_review" : parked > 0 ? "reviewed" : "committed";
    await ImportBatch.updateOne({ _id: batchId }, { $set: { status } });
  }
}

// Applies a reviewer's corrected value to one staged row: the value is
// re-checked with the import's own rules, and the field's old flag is
// replaced by whatever the new value still triggers (usually nothing).
export function fixRowField(
  row: { coerced?: unknown; flags?: { field: string; message: string; rawValue?: unknown }[] },
  field: string,
  raw: unknown
): { coerced: Record<string, unknown>; flags: { field: string; message: string; rawValue?: unknown }[] } {
  const { value, flags: newFlags } = coerceMasterFileValue(field, raw);
  const coerced = { ...((row.coerced ?? {}) as Record<string, unknown>) };
  if (value === null || value === undefined) delete coerced[field];
  else coerced[field] = value;
  const flags = [...(row.flags ?? []).filter((f) => f.field !== field), ...newFlags];
  return { coerced, flags };
}
