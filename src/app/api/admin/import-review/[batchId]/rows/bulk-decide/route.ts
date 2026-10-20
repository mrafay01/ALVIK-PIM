import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { isObjectId } from "@/lib/ids";
import { parseReviewParams, reviewQuery } from "@/lib/import/reviewQuery";

const BodySchema = z.object({
  // approve: will be committed · reject: excluded, never written · reset: back to "needs review"
  action: z.enum(["approve", "reject", "reset"]),
  // Either the rows ticked on screen...
  rowIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(5000).optional(),
  // ...or every row matching the review screen's current filters.
  matching: z.record(z.string(), z.string()).optional(),
});

const STATUS_FOR = { approve: "approved", reject: "rejected", reset: "needs_review" } as const;

// POST: approve, exclude or reset many staged Master File rows at once.
// Rows already committed to the catalog are never touched.
export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const { batchId } = await params;
  if (!isObjectId(batchId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { action, rowIds, matching } = parsed.data;
  if (!rowIds?.length && !matching) {
    return NextResponse.json({ error: "Select at least one row" }, { status: 400 });
  }

  await connectDB();
  const batch = await ImportBatch.findById(batchId);
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  const filter: Record<string, unknown> = rowIds?.length
    ? { batchId, _id: { $in: rowIds } }
    : reviewQuery(batchId, parseReviewParams(matching ?? {}));
  filter.committedItemId = null;

  const userId = gate.session.user?.id ? new Types.ObjectId(gate.session.user.id) : undefined;
  const result = await ImportBatchRow.updateMany(filter, {
    $set: {
      reviewStatus: STATUS_FOR[action],
      reviewedBy: action === "reset" ? undefined : userId,
      reviewedAt: action === "reset" ? undefined : new Date(),
    },
  });

  const [approvedRows, rejectedRows, pendingRows] = await Promise.all([
    ImportBatchRow.countDocuments({ batchId, reviewStatus: "approved" }),
    ImportBatchRow.countDocuments({ batchId, reviewStatus: "rejected" }),
    ImportBatchRow.countDocuments({ batchId, reviewStatus: "needs_review" }),
  ]);
  batch.approvedRows = approvedRows;
  batch.rejectedRows = rejectedRows;
  if (batch.status !== "committed") batch.status = pendingRows === 0 ? "reviewed" : "needs_review";
  await batch.save();

  return NextResponse.json({ changed: result.modifiedCount, approvedRows, rejectedRows, pendingRows });
}
