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
    cache.promise = mongoose.connect(MONGODB_URI as string, {
      bufferCommands: false,
      // Fail fast instead of hanging on the 30s driver default when a
      // shard host can't be reached, so request handlers surface a clean
      // error (see app/error.tsx) rather than timing out.
      serverSelectionTimeoutMS: 5000,
      // Connection pool size: 50 for production, 10 for development.
      // Each concurrent request needs a connection; maintain min 5 to avoid
      // cold-start delays; production handles 100+ concurrent requests.
      maxPoolSize: process.env.NODE_ENV === "production" ? 50 : 10,
      minPoolSize: process.env.NODE_ENV === "production" ? 5 : 1,
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
