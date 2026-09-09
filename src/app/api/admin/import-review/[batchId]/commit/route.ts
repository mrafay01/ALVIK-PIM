import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import Item from "@/models/Item";
import { setDotPath } from "@/lib/import/setDotPath";
import { isMasterRecordComplete } from "@/lib/masterRecordComplete";

// POST: write every approved, not-yet-committed row into `items`. Rejected
// and still-pending rows are left untouched — this can be run again after
// more rows get approved, and it's safe to re-run since committed rows are
// skipped.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { batchId } = await params;
  await connectDB();
  const batch = await ImportBatch.findById(batchId);
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  const toCommit = await ImportBatchRow.find({
    batchId,
    reviewStatus: "approved",
    committedItemId: null,
  });

  let committed = 0;
  let merged = 0;
  let created = 0;
  const errors: { rowId: string; message: string }[] = [];

  for (const row of toCommit) {
    try {
      const coerced = (row.coerced ?? {}) as Record<string, unknown>;
      const itemNumber = coerced.itemNumber as string | undefined;
      if (!itemNumber) {
        throw new Error("Row has no itemNumber — cannot commit");
      }

      // `pricing.*` fields don't map onto a plain nested object — Item.pricingHistory
      // is an append-only array (per the blueprint: MSRP changes over time in the
      // sheet, never overwritten), so those keys are pulled out and built into one
      // history entry instead of being dot-path-written like everything else.
      const update: Record<string, unknown> = {};
      const pricingEntry: Record<string, unknown> = {};
      const PRICING_FIELD_MAP: Record<string, string> = {
        "pricing.msrp": "msrp",
        "pricing.newMsrp": "msrp", // "new" MSRP supersedes the old one in the same history entry
        "pricing.ruePrice": "ruePrice",
        "pricing.effectiveDate": "effectiveDate",
      };

      for (const [path, value] of Object.entries(coerced)) {
        if (path === "itemNumber" || value === null || value === undefined) continue;
        if (path in PRICING_FIELD_MAP) {
          pricingEntry[PRICING_FIELD_MAP[path]] = value;
          continue;
        }
        setDotPath(update, path, value);
      }

      const hasPricingData = Object.keys(pricingEntry).length > 0;
      if (hasPricingData) {
        pricingEntry.source = "master_file_import";
        if (!pricingEntry.effectiveDate) pricingEntry.effectiveDate = new Date();
      }

      const existing = await Item.findOne({ itemNumber });
      let itemId;
      if (existing) {
        // Existing item with this SKU: merge, don't replace. Fields present
        // on this row overwrite the matching field on the existing item;
        // pricingHistory is appended to, never truncated.
        Object.assign(existing, update);
        if (hasPricingData) existing.pricingHistory.push(pricingEntry);
        existing.masterRecordComplete = isMasterRecordComplete(existing);
        await existing.save();
        itemId = existing._id;
        merged += 1;
      } else {
        const createdDoc = await Item.create({
          itemNumber,
          status: "live", // legacy import — these are existing catalog items, not new intake
          ...update,
          pricingHistory: hasPricingData ? [pricingEntry] : [],
        });
        createdDoc.masterRecordComplete = isMasterRecordComplete(createdDoc);
        await createdDoc.save();
        itemId = createdDoc._id;
        created += 1;
      }

      row.committedItemId = itemId;
      await row.save();
      committed += 1;
    } catch (err) {
      errors.push({ rowId: row._id.toString(), message: (err as Error).message });
    }
  }

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
    remaining: toCommit.length - committed - errors.length,
  });
}
