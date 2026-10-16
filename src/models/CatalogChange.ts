import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Append-only log of every authoritative-field change made to an item
// after it entered the catalog. Rendered as the "Change history"
// accordion on the item detail page: "Weight went from 10.2g to 12.0g
// on 2026-10-12, from PI 23101 (resolved by Joel)."
//
// What belongs here: changes to the fields listed in
// src/lib/catalog/authoritativeFields.ts, written by:
//   - the quote-commit reconciliation accepting a PI value (source "pi_conflict")
//   - the manual item PATCH route on an in-catalog item (source "manual_edit")
//   - the Master File re-import if it ever overwrites a catalog field (source "import")
// What does NOT belong here: pricing changes (already append-only on
// items.pricingHistory), stone/plating edits (not authoritative),
// field edits on an item that hasn't been promoted to the catalog yet
// (pipeline, not a change to the trusted record).

export const CATALOG_CHANGE_SOURCES = [
  "pi_conflict",
  "manual_edit",
  "import",
] as const;
export type CatalogChangeSource = (typeof CATALOG_CHANGE_SOURCES)[number];

const CatalogChangeSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },

    field: { type: String, required: true },
    fieldLabel: { type: String, required: true },

    // Captured verbatim — stored as whatever shape the field uses
    // (number for weights, string for SKU, etc.). The item detail UI
    // handles rendering; nothing queries by value.
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },

    source: { type: String, enum: CATALOG_CHANGE_SOURCES, required: true },
    // Breadcrumb back to whichever thing drove this change — kept
    // sparse so a `manual_edit` row doesn't carry empty quotation refs.
    sourceRef: {
      quotationId: { type: Schema.Types.ObjectId, ref: "Quotation", default: null },
      quotationRowId: { type: Schema.Types.ObjectId, ref: "QuotationRow", default: null },
      catalogConflictId: { type: Schema.Types.ObjectId, ref: "CatalogConflict", default: null },
      userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Item detail reads this collection by (itemId, createdAt DESC) to show
// the newest change first.
CatalogChangeSchema.index({ itemId: 1, createdAt: -1 });

export type CatalogChangeDoc = InferSchemaType<typeof CatalogChangeSchema>;
export default (models.CatalogChange as Model<CatalogChangeDoc>) ||
  model<CatalogChangeDoc>("CatalogChange", CatalogChangeSchema);
