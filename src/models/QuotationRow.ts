import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { QUOTATION_ROW_STATUSES } from "@/lib/enums";

// One document per line item on a quote, in its own top-level collection
// rather than embedded in Quotation — see Quotation.ts for the 16MB-document
// rationale (same as ImportBatchRow). `coerced` is dot-path keyed to match
// the Item schema so the commit step can write it straight through
// setDotPath, exactly like the legacy Master File import.

const FieldFlagSchema = new Schema(
  {
    field: { type: String, required: true },
    message: { type: String, required: true },
    rawValue: Schema.Types.Mixed,
  },
  { _id: false }
);

const QuotationRowSchema = new Schema(
  {
    // Indexed through the compound index below (quotationId leads it).
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation", required: true },
    rowNumber: { type: Number, required: true }, // 1-based
    // No copy of the original row is kept: nothing reads it, flags carry
    // their rawValue, and the uploaded PI itself is filed in SharePoint.
    coerced: { type: Schema.Types.Mixed, default: {} }, // parsed values, dot-path keyed to Item
    flags: [FieldFlagSchema],
    reviewStatus: {
      type: String,
      enum: QUOTATION_ROW_STATUSES,
      default: "needs_review",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: String,
    committedItemId: { type: Schema.Types.ObjectId, ref: "Item", default: null },
  },
  { timestamps: true }
);

// The review page filters by (quotationId, reviewStatus) and the commit
// route also filters committedItemId — one compound index covers all three.
QuotationRowSchema.index({ quotationId: 1, reviewStatus: 1, committedItemId: 1 });

export type QuotationRowDoc = InferSchemaType<typeof QuotationRowSchema>;
export default (models.QuotationRow as Model<QuotationRowDoc>) ||
  model<QuotationRowDoc>("QuotationRow", QuotationRowSchema);
