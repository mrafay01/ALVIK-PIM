import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { ITEM_STATUSES, ORDER_REASONS, URGENCIES, IMAGE_SUBFOLDERS } from "@/lib/enums";

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

    // Named collectionName, not collection — "collection" is a reserved
    // Mongoose schema option and would silently misbehave if used directly.
    collectionName: String,
    season: String,
    category: String,

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

    pricingHistory: [PricingHistoryEntrySchema],
    costHistory: [CostHistoryEntrySchema],

    urgency: { type: String, enum: URGENCIES },
    orderReason: { type: String, enum: ORDER_REASONS },

    masterRecordComplete: { type: Boolean, default: false },

    mondayItemId: { type: String, default: null },
  },
  { timestamps: true }
);

ItemSchema.index({ vendorId: 1, vendorSku: 1 });

export type ItemDoc = InferSchemaType<typeof ItemSchema>;
export default (models.Item as Model<ItemDoc>) ||
  model<ItemDoc>("Item", ItemSchema);
