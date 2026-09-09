import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import Item from "@/models/Item";
import { parseMasterFileBuffer } from "@/lib/import/parseMasterFile";

// GET: list all import batches (most recent first).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const batches = await ImportBatch.find({})
    .select("sourceFileName uploadedAt status totalRows flaggedRows approvedRows rejectedRows")
    .sort({ uploadedAt: -1 })
    .lean();

  return NextResponse.json({ batches });
}

// POST: upload a Master File .xlsx, parse it, and stage every row for review.
// Nothing is written to `items` here — see the batch commit route for that.
//
// Staged rows are inserted into the separate ImportBatchRow collection
// (batchId-referenced) rather than embedded in the ImportBatch document —
// embedding every row's raw + coerced values in one document can exceed
// MongoDB's 16MB document-size limit on a large Master File.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  let rows;
  try {
    rows = await parseMasterFileBuffer(await file.arrayBuffer());
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse file: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows found in the uploaded file" }, { status: 400 });
  }

  await connectDB();

  // Duplicate-SKU detection, surfaced as a flag before anyone approves a
  // row — silently overwriting an existing item, or importing the same SKU
  // twice from one file, should be a visible decision, not a side effect
  // of the commit step.
  const skuCounts = new Map<string, number>();
  for (const r of rows) {
    const sku = r.coerced.itemNumber as string | null;
    if (!sku) continue;
    skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
  }
  const withinBatchDupes = new Set(
    [...skuCounts.entries()].filter(([, count]) => count > 1).map(([sku]) => sku)
  );

  const candidateSkus = [...skuCounts.keys()];
  const existingItems = candidateSkus.length
    ? await Item.find({ itemNumber: { $in: candidateSkus } }).select("itemNumber").lean()
    : [];
  const existingSkus = new Set(existingItems.map((i) => i.itemNumber));

  const batch = await ImportBatch.create({
    sourceFileName: file.name,
    uploadedBy: session.user?.id ?? null,
    status: "needs_review",
    totalRows: rows.length,
    flaggedRows: 0, // filled in below once flags are computed
  });

  const stagedRows = rows.map((r) => {
    const sku = r.coerced.itemNumber as string | null;
    const flags = [...r.flags];
    if (sku && withinBatchDupes.has(sku)) {
      flags.push({
        field: "itemNumber",
        message: `SKU "${sku}" appears more than once in this file — later approved rows will overwrite earlier ones`,
        rawValue: sku,
      });
    }
    if (sku && existingSkus.has(sku)) {
      flags.push({
        field: "itemNumber",
        message: `SKU "${sku}" already exists in the database — approving this row will merge into the existing item, not create a new one`,
        rawValue: sku,
      });
    }
    return {
      batchId: batch._id,
      rowNumber: r.rowNumber,
      raw: r.raw,
      coerced: r.coerced,
      flags,
      reviewStatus: "needs_review" as const,
    };
  });

  const flaggedCount = stagedRows.filter((r) => r.flags.length > 0).length;

  // insertMany batches its writes under the hood — no single document risks
  // the 16MB ceiling regardless of how many rows the file has.
  await ImportBatchRow.insertMany(stagedRows);

  batch.flaggedRows = flaggedCount;
  await batch.save();

  return NextResponse.json({
    batchId: batch._id,
    totalRows: stagedRows.length,
    flaggedRows: flaggedCount,
  });
}
