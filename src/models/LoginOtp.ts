import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { OTP_PURPOSES } from "@/lib/enums";

// A single pending email-OTP challenge — for a login attempt, or for one of
// the account-security actions that also require a fresh 2FA proof (own
// password change, an admin resetting someone else's password, or changing
// the account's email). Created once the password step passes; consumed
// (or expired) before the guarded action is allowed to run. Never stores
// the raw code — only a bcrypt hash of it, same as passwords, so a DB read
// alone can't yield a usable code.
//
// `purpose` scopes a code to exactly the action it was issued for — without
// it, verifyOtp()'s "most recent unconsumed code for this userId" lookup
// would let a login OTP double as proof for a password reset (or vice
// versa) if both happened to be pending at once.
const LoginOtpSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true, default: "login" },
    // change_email only: the new address being verified. The code is sent
    // here (proving control of the new inbox), not to the account's
    // current email — so this can't be looked up by the account email the
    // way login/password-reset OTPs are.
    targetEmail: { type: String, default: null },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    // Set once the code is verified — a random opaque value the client
    // then presents to finish the guarded action (NextAuth's authorize()
    // for login; the relevant PATCH route for the others) so that step
    // never re-runs the code/attempt-limit logic itself. Single-use:
    // ticketConsumedAt is set the moment it's redeemed.
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
