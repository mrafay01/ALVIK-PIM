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
    trackingNumber: { type: String, default: null },

    joelShipConfirmed: { type: Boolean, default: false },
    vendorReplySent: { type: Boolean, default: false },
    vendorReplySentBy: { type: Schema.Types.ObjectId, ref: "User" },
    vendorReplySentAt: Date,

    statusHistory: [StatusHistoryEntrySchema],

    mondayItemId: { type: String, default: null },
    mondayFiles: [MondayFileSchema],
    // The board's Status-column label verbatim, stored on every pull
    // regardless of whether it maps to a PoStatus — the app's pipeline
    // `status` field above is a strict linear enum (PoActions.tsx /
    // isValidPoTransition do index math on it) and can't absorb side-lane
    // board states like "Stuck" or "Canceled" without breaking that
    // ordering, so this is how those states stay visible instead of being
    // silently dropped by the pull.
    mondayStatusText: { type: String, default: null },
    // True when mondayStatusText was confidently mapped to `status` on the
    // most recent pull (i.e. it's a MONDAY_LABEL_TO_STATUS key); false means
    // the board is currently sitting in a side-lane state the pipeline
    // doesn't model, and `status` was left unchanged.
    mondayStatusMapped: { type: Boolean, default: null },
    lastPulledFromMondayAt: Date,
    // Set after a successful push to Monday; used by the bulk sync to skip
    // POs that haven't changed since they were last pushed.
    lastPushedToMondayAt: Date,
  },
  { timestamps: true }
);

// List page filters by status, sorts by updatedAt desc.
PurchaseOrderSchema.index({ status: 1, updatedAt: -1 });
PurchaseOrderSchema.index({ vendorId: 1 });
// Item detail page: PurchaseOrder.find({ "lineItems.itemId": itemId }).
PurchaseOrderSchema.index({ "lineItems.itemId": 1 });
// Monday pull matches board items to POs by mondayItemId.
PurchaseOrderSchema.index({ mondayItemId: 1 }, { sparse: true });

export type PurchaseOrderDoc = InferSchemaType<typeof PurchaseOrderSchema>;
export default (models.PurchaseOrder as Model<PurchaseOrderDoc>) ||
  model<PurchaseOrderDoc>("PurchaseOrder", PurchaseOrderSchema);
