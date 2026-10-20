import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { ImportRowPatchSchema, badRequest } from "@/lib/schemas";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { isObjectId } from "@/lib/ids";
import { fixRowField } from "@/lib/import/commitRows";

// PATCH: record a reviewer's decision on one staged row — approve it
// (optionally with corrected field values), reject it, or edit its coerced
// values without changing the decision yet. Nothing commits to `items`
// until the batch-level commit endpoint runs.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string; rowId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { batchId, rowId } = await params;
  if (!isObjectId(batchId) || !isObjectId(rowId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = ImportRowPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { reviewStatus, coercedOverrides, reviewNote } = parsed.data;

  await connectDB();
  if (!(await ImportBatch.exists({ _id: batchId }))) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const row = await ImportBatchRow.findOne({ _id: rowId, batchId });
  if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  if (coercedOverrides) {
    // Each corrected value is re-checked with the import's own rules; its
    // flag clears only if the new value is valid.
    let current: ReturnType<typeof fixRowField> = {
      coerced: (row.coerced ?? {}) as Record<string, unknown>,
      flags: row.flags.map((f) => ({ field: f.field, message: f.message, rawValue: f.rawValue })),
    };
    for (const [field, raw] of Object.entries(coercedOverrides)) {
      current = fixRowField(current, field, raw);
    }
    row.coerced = current.coerced;
    row.set("flags", current.flags);
    row.markModified("coerced");
  }
  if (reviewStatus) {
    row.reviewStatus = reviewStatus;
    if (session.user?.id) row.reviewedBy = new Types.ObjectId(session.user.id);
    row.reviewedAt = new Date();
  }
  if (reviewNote !== undefined) {
    row.reviewNote = reviewNote;
  }

  await row.save();

  return NextResponse.json({ row });
}
