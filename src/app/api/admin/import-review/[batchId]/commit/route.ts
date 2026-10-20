import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import ImportBatch from "@/models/ImportBatch";
import { isObjectId } from "@/lib/ids";
import { commitImportRows } from "@/lib/import/commitRows";

// POST: write every approved, not-yet-committed row of this batch into the
// catalog. See commitImportRows for how rows become items.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const { batchId } = await params;
  if (!isObjectId(batchId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  if (!(await ImportBatch.exists({ _id: batchId }))) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  return NextResponse.json(await commitImportRows({ batchId, reviewStatus: "approved" }));
}
