import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { QUOTATION_IMPORT_STATUSES } from "@/lib/enums";

const QuotationSchema = new Schema(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    sourceFileUrl: { type: String, required: true },
    receivedDate: Date,
    season: String,
    itemIds: [{ type: Schema.Types.ObjectId, ref: "Item" }],
    importStatus: {
      type: String,
      enum: QUOTATION_IMPORT_STATUSES,
      default: "needs_review",
    },
  },
  { timestamps: true }
);

export type QuotationDoc = InferSchemaType<typeof QuotationSchema>;
export default (models.Quotation as Model<QuotationDoc>) ||
  model<QuotationDoc>("Quotation", QuotationSchema);
