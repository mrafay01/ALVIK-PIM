import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import ImportBatch from "@/models/ImportBatch";
import ImportBatchRow from "@/models/ImportBatchRow";
import { isObjectId } from "@/lib/ids";
import { commitImportRowsInSlices, excludeImportRows, updateBatchStatus } from "@/lib/import/commitRows";
import { onReviewPage, scopeFilter, searchFilter } from "@/lib/import/reviewQuery";
import { refreshCatalogFacets } from "@/lib/catalog/facets";

export const maxDuration = 60;

const BodySchema = z.object({
  // commit: write to the catalog · park: send to Flagged Items · exclude: never import
  action: z.enum(["commit", "park", "exclude"]),
  scope: z.enum(["unflagged", "flagged", "all", "selected"]),
  rowIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(5000).optional(),
  // The review page's search box, so "all"/"flagged"/"unflagged" mean the rows shown.
  q: z.string().max(100).optional(),
  // commit only: resume a commit from the `next` an earlier call returned.
  after: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

// POST: the review page's bulk actions on rows still waiting there.
export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const { batchId } = await params;
  if (!isObjectId(batchId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { action, scope, rowIds, q, after } = parsed.data;
  if (scope === "selected" && !rowIds?.length) {
    return NextResponse.json({ error: "Select at least one row" }, { status: 400 });
  }

  await connectDB();
  if (!(await ImportBatch.exists({ _id: batchId }))) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const filter = { ...onReviewPage(batchId), ...scopeFilter(scope, rowIds), ...searchFilter(q ?? "") };
  const userId = gate.session.user?.id ? new Types.ObjectId(gate.session.user.id) : undefined;

  if (action === "park") {
    const r = await ImportBatchRow.updateMany(filter, { $set: { parkedAt: new Date() } });
    await updateBatchStatus([batchId]);
    return NextResponse.json({ parked: r.modifiedCount });
  }
  if (action === "exclude") {
    return NextResponse.json({ excluded: await excludeImportRows(filter) });
  }

  // commit: approve the chosen rows and write them to the catalog, in
  // slices for up to ~40 s; `next` set means call again with `after: next`.
  const result = await commitImportRowsInSlices(filter, { reviewedBy: userId, after });
  if (result.committed > 0) refreshCatalogFacets();
  return NextResponse.json(result);
}
