import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// One document per uploaded Master File. Its staged rows live in the
// separate ImportBatchRow collection (batchId-referenced), not embedded
// here — see ImportBatchRow.ts for why. This document just tracks the
// batch's own metadata and the summary counters shown on the batch list.

const ImportBatchSchema = new Schema(
  {
    sourceFileName: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["parsing", "needs_review", "reviewed", "committed"],
      default: "parsing",
    },

    totalRows: { type: Number, default: 0 },
    flaggedRows: { type: Number, default: 0 },
    approvedRows: { type: Number, default: 0 },
    rejectedRows: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type ImportBatchDoc = InferSchemaType<typeof ImportBatchSchema>;
export default (models.ImportBatch as Model<ImportBatchDoc>) ||
  model<ImportBatchDoc>("ImportBatch", ImportBatchSchema);
