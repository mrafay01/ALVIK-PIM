import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { QuotationManualSchema, badRequest } from "@/lib/schemas";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import Vendor from "@/models/Vendor";
import {
  parseQuoteFileBuffer,
  stageManualRow,
  QuoteParseError,
  SheetChoiceNeededError,
  type StagedQuoteRow,
  type SheetCandidate,
} from "@/lib/quote-import/parseQuoteFile";
import { getSharePointContext, getDriveItem, downloadDriveItem, deleteDriveItem, relativeFolderPath } from "@/lib/sharepoint/client";
import {
  verifyUploadTicket,
  itemMatchesTicket,
  fileQuotationIntoPoFolder,
  MAX_QUOTE_FILE_BYTES,
} from "@/lib/purchase-orders/files";
import { normalizePoNumber } from "@/lib/purchase-orders/fromQuotation";
import { formatPoNumber, poNumberFromFileName } from "@/lib/purchase-orders/poNumber";
import logger from "@/lib/logger";

// Who may intake a quote — buyers/purchasing own the PO area this lives
// under; marketplace_listing already has item-create rights elsewhere.
const QUOTE_ROLES = ROLE_SETS.quotes;

const MAX_ROWS = 5_000;

// A file-upload import: the browser has already uploaded the workbook to
// SharePoint (see ./upload-session) and sends its ticket + drive item id.
const FileImportSchema = z.object({
  file: z.object({ ticket: z.string().max(2000), driveItemId: z.string().min(1).max(200) }),
  vendorId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  vendorName: z.string().trim().max(200).optional(),
  // Set on the resubmit after the "which sheet?" picker.
  sheetName: z.string().trim().max(100).optional(),
});

// POST: intake a quote, as JSON either way:
//   { file: { ticket, driveItemId }, vendor..., sheetName? } -> a vendor
//       quote file already uploaded to SharePoint; download and parse it
//   { items: [...], vendor... } -> a hand-entered quote from "new quote"
// Both stage rows into QuotationRow (never straight into `items`) so the
// review page is the one place rows become items.
export async function POST(req: NextRequest) {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;
  const userId = session.user?.id ? new Types.ObjectId(session.user.id) : undefined;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  await connectDB();

  let vendorId: string | undefined;
  let vendorName: string | undefined;
  let source: "file_upload" | "manual";
  let sourceFileName: string | null = null;
  let sourceFile: { driveItemId: string; name: string; size?: number; webUrl: string; folder: string } | null = null;
  let poNumber: string | null = null;
  let staged: StagedQuoteRow[];

  if (body && typeof body === "object" && "file" in body) {
    const parsed = FileImportSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    const d = parsed.data;
    if (d.vendorId) vendorId = d.vendorId;
    else if (d.vendorName) vendorName = d.vendorName;
    else return NextResponse.json({ error: "Choose a vendor for this quote" }, { status: 400 });

    const ticket = verifyUploadTicket(d.file.ticket, session.user?.id ?? "");
    if (!ticket) {
      return NextResponse.json({ error: "The upload has expired. Choose the file again." }, { status: 400 });
    }
    // The PO is named after the file as the user uploaded it (the ticket's
    // name, not SharePoint's "22906 1.xlsx" rename of a duplicate).
    poNumber = poNumberFromFileName(ticket.n);

    let ctx;
    let buffer: ArrayBuffer;
    try {
      ctx = await getSharePointContext();
      const item = await getDriveItem(ctx, d.file.driveItemId);
      if (!itemMatchesTicket(item, ticket)) {
        return NextResponse.json({ error: "Uploaded file not found. Choose the file again." }, { status: 400 });
      }
      buffer = await downloadDriveItem(ctx, item.id, MAX_QUOTE_FILE_BYTES);
      sourceFile = {
        driveItemId: item.id,
        name: item.name,
        size: item.size,
        webUrl: item.webUrl,
        folder: relativeFolderPath(item),
      };
      sourceFileName = item.name;
    } catch (err) {
      logger.error("quote import: reading the uploaded file from SharePoint failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Couldn't read the uploaded file from SharePoint. Try again in a moment." },
        { status: 502 }
      );
    }

    source = "file_upload";
    try {
      const parsedFile = await parseQuoteFileBuffer(buffer, sourceFile.name, { sheetName: d.sheetName });
      staged = parsedFile.rows;
      // Only when the file name gave nothing: the PO number printed in the
      // file's preamble ("CZ's PO: 20711 2025FFCZ052" -> "20711").
      if (!poNumber && parsedFile.preamblePoNumber) poNumber = parsedFile.preamblePoNumber;
    } catch (err) {
      if (err instanceof SheetChoiceNeededError) {
        // The workbook has more than one plausible item sheet (23146.xls
        // -> CZ / PI-HT / SHI / PL). Return a structured 409 so the UI
        // can show a picker and resubmit with sheetName. The file stays
        // in SharePoint for that resubmit.
        return NextResponse.json(
          {
            error: "This workbook has more than one sheet that looks like an item table. Pick which one.",
            needsSheetChoice: true,
            candidates: err.candidates satisfies SheetCandidate[],
          },
          { status: 409 }
        );
      }
      // Not a readable quote: don't leave the unusable upload behind.
      await deleteDriveItem(ctx, sourceFile.driveItemId).catch(() => undefined);
      const message =
        err instanceof QuoteParseError
          ? (err as Error).message
          : `Could not parse file: ${(err as Error).message}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else {
    const parsed = QuotationManualSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    vendorId = parsed.data.vendorId;
    vendorName = parsed.data.vendorName;
    source = "manual";
    poNumber = formatPoNumber(parsed.data.poNumber);
    staged = parsed.data.items.map((it, i) => stageManualRow(i + 1, it.fields, it.custom ?? {}));
  }

  if (vendorId) {
    const vendor = await Vendor.findById(vendorId).select("_id").lean();
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 400 });
  } else if (vendorName) {
    // Manual-entry path: the vendor doesn't have to exist in PIM yet — find
    // it by exact name, or create it on the fly. Vendor.name is unique, so
    // a race with another request creating the same name at the same
    // moment fails only this insert (caught below), never produces a
    // duplicate; the re-read then picks up whichever one actually landed.
    const existing = await Vendor.findOne({ name: vendorName }).select("_id").lean();
    if (existing) {
      vendorId = String(existing._id);
    } else {
      try {
        const created = await Vendor.create({ name: vendorName });
        vendorId = String(created._id);
      } catch (err) {
        const isDuplicateKey = (err as { code?: number }).code === 11000;
        if (!isDuplicateKey) throw err;
        const reRead = await Vendor.findOne({ name: vendorName }).select("_id").lean();
        if (!reRead) throw err;
        vendorId = String(reRead._id);
      }
    }
  } else {
    // Unreachable in practice: QuotationManualSchema's refine() guarantees
    // one of the two is set for the manual (JSON) path, and the multipart
    // branch above already returns early if neither vendorId nor
    // vendorName was present in the form.
    return NextResponse.json({ error: "Choose a vendor for this quote" }, { status: 400 });
  }

  if (staged.length === 0) {
    return NextResponse.json({ error: "No line items found in the quote" }, { status: 400 });
  }
  if (staged.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${staged.length}); the limit per quote is ${MAX_ROWS}` },
      { status: 413 }
    );
  }

  const flaggedCount = staged.filter((r) => r.flags.length > 0).length;

  const quotation = await Quotation.create({
    vendorId,
    source,
    sourceFileName,
    sourceFile,
    poNumber,
    status: "needs_review",
    totalRows: staged.length,
    flaggedRows: flaggedCount,
    createdBy: userId,
  });

  await QuotationRow.insertMany(
    staged.map((r) => ({
      quotationId: quotation._id,
      rowNumber: r.rowNumber,
      coerced: r.coerced,
      flags: r.flags,
      reviewStatus: "needs_review" as const,
    }))
  );

  // Now that the PO number is known (typed, or read from the file), move
  // the upload out of _Unassigned into that PO's folder. Otherwise it moves
  // when the quote is committed and its PO number is assigned.
  const knownPo = normalizePoNumber(poNumber);
  if (sourceFile && knownPo) {
    try {
      await fileQuotationIntoPoFolder(quotation._id, knownPo);
    } catch (err) {
      logger.warn("quote import: moving the file into its PO folder failed", {
        quotationId: String(quotation._id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json(
    { quotationId: quotation._id, totalRows: staged.length, flaggedRows: flaggedCount },
    { status: 201 }
  );
}
