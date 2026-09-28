import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail } from "@/lib/authz";
import { QuotationManualSchema, badRequest } from "@/lib/schemas";
import Quotation from "@/models/Quotation";
import QuotationRow from "@/models/QuotationRow";
import Vendor from "@/models/Vendor";
import {
  parseQuoteFileBuffer,
  stageManualRow,
  QuoteParseError,
  type StagedQuoteRow,
} from "@/lib/quote-import/parseQuoteFile";

// Who may intake a quote — buyers/purchasing own the PO area this lives
// under; marketplace_listing already has item-create rights elsewhere.
const QUOTE_ROLES = ["buying_purchasing", "buyer_merchandiser", "marketplace_listing"] as const;

// The whole file is buffered and parsed in one request. A real vendor quote
// is small (tens to low-hundreds of rows); cap it so one large upload can't
// exhaust the instance.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5_000;

// GET: list quotations, newest first, for the quotes index page.
export async function GET() {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;

  await connectDB();
  const quotations = await Quotation.find({})
    .select("source sourceFileName poNumber vendorId status totalRows flaggedRows approvedRows rejectedRows createdAt")
    .populate("vendorId", "name")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({ quotations });
}

// POST: intake a quote. Two content types:
//   multipart/form-data  -> a vendor quote file (.xlsx/.csv); parse it
//   application/json      -> a hand-entered quote from the "new quote" page
// Both stage rows into QuotationRow (never straight into `items`) so the
// review page is the one place rows become items.
export async function POST(req: NextRequest) {
  const gate = await requireRole([...QUOTE_ROLES]);
  if (isAuthFail(gate)) return gate.response;
  const { session } = gate;
  const userId = session.user?.id ? new Types.ObjectId(session.user.id) : undefined;

  const contentType = req.headers.get("content-type") ?? "";
  await connectDB();

  let vendorId: string | undefined;
  let vendorName: string | undefined;
  let source: "file_upload" | "manual";
  let sourceFileName: string | null = null;
  let poNumber: string | null = null;
  let receivedDate: Date | undefined;
  let season: string | undefined;
  let staged: StagedQuoteRow[];

  if (contentType.includes("multipart/form-data")) {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` },
        { status: 413 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const vendorField = form.get("vendorId");
    const vendorNameField = form.get("vendorName");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` },
        { status: 413 }
      );
    }
    // Same either/or as the manual (JSON) path — an existing vendor picked
    // from the dropdown, or a brand-new name typed into its "+ Add new
    // vendor" option, resolved/created below alongside the manual path's
    // identical logic.
    if (typeof vendorField === "string" && /^[0-9a-fA-F]{24}$/.test(vendorField)) {
      vendorId = vendorField;
    } else if (typeof vendorNameField === "string" && vendorNameField.trim()) {
      vendorName = vendorNameField.trim().slice(0, 200);
    } else {
      return NextResponse.json({ error: "Choose a vendor for this quote" }, { status: 400 });
    }
    source = "file_upload";
    sourceFileName = file.name;
    const poField = form.get("poNumber");
    if (typeof poField === "string" && poField.trim()) poNumber = poField.trim().slice(0, 200);
    const seasonField = form.get("season");
    if (typeof seasonField === "string" && seasonField.trim()) season = seasonField.trim().slice(0, 120);

    try {
      staged = await parseQuoteFileBuffer(await file.arrayBuffer(), file.name);
    } catch (err) {
      // QuoteParseError carries a message written for the user (e.g. the
      // legacy-.xls guidance); anything else is an unexpected parse failure.
      const message =
        err instanceof QuoteParseError
          ? (err as Error).message
          : `Could not parse file: ${(err as Error).message}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else {
    const parsed = QuotationManualSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest(parsed.error);
    vendorId = parsed.data.vendorId;
    vendorName = parsed.data.vendorName;
    source = "manual";
    poNumber = parsed.data.poNumber ?? null;
    if (parsed.data.receivedDate) receivedDate = new Date(parsed.data.receivedDate);
    season = parsed.data.season;
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
    poNumber,
    receivedDate,
    season,
    status: "needs_review",
    importStatus: "needs_review",
    totalRows: staged.length,
    flaggedRows: flaggedCount,
    createdBy: userId,
  });

  await QuotationRow.insertMany(
    staged.map((r) => ({
      quotationId: quotation._id,
      rowNumber: r.rowNumber,
      raw: r.raw,
      coerced: r.coerced,
      flags: r.flags,
      reviewStatus: "needs_review" as const,
    }))
  );

  return NextResponse.json(
    { quotationId: quotation._id, totalRows: staged.length, flaggedRows: flaggedCount },
    { status: 201 }
  );
}
