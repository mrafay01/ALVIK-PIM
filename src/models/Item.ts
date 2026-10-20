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

// Structured, category-driven measurements — see src/lib/measurements/.
// Deliberately separate from `specs` above rather than folded into it:
// `specs` stays exactly as every existing import/form/export path already
// writes and reads it (zero migration, zero breakage), while this field is
// the new typed home for the Bracelet/Ring/Pendant/Earring/Bangle/
// Necklace/Anklet measurement system. `values` is a flexible key->
// Measurement map (each key/shape is defined in code by
// src/lib/measurements/schema.ts, not by the DB schema) so a new category
// or a new field on an existing category never needs a migration here —
// same rationale as `specs` being strict:false, just scoped to one
// sub-field instead of the whole subdocument.
const StoneMeasurementSchema = new Schema(
  {
    value: Number,
    unit: String,
    originalValue: String,
    source: { type: String, enum: ["supplier", "manual", "calculated"] },
    isEstimated: Boolean,
  },
  { _id: false }
);

const MeasurementsSchema = new Schema(
  {
    category: String,
    values: { type: Schema.Types.Mixed, default: undefined },
    ringSize: {
      value: Number,
      system: { type: String, enum: ["US", "UK", "EU", "JP"] },
    },
    adjustable: Boolean,
    stones: {
      length: StoneMeasurementSchema,
      width: StoneMeasurementSchema,
      depth: StoneMeasurementSchema,
    },
    // Catch-all for import text that couldn't be confidently parsed into
    // a specific field (ambiguous combined dimensions, free-form supplier
    // notes) — preserved rather than dropped or guessed into a field.
    raw: String,
    hasCharm: Boolean,
    hasPendant: Boolean,
    isOpen: Boolean,
    earringType: { type: String, enum: ["hoop", "stud", "drop"] },
  },
  { _id: false }
);

// One free-text box per marketplace — see DESCRIPTION_PLATFORMS. Hand-edited
// today; a later AI pass drafts these from title/description for a human to
// refine, so each entry also tracks how it was produced and by whom/when,
// the way pricingHistory/reviewDecision already do for their own edits.
const MarketplaceDescriptionEntrySchema = new Schema(
  {
    text: { type: String, trim: true, maxlength: 5000, default: "" },
    source: { type: String, enum: ["manual", "ai_generated"], default: "manual" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedAt: Date,
  },
  { _id: false }
);

const MediaItemSchema = new Schema(
  {
    sharePointItemId: { type: String, required: true },
    url: { type: String, required: true },
    subfolder: { type: String, enum: IMAGE_SUBFOLDERS, required: true },
    sequence: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
    // File name in SharePoint (also the last segment of `url`).
    name: String,
    // Result of the last "is this file still in SharePoint?" check (Images
    // page). A broken image doesn't count towards imageCompleteness.
    linkStatus: { type: String, enum: ["ok", "broken"], default: undefined },
    linkCheckedAt: Date,
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

    // Explicit family relationship for a set of variations, set once at
    // creation time and shared by every member (base row included) — the
    // same ObjectId on every sibling. Exists alongside baseSku/variantSuffix
    // rather than replacing them: baseSku/variantSuffix still drive normal
    // SKU display and the default "{baseSku}-{suffix}" derivation, but a
    // variation can opt into an independent SKU (a different baseSku
    // entirely) while staying linked to its family via this id — something
    // the baseSku-string grouping alone can't express. Items created before
    // this field existed have no variationGroupId; every family-aware query
    // falls back to grouping by baseSku for those (see
    // src/lib/catalog/variationFamily.ts).
    variationGroupId: { type: Schema.Types.ObjectId, index: true, sparse: true },

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
    // TITLE#2 / descripton #2 on the real Master File — a secondary title
    // and description some rows carry alongside the primary pair.
    title2: String,
    description2: String,
    bulletFeatures: { type: [String], default: undefined },
    brand: String,
    upc: { type: String, index: true, sparse: true },
    // A second UPC some items carry (e.g. a repackaged/relabeled variant
    // sharing the same product) and an alternate SKU used to cross-reference
    // this item under a different system/vendor naming — both free text,
    // neither unique (unlike upc/itemNumber) since the same value can
    // legitimately appear on more than one row.
    upc2: { type: String, trim: true },
    aliasSku: { type: String, trim: true, index: true },

    // Per-marketplace description overrides, keyed by DESCRIPTION_PLATFORMS
    // ("macys", "kohls", ...). A Map rather than one field per platform —
    // same pattern as customFields below — so adding a marketplace later
    // needs no schema migration. Falls back to `description` above wherever
    // a platform's entry is missing/blank (see resolveMarketplaceDescription)
    // — this only stores the override, not a full copy of every platform's
    // text from day one.
    marketplaceDescriptions: { type: Map, of: MarketplaceDescriptionEntrySchema, default: undefined },

    specs: SpecsSchema,
    // Structured, category-specific measurements — replaces the free-text
    // "Measurements & findings" UI. See src/lib/measurements/.
    measurements: { type: MeasurementsSchema, default: undefined },

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

    // Un-Verified Items page intake tracking (added 2026-10-12 per the
    // client's "items only come from POs" rule). Set on every item that
    // enters via a quote commit or a Monday-pull materialization; left
    // null for Master File imports and manual catalog entries (those
    // skip the Un-Verified page entirely by going straight to
    // inCatalog: true).
    //
    //   intakeSource     — "manual_quote" | "monday_pull" | null
    //   sourcePoNumber   — the PO number this item was first associated
    //                      with, free text ("23101", "#22906", or the
    //                      preamble PO like "20711"). Shown as the
    //                      "From PO" column on /items.
    //   sourceMondayItemId — Monday board item id for materialized
    //                      rows; null for manual-quote origins. Lets a
    //                      re-pull update in place rather than create
    //                      duplicates.
    //   sourceMondayStatus — Monday's current status label verbatim for
    //                      materialized rows ("PI Confirmed", "In
    //                      transit", etc.). Shown on /items so the
    //                      reviewer sees what stage this item is at on
    //                      the vendor-pipeline side. Updated by every
    //                      pull; left blank for manual intake.
    intakeSource: {
      type: String,
      enum: ["manual_quote", "monday_pull"],
      default: null,
    },
    sourcePoNumber: { type: String, default: null, index: true },
    sourceMondayItemId: { type: String, default: null, index: true, sparse: true },
    sourceMondayStatus: { type: String, default: null },
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

    // Catalog-only visibility switch — an inactive item stays in the
    // catalog (and everywhere else) but is excluded from marketplace
    // export, so it can't be listed/sold while still being editable and
    // auditable. Independent of `status`/`masterRecordComplete`.
    active: { type: Boolean, default: true },

    // Who last made a substantive edit to this item — set explicitly by
    // every write route (PATCH /api/items/[id], media upload, catalog
    // submit/approve) alongside its own change, rather than derived from
    // `updatedAt` alone (that already auto-updates via `timestamps` below,
    // but carries no "by whom"). Shown on the Catalog list as "Last
    // edited" — see src/app/catalog/page.tsx.
    lastEditedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // Count of unresolved CatalogConflict documents pointing at this
    // item. Maintained by the quote-commit reconciliation (on write)
    // and the conflict-resolve endpoint (on resolution), so the catalog
    // list can badge rows with pending conflicts via a single projected
    // field instead of a per-row aggregation. 0 for every item that
    // hasn't gone through reconciliation yet — set as a default so
    // existing rows don't need a backfill query to be queryable.
    conflictCount: { type: Number, default: 0, index: true },
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
// GET /api/items with no ?status= filter sorts purely by updatedAt desc —
// none of the compound indexes above lead with updatedAt, so an unfiltered
// call would otherwise fall back to an in-memory sort over the whole
// collection before skip/limit could apply.
ItemSchema.index({ updatedAt: -1 });
// Catalog list sorts by itemNumber (alphabetical, clustering a variation
// family by its leading base SKU) within inCatalog — the compound
// (inCatalog, itemNumber) above already covers that; this one covers the
// variations tab which filters by baseSku + inCatalog.
ItemSchema.index({ inCatalog: 1, baseSku: 1 });
// Catalog filter "Pending approval" tab.
ItemSchema.index({ "catalogApproval.status": 1 }, { sparse: true });
// Marketplace export filters by masterRecordComplete and active together.
ItemSchema.index({ active: 1, masterRecordComplete: 1 });
// Images page: "broken links" filter.
ItemSchema.index({ "media.linkStatus": 1 }, { sparse: true });
// Un-Verified Items page: filter by intake source, newest first.
ItemSchema.index({ intakeSource: 1, createdAt: -1 });

export type ItemDoc = InferSchemaType<typeof ItemSchema>;
export default (models.Item as Model<ItemDoc>) ||
  model<ItemDoc>("Item", ItemSchema);
