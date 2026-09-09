import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { QC_RESULTS } from "@/lib/enums";

const ContentCheckSchema = new Schema(
  {
    weight: { type: String, enum: QC_RESULTS, default: "good" },
    qty: { type: String, enum: QC_RESULTS, default: "good" },
    silver: { type: String, enum: QC_RESULTS, default: "good" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const PackagingCheckSchema = new Schema(
  {
    status: { type: String, enum: QC_RESULTS, default: "good" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const ReceivingLogSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    poId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
    boxNumber: String,
    qtyReceived: Number,
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    receivedAt: { type: Date, default: Date.now },
    photographyRequested: { type: Boolean, default: false },
    photographyCompletedAt: Date,
    contentCheck: { type: ContentCheckSchema, default: () => ({}) },
    packagingCheck: { type: PackagingCheckSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type ReceivingLogDoc = InferSchemaType<typeof ReceivingLogSchema>;
export default (models.ReceivingLog as Model<ReceivingLogDoc>) ||
  model<ReceivingLogDoc>("ReceivingLog", ReceivingLogSchema);
