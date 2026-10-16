import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { QuotationPatchSchema, badRequest } from "@/lib/schemas";
import { QUOTE_HEADER_TO_KEY } from "@/lib/quote-import/fields";
import { Types } from "mongoose";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import { getSharePointContext, deleteDriveItem } from "@/lib/sharepoint/client";
import logger from "@/lib/logger";

const QUOTE_ROLES = ROLE_SETS.quotes;

// PATCH /api/quotations/[quotationId] — quote-level operations.
//
// Today this endpoint drives one thing: adding or removing a quote-level
// custom column that the reviewer wants rendered on every row of this
// quote (e.g. the vendor forgot a "Finish" column and the reviewer wants
// to type it in per row). The actual VALUES for that column still live
// in each row's own __custom map and are edited through
// PATCH .../rows/[rowId]; this endpoint only maintains the ordered label
// list the review table iterates to decide what blank columns to render.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ quotationId: string }> }
) {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;

  const { quotationId } = await params;
  const parsed = QuotationPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);

  await connectDB();
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  if (parsed.data.op === "add_custom_column") {
    const label = parsed.data.label.trim();
    // Standard fields have their own columns in the review table; a
    // custom column with the same label would double up and mislead the
    // reviewer about where edits land.
    if (QUOTE_HEADER_TO_KEY[label.toLowerCase()]) {
      return NextResponse.json(
        { error: `"${label}" is already a standard column — look for it on each row.` },
        { status: 409 }
      );
    }
    const existing = quotation.customColumns ?? [];
    if (existing.some((l) => l.toLowerCase() === label.toLowerCase())) {
      return NextResponse.json(
        { error: `"${label}" is already a custom column on this quote.` },
        { status: 409 }
      );
    }
    quotation.customColumns = [...existing, label];
    await quotation.save();
    return NextResponse.json({ customColumns: quotation.customColumns });
  }

  if (parsed.data.op === "remove_custom_column") {
    const label = parsed.data.label.trim().toLowerCase();
    const existing = quotation.customColumns ?? [];
    const next = existing.filter((l) => l.toLowerCase() !== label);
    if (next.length === existing.length) {
      return NextResponse.json(
        { error: "No custom column with that label on this quote." },
        { status: 404 }
      );
    }
    quotation.customColumns = next;
    await quotation.save();
    // Note: this only removes the LABEL from the quote-level visible-
    // columns list. Any per-row values already typed under that label
    // in a row's __custom map are left in place so they aren't lost by
    // an accidental click — the reviewer can clear them per row through
    // the row PATCH endpoint if they really meant to drop the data.
    return NextResponse.json({ customColumns: quotation.customColumns });
  }

  return NextResponse.json({ error: "Unsupported op" }, { status: 400 });
}

// DELETE /api/quotations/[quotationId] — discard a quote that was uploaded or
// entered by mistake, with all its staged rows. Only while none of its rows
// has been committed: after that its data lives on items and a purchase
// order, and deleting the quote would orphan that history.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ quotationId: string }> }
) {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;

  const { quotationId } = await params;
  if (!Types.ObjectId.isValid(quotationId)) {
    return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  }
  await connectDB();
  const quotation = await Quotation.findById(quotationId).select("_id sourceFile").lean();
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const committed = await QuotationRow.countDocuments({ quotationId, committedItemId: { $ne: null } });
  if (committed > 0) {
    return NextResponse.json(
      { error: `${committed} row(s) from this quote are already committed, so it can't be deleted.` },
      { status: 409 }
    );
  }

  await QuotationRow.deleteMany({ quotationId });
  await Quotation.deleteOne({ _id: quotationId });

  // Nothing from this quote reached a PO, so its uploaded file goes too
  // (to the SharePoint recycle bin, where it can still be restored).
  if (quotation.sourceFile?.driveItemId) {
    try {
      await deleteDriveItem(await getSharePointContext(), quotation.sourceFile.driveItemId);
    } catch (err) {
      logger.warn("quote delete: removing the SharePoint file failed", {
        quotationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return NextResponse.json({ ok: true });
}
