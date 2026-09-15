import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import {
  QUOTATION_IMPORT_STATUSES,
  QUOTATION_STATUSES,
  QUOTATION_SOURCES,
} from "@/lib/enums";

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
    sourceFileName: { type: String, default: null },
    sourceFileUrl: { type: String, default: null },

    // The vendor's own PO / quote reference, if the sheet or the person
    // supplied one. Free text — not linked to a PurchaseOrder document.
    poNumber: { type: String, default: null },
    receivedDate: Date,
    season: String,

    status: { type: String, enum: QUOTATION_STATUSES, default: "parsing" },
    // Retained from the original schema for backward compatibility with any
    // code/readers expecting it; `status` above is the field the review flow
    // actually drives.
    importStatus: {
      type: String,
      enum: QUOTATION_IMPORT_STATUSES,
      default: "needs_review",
    },

    totalRows: { type: Number, default: 0 },
    flaggedRows: { type: Number, default: 0 },
    approvedRows: { type: Number, default: 0 },
    rejectedRows: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },

    // Items created when the quote's approved rows were committed.
    itemIds: [{ type: Schema.Types.ObjectId, ref: "Item" }],
  },
  { timestamps: true }
);

// Quotes list sorts newest-first; the review page loads one by _id.
QuotationSchema.index({ createdAt: -1 });
QuotationSchema.index({ vendorId: 1 });
// Dashboard: quotations needing review
QuotationSchema.index({ status: 1 });

export type QuotationDoc = InferSchemaType<typeof QuotationSchema>;
export default (models.Quotation as Model<QuotationDoc>) ||
  model<QuotationDoc>("Quotation", QuotationSchema);
