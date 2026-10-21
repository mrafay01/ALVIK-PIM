import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { QUOTATION_STATUSES, QUOTATION_SOURCES } from "@/lib/enums";

// One document per intaken quote — either a vendor quote file uploaded on the
// Purchase Orders page, or a quote entered by hand on the "new quote" page.
// Its parsed/entered rows live in the separate QuotationRow collection
// (quotationId-referenced), not embedded here — a large multi-item quote
// with every row's raw + coerced values can push a single document past
// MongoDB's 16MB ceiling, the same failure mode ImportBatchRow was split
// out to avoid.

const QuotationSchema = new Schema(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },

    source: { type: String, enum: QUOTATION_SOURCES, required: true },
    // Present for file_upload quotes; absent for manual ones.
    sourceFileName: String,

    // "PO-<number>": the uploaded file's name, or the number typed on the
    // hand-entry form (lib/purchase-orders/poNumber.ts). Commit creates or
    // joins the PurchaseOrder with this number.
    poNumber: { type: String, default: null },

    status: { type: String, enum: QUOTATION_STATUSES, default: "parsing" },

    totalRows: { type: Number, default: 0 },
    flaggedRows: { type: Number, default: 0 },
    approvedRows: { type: Number, default: 0 },
    rejectedRows: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },

    // Items created when the quote's approved rows were committed.
    itemIds: [{ type: Schema.Types.ObjectId, ref: "Item" }],

    // Quote-level custom column labels. The review table renders a column
    // for every entry here on EVERY row, so a reviewer can add a field
    // the vendor forgot to include (e.g. "Finish") once and fill it in
    // per row. Separate from the per-row __custom map that holds the
    // values themselves — these are just the labels the reviewer wants
    // visible on every row of this quote. Deduplicated by lowercase at
    // write time; the display preserves the original casing.
    customColumns: { type: [String], default: [] },

    // The purchase order this quote's committed rows were attached to (set
    // on commit — see src/lib/purchase-orders/fromQuotation.ts). Lets the
    // quote screens link straight to the PO.
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", default: null },

    // Set while a commit is running so a second commit of the same quote
    // (double click, two reviewers) waits instead of creating duplicate
    // items. A lock older than COMMIT_LOCK_TTL_MS in the commit route is
    // treated as abandoned (crashed request) and can be taken over.
    commitLockedAt: Date,

    // The uploaded PO/PI file as stored in SharePoint (file uploads only).
    // `folder` is the path inside the drive, e.g. "Purchase Orders/22906",
    // or ".../_Unassigned" until the quote's PO number is known.
    sourceFile: {
      type: new Schema(
        {
          driveItemId: { type: String, required: true },
          name: { type: String, required: true },
          size: Number,
          webUrl: { type: String, required: true },
          folder: String,
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);

// Quotes list sorts newest-first; the review page loads one by _id.
QuotationSchema.index({ createdAt: -1 });
// Dashboard: quotations needing review
QuotationSchema.index({ status: 1 });

export type QuotationDoc = InferSchemaType<typeof QuotationSchema>;
export default (models.Quotation as Model<QuotationDoc>) ||
  model<QuotationDoc>("Quotation", QuotationSchema);
