import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const VendorSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    contact: { type: String },
    email: { type: String },
    phone: { type: String },
    terms: { type: String },
  },
  { timestamps: true }
);

export type VendorDoc = InferSchemaType<typeof VendorSchema>;
export default (models.Vendor as Model<VendorDoc>) ||
  model<VendorDoc>("Vendor", VendorSchema);
