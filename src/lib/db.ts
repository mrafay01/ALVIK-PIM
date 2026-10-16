import mongoose from "mongoose";
// Side-effect import: registers every Mongoose model so any code path that
// opens a connection can .populate() refs without a per-file registration
// import. See src/models/register.ts.
import "@/models/register";

// This machine has had intermittent DNS-SRV resolution failures for
// mongodb+srv:// strings (see PROJECT-REPORT.md §10). The supported config
// is therefore an explicit non-SRV MONGODB_URI that names the shard hosts
// and replica set directly — no runtime DNS workaround is required or
// installed.

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set");
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    // On serverless (Vercel/Lambda) each invocation is a fresh Node
    // process on cold start — a 50-connection pool is cold-start weight
    // the invocation almost never uses and will exhaust Atlas's shared
    // cluster connection cap as instances scale out. A small pool per
    // instance (5–10) is standard practice for serverless MongoDB.
    //
    // On a long-lived Node server (`NODE_ENV=production` without
    // Vercel-style serverless), one process serves many concurrent
    // requests from the same pool, so a larger ceiling is still right.
    // DEPLOYMENT_TARGET=serverless opts into the smaller pool explicitly.
    const isServerless =
      process.env.DEPLOYMENT_TARGET === "serverless" ||
      !!process.env.VERCEL ||
      !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    cache.promise = mongoose.connect(MONGODB_URI as string, {
      bufferCommands: false,
      // Fail fast instead of hanging on the 30s driver default when a
      // shard host can't be reached, so request handlers surface a clean
      // error (see app/error.tsx) rather than timing out.
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45_000,
      // Keep connections warm for a bit so a chain of requests on the
      // same instance doesn't re-handshake.
      maxIdleTimeMS: 60_000,
      maxPoolSize: isServerless ? 5 : process.env.NODE_ENV === "production" ? 50 : 10,
      minPoolSize: isServerless ? 0 : process.env.NODE_ENV === "production" ? 5 : 1,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    // Don't cache a rejected promise — the next request should retry the
    // connection rather than re-throwing this same failure forever.
    cache.promise = null;
    throw err;
  }
  return cache.conn;
}
