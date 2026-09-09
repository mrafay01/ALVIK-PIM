import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// One document per staged row from an uploaded Master File, in its own
// top-level collection rather than embedded in ImportBatch. A large Master
// File (thousands of rows, each carrying raw + coerced values and flags)
// embedded as a single array pushes the parent document past MongoDB's hard
// 16MB document-size limit — this was hit in practice (driver-level
// "offset out of range" error on POST /api/admin/import-review). Splitting
// rows into their own collection, referenced by batchId, removes that
// ceiling: batch size is now bounded only by the database, not by a single
// document.

const FieldFlagSchema = new Schema(
  {
    field: { type: String, required: true }, // e.g. "specs.metal", "pricing.msrp"
    message: { type: String, required: true }, // why it was flagged
    rawValue: Schema.Types.Mixed, // the original cell value, untouched
  },
  { _id: false }
);

const ImportBatchRowSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "ImportBatch", required: true, index: true },
    rowNumber: { type: Number, required: true }, // 1-based, matches spreadsheet row
    raw: { type: Schema.Types.Mixed, required: true }, // full original row, keyed by column header
    coerced: { type: Schema.Types.Mixed, default: {} }, // best-effort parsed values, dot-path keyed to match Item schema
    flags: [FieldFlagSchema],
    reviewStatus: {
      type: String,
      enum: ["needs_review", "approved", "rejected"],
      default: "needs_review",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: String,
    committedItemId: { type: Schema.Types.ObjectId, ref: "Item", default: null },
  },
  { timestamps: true }
);

// The commit + bulk-approve routes query by (batchId, reviewStatus) and the
// commit route also filters committedItemId — compound covers all three.
ImportBatchRowSchema.index({ batchId: 1, reviewStatus: 1, committedItemId: 1 });

export type ImportBatchRowDoc = InferSchemaType<typeof ImportBatchRowSchema>;
export default (models.ImportBatchRow as Model<ImportBatchRowDoc>) ||
  model<ImportBatchRowDoc>("ImportBatchRow", ImportBatchRowSchema);
