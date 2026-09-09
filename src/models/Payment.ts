import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { PAYMENT_TRANCHES, PAYMENT_METHODS, PAYMENT_STATUSES } from "@/lib/enums";

const PaymentSchema = new Schema(
  {
    poId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },

    tranche: { type: String, enum: PAYMENT_TRANCHES, required: true },

    invoiceRef: String,
    amountDue: Number,
    dueDate: Date,

    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    proofOfPaymentUrl: String,

    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
    paidAt: Date,
    status: { type: String, enum: PAYMENT_STATUSES, default: "open" },

    creditAppliedFrom: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
  },
  { timestamps: true }
);

// PO detail page: Payment.find({ poId }). Payables list filters by status
// and sorts by updatedAt desc.
PaymentSchema.index({ poId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, updatedAt: -1 });
PaymentSchema.index({ vendorId: 1 });

export type PaymentDoc = InferSchemaType<typeof PaymentSchema>;
export default (models.Payment as Model<PaymentDoc>) ||
  model<PaymentDoc>("Payment", PaymentSchema);
