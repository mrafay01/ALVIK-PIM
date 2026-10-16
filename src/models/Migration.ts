import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Ledger of applied data migrations. One document per migration script
// that has already run, so re-running the migrate script is idempotent
// and a cold deploy's startup picks up only the gap between the ledger
// and the files on disk.
const MigrationSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    appliedAt: { type: Date, default: Date.now },
    // Short free-text describing what the migration did — for the admin
    // audit view only; the authoritative source is the file itself.
    note: { type: String, default: null },
  },
  { versionKey: false }
);

export type MigrationDoc = InferSchemaType<typeof MigrationSchema>;
export default (models.Migration as Model<MigrationDoc>) ||
  model<MigrationDoc>("Migration", MigrationSchema);
