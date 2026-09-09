import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { MARKETPLACE_EXPORT_PLATFORMS } from "@/lib/enums";

// One document per (item, platform) pair, holding the fields a marketplace
// bulk-import file needs that don't exist anywhere on Item — UPC, package
// weight/dimensions, marketplace category codes, bullet features, care
// instructions, etc. Item stays the single source of truth for jewelry
// specs and internal pricing (specs.*, pricingHistory); this collection is
// purely the "how this item is listed on platform X" overlay, editable in
// the export review UI before a file is generated.
//
// Kept as its own collection rather than fields on Item because the same
// item can be listed differently across platforms (different bullet copy,
// different category code, present on Macy's but not yet on Target) and
// because most of these fields are meaningless outside export — bloating
// Item with 30+ mostly-null platform-specific fields would make every other
// screen (catalog, item detail) carry weight it never uses.

const BulletFeatureSchema = new Schema(
  {
    text: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const MarketplaceListingSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    platform: { type: String, enum: MARKETPLACE_EXPORT_PLATFORMS, required: true },

    // Identity / copy — shared shape across platforms; export mappers pick
    // what each template actually needs.
    upc: { type: String, trim: true },
    gtin: { type: String, trim: true },
    productTitle: { type: String, trim: true, maxlength: 500 },
    productDescription: { type: String, trim: true, maxlength: 5000 },
    bulletFeatures: [BulletFeatureSchema], // ordered; templates cap how many they use

    // Package / shipping physicals — none of this exists on Item today.
    weightLb: Number,
    weightOz: Number,
    lengthIn: Number,
    widthIn: Number,
    heightIn: Number,

    // Pricing overrides for this platform. Falls back to the Item's latest
    // pricingHistory entry (msrp/ruePrice) when left blank — see
    // resolveListingFields in lib/marketplace-export.
    price: Number,
    salePrice: Number,

    // Marketplace taxonomy — each platform has its own category vocabulary,
    // so these are free text set per listing, not a shared enum.
    marketplaceCategory: { type: String, trim: true },
    marketplaceSubtype: { type: String, trim: true },

    // Compliance / care copy commonly required by these templates.
    careInstructions: { type: String, trim: true, maxlength: 1000 },
    countryOfOrigin: { type: String, trim: true },
    chokingHazardWarning: { type: String, trim: true, maxlength: 500 },
    prop65Warning: { type: String, trim: true, maxlength: 500 },

    readyToExport: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Export review and file generation both query "every listing for platform
// X", and edits target one (item, platform) pair — cover both, and prevent
// two listings for the same item/platform pair.
MarketplaceListingSchema.index({ itemId: 1, platform: 1 }, { unique: true });
MarketplaceListingSchema.index({ platform: 1, readyToExport: 1 });

export type MarketplaceListingDoc = InferSchemaType<typeof MarketplaceListingSchema>;
export default (models.MarketplaceListing as Model<MarketplaceListingDoc>) ||
  model<MarketplaceListingDoc>("MarketplaceListing", MarketplaceListingSchema);
