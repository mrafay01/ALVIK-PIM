import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// One document per pending authoritative-field conflict discovered when
// an incoming PI row targets an item that is already in the catalog
// (items.inCatalog = true). The catalog is the source of truth once an
// item has been verified into it; the PI's divergent value is held here
// for a human to resolve rather than silently overwriting the stored
// catalog value.
//
// Not embedded on the Item because:
//   - a single PI row can produce several conflicts at once (weight AND
//     vendor SKU AND ring size);
//   - the review surface needs cross-item queries ("every unresolved
//     conflict across the catalog");
//   - resolved rows are retained for 90 days as audit, with TTL doing
//     the cleanup — a per-item embedded array would never reclaim that
//     space on its own.
//
// Written exclusively by the quote-commit reconciliation step
// (src/app/api/quotations/[quotationId]/commit/route.ts) and the
// resolve endpoint (src/app/api/catalog/conflicts/[id]/resolve). Never
// updated by the Monday pull or the Master File importer.

export const CONFLICT_STATUSES = [
  "pending",
  "accepted_new",
  "kept_existing",
  "custom",
] as const;
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

const CatalogConflictSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation", required: true, index: true },
    quotationRowId: { type: Schema.Types.ObjectId, ref: "QuotationRow", required: true },

    // Dot-path on the Item document (e.g. "specs.weight.totalG") —
    // matches the paths QUOTE_FIELDS declares, so the resolve endpoint
    // can dot-set it back onto the Item without a lookup table.
    field: { type: String, required: true },
    // Human-readable field name shown on the review UI. Captured here
    // (not derived on read) so a later rename of a QUOTE_FIELDS label
    // doesn't retroactively relabel historical conflicts.
    fieldLabel: { type: String, required: true },

    // Both sides of the disagreement, stored verbatim as the schema
    // allows (number for weights, string for SKU, etc.). Mixed is the
    // honest type — a stricter one would force every resolve-endpoint
    // caller to narrow by field, which the UI doesn't need.
    catalogValue: { type: Schema.Types.Mixed, default: null },
    incomingValue: { type: Schema.Types.Mixed, required: true },

    status: {
      type: String,
      enum: CONFLICT_STATUSES,
      required: true,
      default: "pending",
      index: true,
    },
    // Only set when status === "custom" — the value the reviewer typed
    // in place of either side.
    customValue: { type: Schema.Types.Mixed, default: null },

    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Catalog conflict badge on the item detail page / catalog list reads
// (itemId, status) together — this compound index serves that.
CatalogConflictSchema.index({ itemId: 1, status: 1 });
// Review page: list every pending conflict newest-first.
CatalogConflictSchema.index({ status: 1, createdAt: -1 });
// TTL — expire 90 days after resolution so the audit history stays
// bounded. `pending` rows have no `resolvedAt` so TTL leaves them.
CatalogConflictSchema.index(
  { resolvedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60, sparse: true }
);

export type CatalogConflictDoc = InferSchemaType<typeof CatalogConflictSchema>;
export default (models.CatalogConflict as Model<CatalogConflictDoc>) ||
  model<CatalogConflictDoc>("CatalogConflict", CatalogConflictSchema);
