import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { ITEM_STATUSES, ITEM_ORIGINS, ORDER_REASONS, URGENCIES, IMAGE_SUBFOLDERS } from "@/lib/enums";
import { splitSku } from "@/lib/catalog/sku";

const StoneInfoSchema = new Schema(
  {
    type: String,
    color: String,
    count: Number,
    size: String,
  },
  { _id: false }
);

const SpecsSchema = new Schema(
  {
    metal: String,
    plating: String,
    stoneInfo: [StoneInfoSchema],
    weight: {
      totalG: Number,
      silverG: Number,
    },
    ringSize: String,
    clasp: String,
    chainLength: String,
    thickness: String,
    gender: String,
    tcw: String,
    birthstone: String,
  },
  { _id: false, strict: false } // open shape — attribute set varies by category
);

const MediaItemSchema = new Schema(
  {
    sharePointItemId: { type: String, required: true },
    url: { type: String, required: true },
    subfolder: { type: String, enum: IMAGE_SUBFOLDERS, required: true },
    sequence: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PricingHistoryEntrySchema = new Schema(
  {
    costPerUnit: Number,
    msrp: Number,
    ruePrice: Number,
    currency: { type: String, default: "USD" },
    effectiveDate: { type: Date, default: Date.now },
    source: String,
  },
  { _id: false }
);

const CostHistoryEntrySchema = new Schema(
  {
    poId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder" },
    laborCostPerGram: Number,
    materialCostPerGram: Number,
    qty: Number,
    total: Number,
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ItemSchema = new Schema(
  {
    status: { type: String, enum: ITEM_STATUSES, required: true, default: "quoted" },
    sampleSku: { type: String, index: true },
    itemNumber: { type: String, index: true, unique: true, sparse: true },

    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    vendorSku: String,

    // SKU family key: itemNumber before the first hyphen (A1234-GP -> A1234).
    // Derived automatically from itemNumber by the pre-save hook below;
    // create paths that use insertMany (which skips hooks) set it explicitly.
    baseSku: { type: String, index: true },
    // Everything after the first hyphen ("GP", "RP", "GP-6"), or null for a
    // non-variant/base row.
    variantSuffix: { type: String, default: null },

    // Named collectionName, not collection — "collection" is a reserved
    // Mongoose schema option and would silently misbehave if used directly.
    collectionName: String,
    season: String,
    category: String,

    // Listing content. `title`, `description`, `bulletFeatures` are the
    // customer-facing catalog copy; `brand`/`upc` come from the Master File
    // import (previously silently dropped — the root schema is strict).
    title: String,
    description: String,
    bulletFeatures: { type: [String], default: undefined },
    brand: String,
    upc: { type: String, index: true, sparse: true },

    specs: SpecsSchema,

    reviewDecision: {
      decision: String,
      note: String,
      reviewerId: { type: Schema.Types.ObjectId, ref: "User" },
      decidedAt: Date,
    },
    rejectionReason: { type: String, default: null },

    sharePointFolderPath: String,
    media: [MediaItemSchema],
    imageCompleteness: {
      main: { type: Boolean, default: false },
      sides: { type: Boolean, default: false },
      models: { type: Boolean, default: false },
    },

    boxNumber: { type: String, default: null },

    // Free-form columns a vendor quote carried that don't map to a known
    // spec field — the quote sheet's column set isn't fixed. Keyed by the
    // vendor's exact label, values are always plain text. Kept apart from
    // `specs` so the curated spec vocabulary stays clean.
    customFields: { type: Map, of: String, default: undefined },

    pricingHistory: [PricingHistoryEntrySchema],
    costHistory: [CostHistoryEntrySchema],

    urgency: { type: String, enum: URGENCIES },
    orderReason: { type: String, enum: ORDER_REASONS },

    masterRecordComplete: { type: Boolean, default: false },

    mondayItemId: { type: String, default: null },

    // How the item entered the system.
    origin: { type: String, enum: ITEM_ORIGINS },
    // Whether this item belongs in the finalized company catalog. Master
    // File imports and manual catalog entries are in it directly; a
    // quotation-origin item only after someone submits it and an admin
    // approves.
    inCatalog: { type: Boolean, default: false },
    catalogApproval: {
      status: { type: String, enum: ["pending", "approved"] },
      approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
      approvedAt: Date,
    },
    catalogSubmittedAt: Date,
  },
  { timestamps: true }
);

// Keep baseSku / variantSuffix in lockstep with itemNumber on every
// .save() write path (the manual-create and import-commit routes use
// insertMany, which bypasses this — they set both fields themselves).
ItemSchema.pre("save", function (next) {
  if (this.isModified("itemNumber")) {
    if (this.itemNumber) {
      const { baseSku, variantSuffix } = splitSku(this.itemNumber);
      this.baseSku = baseSku;
      this.variantSuffix = variantSuffix;
    } else {
      this.baseSku = undefined;
      this.variantSuffix = null;
    }
  }
  next();
});

ItemSchema.index({ vendorId: 1, vendorSku: 1 });
// List/detail pages filter by status and always sort by updatedAt desc.
ItemSchema.index({ status: 1, updatedAt: -1 });
// /catalog?filter=incomplete queries this directly.
ItemSchema.index({ masterRecordComplete: 1, updatedAt: -1 });
// Catalog list: filter by inCatalog, sort by itemNumber.
ItemSchema.index({ inCatalog: 1, itemNumber: 1 });
// Item detail resolves POs for an item; buildPullPlan matches by mondayItemId.
ItemSchema.index({ mondayItemId: 1 }, { sparse: true });

export type ItemDoc = InferSchemaType<typeof ItemSchema>;
export default (models.Item as Model<ItemDoc>) ||
  model<ItemDoc>("Item", ItemSchema);
