import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const ShipmentSchema = new Schema(
  {
    trackingNumber: { type: String, required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    poIds: [{ type: Schema.Types.ObjectId, ref: "PurchaseOrder" }],
    shipDate: Date,
  },
  { timestamps: true }
);

export type ShipmentDoc = InferSchemaType<typeof ShipmentSchema>;
export default (models.Shipment as Model<ShipmentDoc>) ||
  model<ShipmentDoc>("Shipment", ShipmentSchema);
