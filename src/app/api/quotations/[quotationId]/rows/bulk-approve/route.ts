import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import { isObjectId } from "@/lib/ids";

const QUOTE_ROLES = ROLE_SETS.quotes;

// POST: approve every still-pending row that carries no flags, in one
// updateMany — the fast path for a clean quote where the reviewer only
// needs to eyeball the flagged rows. Flagged rows are left for a per-row
// decision. Mirrors the legacy import's bulk-approve.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ quotationId: string }> }
) {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;

  const { quotationId } = await params;
  if (!isObjectId(quotationId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDB();
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const result = await QuotationRow.updateMany(
    { quotationId, reviewStatus: "needs_review", "flags.0": { $exists: false } },
    { $set: { reviewStatus: "approved", reviewedBy: gate.session.user?.id ?? null, reviewedAt: new Date() } }
  );

  const [approvedRows, rejectedRows, pendingRows] = await Promise.all([
    QuotationRow.countDocuments({ quotationId, reviewStatus: "approved" }),
    QuotationRow.countDocuments({ quotationId, reviewStatus: "rejected" }),
    QuotationRow.countDocuments({ quotationId, reviewStatus: "needs_review" }),
  ]);
  quotation.approvedRows = approvedRows;
  quotation.rejectedRows = rejectedRows;
  if (pendingRows === 0 && quotation.status === "needs_review") quotation.status = "reviewed";
  await quotation.save();

  return NextResponse.json({ approved: result.modifiedCount });
}
