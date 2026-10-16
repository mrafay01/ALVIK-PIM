import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { isObjectId } from "@/lib/ids";

// POST: approve every unflagged, still-pending row in one shot.
//
// The row-by-row PATCH endpoint (rows/[rowId]/route.ts) does 6 sequential
// MongoDB round-trips per call (fetch batch, fetch row, save row, three
// counts, save batch) — fine for one row a reviewer clicks by hand, but the
// UI's "Approve all unflagged" button was looping that same endpoint once
// per row client-side. On a multi-thousand-row batch that's thousands of
// full HTTP + 6-round-trip cycles in sequence — minutes of wall-clock time
// for what should be one write. This endpoint does the whole batch as one
// updateMany plus three counts, regardless of row count.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { batchId } = await params;
  if (!isObjectId(batchId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();

  const batch = await ImportBatch.findById(batchId);
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  const result = await ImportBatchRow.updateMany(
    { batchId, reviewStatus: "needs_review", "flags.0": { $exists: false } },
    {
      $set: {
        reviewStatus: "approved",
        reviewedBy: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
        reviewedAt: new Date(),
      },
    }
  );

  const [approvedRows, rejectedRows, pendingRows] = await Promise.all([
    ImportBatchRow.countDocuments({ batchId, reviewStatus: "approved" }),
    ImportBatchRow.countDocuments({ batchId, reviewStatus: "rejected" }),
    ImportBatchRow.countDocuments({ batchId, reviewStatus: "needs_review" }),
  ]);

  batch.approvedRows = approvedRows;
  batch.rejectedRows = rejectedRows;
  if (pendingRows === 0 && batch.status === "needs_review") {
    batch.status = "reviewed";
  }
  await batch.save();

  return NextResponse.json({ approved: result.modifiedCount, approvedRows, rejectedRows, pendingRows });
}
