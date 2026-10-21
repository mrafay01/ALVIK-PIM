import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Background job queue, MongoDB-backed and serverless-safe.
//
// The blueprint originally scoped BullMQ + Redis for this (Monday.com
// sync, marketplace export), but BullMQ assumes a long-lived worker
// process which doesn't exist on serverless (Vercel/Lambda). Using a
// single DB collection with an atomic claim query lets the same job
// definitions run from either (a) a Vercel Cron hitting /api/jobs/tick
// every minute or (b) a long-lived worker process polling the same
// endpoint. No Redis dependency; no new infra beyond the existing Atlas
// cluster.
//
// Lifecycle: pending -> running -> completed | failed. A failing job
// retries up to `maxAttempts` with exponential backoff controlled by
// `runAt` — the worker only picks up rows whose runAt is in the past.

export const JOB_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// New job kinds get added here as modules are moved onto the queue.
// Keeping it a string enum means the DB index can select on it cheaply
// and typos in enqueue() fail at type-check time.
export const JOB_KINDS = [
  "monday_push_all",
  "monday_push_po",
  "marketplace_export",
  "archive_po_files",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

const JobSchema = new Schema(
  {
    kind: { type: String, enum: JOB_KINDS, required: true },
    status: { type: String, enum: JOB_STATUSES, required: true, default: "pending" },
    // Opaque per-kind payload — each worker knows how to read its own shape.
    payload: { type: Schema.Types.Mixed, default: {} },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    runAt: { type: Date, default: () => new Date() },
    // Set while a worker holds the row. Workers reclaim stale leases
    // (older than LEASE_MS) by matching leaseExpiresAt < now, so a
    // crashed worker's job isn't lost.
    leaseExpiresAt: { type: Date, default: null },
    workerId: { type: String, default: null },
    // Result/error payload — stored for the sync_logs record and for
    // debugging a failed run from the admin UI.
    result: { type: Schema.Types.Mixed, default: null },
    lastError: { type: String, default: null },
    // Who enqueued the job. Admin audit trail for every job kind.
    enqueuedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

// The tick endpoint claims the next ready job with a single
// findOneAndUpdate — this compound index serves that query.
JobSchema.index({ status: 1, runAt: 1 });
// Completed and failed rows accumulate forever if left alone; TTL off
// `finishedAt` reaps them 14 days after the final write. Pending/running
// rows have no finishedAt, so TTL leaves them in place.
JobSchema.index({ finishedAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60, sparse: true });

export type JobDoc = InferSchemaType<typeof JobSchema>;
export default (models.Job as Model<JobDoc>) ||
  model<JobDoc>("Job", JobSchema);
