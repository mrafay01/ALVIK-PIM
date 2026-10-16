import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { isObjectId } from "@/lib/ids";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const { batchId } = await params;
  if (!isObjectId(batchId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  const batch = await ImportBatch.findById(batchId).lean();
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  // Rows live in their own collection (see ImportBatchRow.ts) — fetched
  // separately and merged into the response so callers see the same shape
  // as before the split (batch.rows).
  const rows = await ImportBatchRow.find({ batchId }).sort({ rowNumber: 1 }).lean();

  return NextResponse.json({ batch: { ...batch, rows } });
}
