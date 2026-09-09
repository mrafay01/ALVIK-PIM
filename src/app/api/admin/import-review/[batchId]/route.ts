import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { batchId } = await params;
  await connectDB();
  const batch = await ImportBatch.findById(batchId).lean();
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  // Rows live in their own collection (see ImportBatchRow.ts) — fetched
  // separately and merged into the response so callers see the same shape
  // as before the split (batch.rows).
  const rows = await ImportBatchRow.find({ batchId }).sort({ rowNumber: 1 }).lean();

  return NextResponse.json({ batch: { ...batch, rows } });
}
