// Fixed-window rate limiter — MongoDB-backed, serverless-safe.
//
// Scope: every instance (serverless invocation or long-lived Node process)
// shares one authoritative counter per (key, window) pair via an atomic
// upsert, so limits hold under horizontal scaling and across cold starts.
// The previous in-memory Map version only worked on a single process and
// was effectively a no-op on serverless — see the project's deployment
// target in the security pass notes.
//
// Storage: one small document per (key, window), auto-reaped by Mongo's
// TTL index on expiresAt (see src/models/RateLimit.ts).
//
// Fallback: if the DB round-trip itself fails (connection down, etc.), the
// limiter fails *open* and logs — the alternative (deny every request on
// a transient DB blip) would create a self-inflicted outage. The outer
// handler's own auth/validation layers still run.

import RateLimit from "@/models/RateLimit";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const now = Date.now();
  // Align every request in the same wall-clock window onto the same
  // `resetAt`, so one window = one document, counting atomically.
  const resetAt = new Date(Math.ceil(now / windowMs) * windowMs);

  try {
    await connectDB();
    // Atomic increment-or-create. The $setOnInsert handles the "first
    // request in a brand-new window" case; everything after increments
    // the same document in place. `expiresAt` doubles as the TTL anchor.
    const doc = await RateLimit.findOneAndUpdate(
      { key, resetAt },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: resetAt },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<{ count: number }>();

    const count = doc?.count ?? 1;
    const retryAfterSeconds = Math.max(0, Math.ceil((resetAt.getTime() - now) / 1000));

    if (count > limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
  } catch (err) {
    // Fail-open on infrastructure failure — see module comment.
    logger.error("rateLimit: backing store unavailable, failing open", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
}


// Reads a counter WITHOUT counting this call. Used to ask "is this key
// already over its limit?" before doing work, so only the outcomes the
// caller chooses (e.g. failed sign-ins) are recorded with rateLimit().
// Fails open like rateLimit().
export async function peekRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = new Date(Math.ceil(now / windowMs) * windowMs);
  try {
    await connectDB();
    const doc = await RateLimit.findOne({ key, resetAt }).lean<{ count: number }>();
    const count = doc?.count ?? 0;
    if (count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(0, Math.ceil((resetAt.getTime() - now) / 1000)) };
    }
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
  } catch (err) {
    logger.error("peekRateLimit: backing store unavailable, failing open", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}
