import { Types } from "mongoose";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";

export type QuoteCounts = { pending: number; approvedUncommitted: number; committed: number };

// A quote's status from its rows:
//   needs_review — some row still needs a decision
//   committed    — at least one row committed and nothing approved is left
//                  waiting (rejected rows don't count)
//   reviewed     — every row decided, approved ones not all committed yet
// Recomputed after every decision, so turning a row back (or approving a
// row on an already-committed quote) moves the quote back too, and its
// Commit button comes back.
export function quoteStatusFor(c: QuoteCounts): "needs_review" | "reviewed" | "committed" {
  if (c.pending > 0) return "needs_review";
  if (c.committed > 0 && c.approvedUncommitted === 0) return "committed";
  return "reviewed";
}

// Recounts the quote's summary numbers and status from its rows.
export async function recountQuotation(quotationId: string | Types.ObjectId): Promise<void> {
  const id = new Types.ObjectId(String(quotationId));
  const [approvedRows, rejectedRows, pending, flaggedRows, committed, approvedUncommitted] = await Promise.all([
    QuotationRow.countDocuments({ quotationId: id, reviewStatus: "approved" }),
    QuotationRow.countDocuments({ quotationId: id, reviewStatus: "rejected" }),
    QuotationRow.countDocuments({ quotationId: id, reviewStatus: "needs_review", committedItemId: null }),
    QuotationRow.countDocuments({ quotationId: id, "flags.0": { $exists: true } }),
    QuotationRow.countDocuments({ quotationId: id, committedItemId: { $ne: null } }),
    QuotationRow.countDocuments({ quotationId: id, reviewStatus: "approved", committedItemId: null }),
  ]);
  const status = quoteStatusFor({ pending, approvedUncommitted, committed });
  await Quotation.updateOne(
    // A quote still being parsed keeps its status until parsing finishes.
    { _id: id, status: { $ne: "parsing" } },
    { $set: { approvedRows, rejectedRows, flaggedRows, status } }
  );
}
