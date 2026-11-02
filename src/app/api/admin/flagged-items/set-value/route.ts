import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import ImportBatchRow from "@/models/ImportBatchRow";
import { fixRowField } from "@/lib/import/commitRows";
import { masterFileFieldLabel, isMasterFileField } from "@/lib/import/parseMasterFile";
import { flaggedFilter } from "../filter";

export const maxDuration = 60;

const BodySchema = z.object({
  // The field the issue is on, e.g. "pricing.msrp".
  field: z.string().min(1).max(100),
  value: z.string().max(500),
  scope: z.enum(["filtered", "selected"]),
  q: z.string().max(100).optional(),
  rowIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(5000).optional(),
});

// POST: give every Flagged Items row that has an issue on `field` the same
// value. Each row's value is re-checked with the import's rules, so the
// issue clears where the value is valid and stays (with the reason) where
// it isn't.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { field, value, scope, q, rowIds } = parsed.data;
  if (!isMasterFileField(field)) {
    return NextResponse.json({ error: `"${field}" isn't a Master File column` }, { status: 400 });
  }
  if (field === "itemNumber") {
    return NextResponse.json({ error: "Each row needs its own SKU, so it can't be set in bulk" }, { status: 400 });
  }

  await connectDB();
  const filter = { ...flaggedFilter({ scope, issue: field, q, rowIds }), "flags.field": field };
  const rows = await ImportBatchRow.find(filter).select("coerced flags").lean();

  let stillFlagged = 0;
  const ops = rows.map((row) => {
    const fixed = fixRowField(row, field, value);
    if (fixed.flags.some((f) => f.field === field)) stillFlagged++;
    return { updateOne: { filter: { _id: row._id }, update: { $set: { coerced: fixed.coerced, flags: fixed.flags } } } };
  });
  for (let i = 0; i < ops.length; i += 500) {
    await ImportBatchRow.bulkWrite(ops.slice(i, i + 500) as never, { ordered: false });
  }

  return NextResponse.json({
    updated: rows.length,
    stillFlagged,
    message:
      stillFlagged > 0
        ? `"${value}" isn't a valid ${masterFileFieldLabel(field)}, so those rows are still flagged.`
        : undefined,
  });
}
