import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Fixed-window rate-limit counter backed by MongoDB — serverless-safe,
// unlike the previous in-process Map which only worked on a single
// long-lived Node process. One document per (key, window) pair; the window
// end is written as `expiresAt` and MongoDB's TTL index below reaps
// expired documents automatically, so the collection can never grow
// unbounded.
//
// The atomic increment lives in src/lib/rateLimit.ts — this file is only
// the storage shape and its indexes.
const RateLimitSchema = new Schema(
  {
    // The rate-limit scope — e.g. "login:email:joel@example.com" or
    // "login:ip:1.2.3.4". Combined with `resetAt` into a unique index so a
    // new window for the same key is a separate document, not a race.
    key: { type: String, required: true },
    // Unix ms when this window ends. Mongo's TTL index on `expiresAt`
    // (same value) removes the row once the window has passed.
    resetAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  { timestamps: false, versionKey: false }
);

RateLimitSchema.index({ key: 1, resetAt: 1 }, { unique: true });
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitDoc = InferSchemaType<typeof RateLimitSchema>;
export default (models.RateLimit as Model<RateLimitDoc>) ||
  model<RateLimitDoc>("RateLimit", RateLimitSchema);