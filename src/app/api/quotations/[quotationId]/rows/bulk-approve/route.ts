import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import { isObjectId } from "@/lib/ids";
import { recountQuotation } from "@/lib/quote-import/recount";
import { COMMIT_LOCK_TTL_MS } from "@/lib/quote-import/commitLock";

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
  const quotation = await Quotation.findById(quotationId).select("commitLockedAt").lean();
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  if (quotation.commitLockedAt && quotation.commitLockedAt.getTime() > Date.now() - COMMIT_LOCK_TTL_MS) {
    return NextResponse.json(
      { error: "This quote is being committed right now. Wait a moment, then refresh and try again." },
      { status: 409 }
    );
  }

  const userId = gate.session.user?.id;
  const result = await QuotationRow.updateMany(
    { quotationId, reviewStatus: "needs_review", committedItemId: null, "flags.0": { $exists: false } },
    {
      $set: {
        reviewStatus: "approved",
        reviewedAt: new Date(),
        ...(userId ? { reviewedBy: new Types.ObjectId(userId) } : {}),
      },
    }
  );
  await recountQuotation(quotationId);

  return NextResponse.json({ approved: result.modifiedCount });
}
