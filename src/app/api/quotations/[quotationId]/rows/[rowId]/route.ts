import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import { QuotationRowPatchSchema, badRequest } from "@/lib/schemas";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";

const QUOTE_ROLES = ["buying_purchasing", "buyer_merchandiser", "marketplace_listing"] as const;

// PATCH: record a reviewer's decision on one staged quote row — approve
// (optionally with corrected values), reject, or just edit coerced values.
// Nothing writes to `items` until the quote-level commit endpoint runs.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ quotationId: string; rowId: string }> }
) {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;

  const { quotationId, rowId } = await params;
  const parsed = QuotationRowPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { reviewStatus, coercedOverrides, reviewNote } = parsed.data;

  await connectDB();
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const row = await QuotationRow.findOne({ _id: rowId, quotationId });
  if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  if (coercedOverrides) {
    const base = { ...(row.coerced ?? {}) } as Record<string, unknown>;
    // Keys of the form "custom.<label>" edit one entry of the free-form
    // __custom map without clobbering the rest of it; everything else is a
    // top-level coerced field.
    const customPatch: Record<string, string> = {};
    for (const [k, v] of Object.entries(coercedOverrides)) {
      if (k.startsWith("custom.")) {
        const label = k.slice("custom.".length);
        if (label) customPatch[label] = v == null ? "" : String(v);
      } else {
        base[k] = v;
      }
    }
    if (Object.keys(customPatch).length > 0) {
      const cur =
        base.__custom && typeof base.__custom === "object"
          ? (base.__custom as Record<string, string>)
          : {};
      const next = { ...cur };
      for (const [label, val] of Object.entries(customPatch)) {
        if (val.trim() === "") delete next[label];
        else next[label] = val.trim();
      }
      if (Object.keys(next).length > 0) base.__custom = next;
      else delete base.__custom;
    }
    row.coerced = base;
    // A corrected value clears the flag that was pointing at it.
    if (row.flags.length > 0) {
      const fixed = new Set(Object.keys(coercedOverrides));
      for (let i = row.flags.length - 1; i >= 0; i--) {
        if (fixed.has(row.flags[i].field)) row.flags.splice(i, 1);
      }
    }
  }
  if (reviewStatus) {
    row.reviewStatus = reviewStatus;
    if (session.user?.id) row.reviewedBy = new Types.ObjectId(session.user.id);
    row.reviewedAt = new Date();
  }
  if (reviewNote !== undefined) row.reviewNote = reviewNote;

  await row.save();

  const [approvedRows, rejectedRows, pendingRows, flaggedRows] = await Promise.all([
    QuotationRow.countDocuments({ quotationId, reviewStatus: "approved" }),
    QuotationRow.countDocuments({ quotationId, reviewStatus: "rejected" }),
    QuotationRow.countDocuments({ quotationId, reviewStatus: "needs_review" }),
    QuotationRow.countDocuments({ quotationId, "flags.0": { $exists: true } }),
  ]);

  quotation.approvedRows = approvedRows;
  quotation.rejectedRows = rejectedRows;
  quotation.flaggedRows = flaggedRows;
  if (pendingRows === 0 && quotation.status === "needs_review") {
    quotation.status = "reviewed";
  }
  await quotation.save();

  return NextResponse.json({ row });
}
