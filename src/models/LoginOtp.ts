import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// A single pending email-OTP challenge for a login attempt. Created once
// the password step passes; consumed (or expired) before a session is
// minted. Never stores the raw code — only a bcrypt hash of it, same as
// passwords, so a DB read alone can't yield a usable code.
const LoginOtpSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    // Set once the code is verified — a random opaque value the client
    // then presents to NextAuth's authorize() to actually mint the
    // session, so authorize() never re-runs the code/attempt-limit logic
    // itself. Single-use: ticketConsumedAt is set the moment it's redeemed.
    sessionTicket: { type: String, default: null, index: true, sparse: true },
    ticketConsumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// MongoDB TTL index — documents are automatically deleted once expiresAt
// passes, so this collection can never accumulate stale codes.
LoginOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type LoginOtpDoc = InferSchemaType<typeof LoginOtpSchema>;
export default (models.LoginOtp as Model<LoginOtpDoc>) ||
  model<LoginOtpDoc>("LoginOtp", LoginOtpSchema);
