import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { PLATFORMS } from "@/lib/enums";

const ColumnMappingSchema = new Schema(
  {
    header: { type: String, required: true },
    sourceField: { type: String, required: true },
    transform: { type: String, default: null },
  },
  { _id: false }
);

const PlatformTemplateSchema = new Schema(
  {
    platform: { type: String, enum: PLATFORMS, required: true, unique: true },
    columns: [ColumnMappingSchema],
    sampleFileUrl: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export type PlatformTemplateDoc = InferSchemaType<typeof PlatformTemplateSchema>;
export default (models.PlatformTemplate as Model<PlatformTemplateDoc>) ||
  model<PlatformTemplateDoc>("PlatformTemplate", PlatformTemplateSchema);
