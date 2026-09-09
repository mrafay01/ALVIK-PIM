import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import {
  PO_STATUSES,
  IMAGE_STATUSES,
  ORDER_PURPOSE_CATEGORIES,
  PRIORITIES,
  IMAGES_CHECKLIST_STATUSES,
  DATA_CHECKLIST_STATUSES,
  PRICING_CHECKLIST_STATUSES,
  JM_UPDATE_STATUSES,
  ON_MASTER_STATUSES,
  DESCRIPTIONS_STATUSES,
} from "@/lib/enums";

const MondayFileSchema = new Schema(
  {
    name: { type: String, required: true },
    assetId: { type: String, required: true },
  },
  { _id: false }
);

const LineItemSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    qty: Number,
    unitCost: Number,
    totalCost: Number,
  },
  { _id: false }
);

const StatusHistoryEntrySchema = new Schema(
  {
    status: { type: String, enum: PO_STATUSES, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const BackOfficeChecklistSchema = new Schema(
  {
    images: { type: String, enum: IMAGES_CHECKLIST_STATUSES, default: "pending" },
    data: { type: String, enum: DATA_CHECKLIST_STATUSES, default: "pending" },
    pricing: { type: String, enum: PRICING_CHECKLIST_STATUSES, default: "pending" },
    jmUpdate: { type: String, enum: JM_UPDATE_STATUSES, default: "pending" },
    onMaster: { type: String, enum: ON_MASTER_STATUSES, default: "pending" },
    descriptions: { type: String, enum: DESCRIPTIONS_STATUSES, default: "pending" },
  },
  { _id: false }
);

const PurchaseOrderSchema = new Schema(
  {
    poNumber: { type: String, required: true, unique: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },

    orderPurpose: {
      category: { type: String, enum: ORDER_PURPOSE_CATEGORIES, required: true },
      tag: { type: String, default: null },
    },
    priority: { type: String, enum: PRIORITIES, default: "medium" },

    lineItems: [LineItemSchema],

    status: { type: String, enum: PO_STATUSES, required: true, default: "send_to_vendor" },
    imageStatus: { type: String, enum: IMAGE_STATUSES, default: "pending" },
    backOfficeChecklist: { type: BackOfficeChecklistSchema, default: () => ({}) },

    orderDate: Date,
    requestDate: Date,
    vendorConfDate: Date,

    poTotal: Number,
    remainingBalance: Number,
    prepaymentDeposit: Number,

    shipmentId: { type: Schema.Types.ObjectId, ref: "Shipment", default: null },

    joelShipConfirmed: { type: Boolean, default: false },
    vendorReplySent: { type: Boolean, default: false },
    vendorReplySentBy: { type: Schema.Types.ObjectId, ref: "User" },
    vendorReplySentAt: Date,

    statusHistory: [StatusHistoryEntrySchema],

    mondayItemId: { type: String, default: null },
    mondayFiles: [MondayFileSchema],
    lastPulledFromMondayAt: Date,
  },
  { timestamps: true }
);

export type PurchaseOrderDoc = InferSchemaType<typeof PurchaseOrderSchema>;
export default (models.PurchaseOrder as Model<PurchaseOrderDoc>) ||
  model<PurchaseOrderDoc>("PurchaseOrder", PurchaseOrderSchema);
