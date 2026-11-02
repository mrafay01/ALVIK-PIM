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

// A PO document stored in SharePoint under "Purchase Orders/{poNumber}/".
// Either copied from the Monday board's files column (mondayAssetId set)
// or uploaded in the app with a vendor quote (quotationId set).
const SharePointFileSchema = new Schema(
  {
    source: { type: String, enum: ["monday", "upload"], required: true },
    name: { type: String, required: true },
    driveItemId: { type: String, required: true },
    webUrl: { type: String, required: true },
    size: Number,
    mondayAssetId: { type: String, default: null },
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation", default: null },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ArchiveErrorSchema = new Schema(
  {
    assetId: { type: String, required: true },
    message: String,
    attempts: { type: Number, default: 0 },
    at: Date,
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
    poNumber: { type: String, required: true, unique: true },
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

    trackingNumber: { type: String, default: null },

    joelShipConfirmed: { type: Boolean, default: false },
    vendorReplySent: { type: Boolean, default: false },
    vendorReplySentBy: { type: Schema.Types.ObjectId, ref: "User" },
    vendorReplySentAt: Date,

    statusHistory: [StatusHistoryEntrySchema],

    // Where this PO record was first created. "monday" = the inbound board
    // pull; "quotation" = committing a vendor quote (file upload or manual
    // entry). Null on POs created before this field existed — the list
    // page treats a PO with a mondayItemId as Monday-sourced in that case.
    // "manual" = created from an item's detail page (sample PO flow).
    source: { type: String, enum: ["monday", "quotation", "manual"], default: null },
    // Quotes whose committed rows were attached to this PO. A PO number can
    // be shared by a Monday board item and an uploaded PI file; both land
    // on the same PO rather than creating a duplicate.
    quotationIds: [{ type: Schema.Types.ObjectId, ref: "Quotation" }],

    mondayItemId: { type: String, default: null },
    mondayFiles: [MondayFileSchema],
    // Copies of this PO's documents in SharePoint (see SharePointFileSchema)
    // and a link to its folder there.
    sharePointFiles: { type: [SharePointFileSchema], default: [] },
    sharePointFolderUrl: { type: String, default: null },
    // Monday files that couldn't be copied: the latest error per asset, and
    // the assets given up on after repeated failures (or that no longer
    // exist on Monday), so the archiver stops retrying them.
    archiveErrors: { type: [ArchiveErrorSchema], default: [] },
    archiveGaveUp: { type: [String], default: [] },
    // Set only while one copy run is working on this PO's Monday files, so
    // two runs (two admins, or the screen and the background worker) never
    // copy the same file twice. Removed when the run finishes; a lock older
    // than ARCHIVE_LOCK_MS (lib/purchase-orders/files.ts) counts as abandoned.
    archiveLockedAt: Date,
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
// POs list page sorts by updatedAt with no status filter; the (status, updatedAt)
// compound above can't serve that query path.
PurchaseOrderSchema.index({ updatedAt: -1 });
// syncAllPurchaseOrders() filter: {mondayItemId:null} OR {lastPushedToMondayAt:null}
// OR updatedAt > lastPushedToMondayAt — the first two paths get a sparse index each
// so the whole bulk-sync picker scans only the small "needs push" tail of the
// collection instead of the full table.
PurchaseOrderSchema.index({ lastPushedToMondayAt: 1 }, { sparse: true });
// High-priority stat tile count on the list page.
PurchaseOrderSchema.index({ priority: 1 });

export type PurchaseOrderDoc = InferSchemaType<typeof PurchaseOrderSchema>;
export default (models.PurchaseOrder as Model<PurchaseOrderDoc>) ||
  model<PurchaseOrderDoc>("PurchaseOrder", PurchaseOrderSchema);
