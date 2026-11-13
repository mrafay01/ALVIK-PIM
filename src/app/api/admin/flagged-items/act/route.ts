import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import ImportBatchRow from "@/models/ImportBatchRow";
import { commitImportRowsInSlices, excludeImportRows, updateBatchStatus } from "@/lib/import/commitRows";
import { flaggedFilter } from "../filter";
import { refreshCatalogFacets } from "@/lib/catalog/facets";

export const maxDuration = 60;

const BodySchema = z.object({
  // commit: write to the catalog · return: back to its file's review page · exclude: never import
  action: z.enum(["commit", "return", "exclude"]),
  scope: z.enum(["fixed", "filtered", "selected"]),
  issue: z.string().max(100).optional(),
  q: z.string().max(100).optional(),
  rowIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(5000).optional(),
  // commit only: resume a commit from the `next` an earlier call returned.
  after: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

// POST: bulk actions on the Flagged Items page.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { action, scope, issue, q, rowIds, after } = parsed.data;
  if (scope === "selected" && !rowIds?.length) {
    return NextResponse.json({ error: "Select at least one row" }, { status: 400 });
  }

  await connectDB();
  const filter = flaggedFilter({ scope, issue, q, rowIds });
  const userId = gate.session.user?.id ? new Types.ObjectId(gate.session.user.id) : undefined;

  if (action === "commit") {
    // Approve and write to the catalog in slices for up to ~40 s; `next`
    // set means call again with `after: next`.
    const result = await commitImportRowsInSlices(filter, { reviewedBy: userId, after });
    if (result.committed > 0) refreshCatalogFacets();
    return NextResponse.json(result);
  }

  const rows = await ImportBatchRow.find(filter).select("_id batchId").lean();
  if (rows.length === 0) return NextResponse.json({ affected: 0, committed: 0, errors: [] });
  const ids = rows.map((r) => r._id);
  const batchIds = [...new Set(rows.map((r) => String(r.batchId)))];

  if (action === "return") {
    const r = await ImportBatchRow.updateMany({ _id: { $in: ids } }, { $set: { parkedAt: null } });
    // Its file now has rows waiting again, so Recent imports links back to it.
    await updateBatchStatus(batchIds);
    return NextResponse.json({ affected: r.modifiedCount });
  }
  return NextResponse.json({ affected: await excludeImportRows({ _id: { $in: ids } }) });
}
