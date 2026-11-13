import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { SYNC_LOG_RUN_TYPES } from "@/lib/enums";

const ErrorDetailSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item" },
    message: String,
  },
  { _id: false }
);

const SyncLogSchema = new Schema(
  {
    runType: { type: String, enum: SYNC_LOG_RUN_TYPES, required: true },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
    rowsProcessed: { type: Number, default: 0 },
    changed: { type: Number, default: 0 },
    unchanged: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    errored: { type: Number, default: 0 },
    errorDetail: [ErrorDetailSchema],
  },
  { timestamps: true }
);

// Nothing in the app reads these back; they're a debugging trail for
// Monday pushes and pulls. Keep 90 days so the collection can't
// grow forever.
SyncLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export type SyncLogDoc = InferSchemaType<typeof SyncLogSchema>;
export default (models.SyncLog as Model<SyncLogDoc>) ||
  model<SyncLogDoc>("SyncLog", SyncLogSchema);
