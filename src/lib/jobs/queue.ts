import { Types } from "mongoose";
import Job, { type JobKind, type JobStatus } from "@/models/Job";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";

// How long a worker holds a job before another worker is allowed to
// pick it up again. Long enough for the biggest reasonable task to
// complete (Monday sync of ~400 POs with retries) without ever rescuing
// a job that's genuinely still running.
const LEASE_MS = 5 * 60 * 1000;

// Backoff between attempts: 1s, 10s, 60s. Chosen to be short enough
// that a transient Monday/SharePoint hiccup resolves within one tick
// cycle, long enough that a hard failure doesn't thrash the queue.
const BACKOFF_MS = [1_000, 10_000, 60_000];

export type EnqueueInput<K extends JobKind> = {
  kind: K;
  payload?: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
  enqueuedBy?: Types.ObjectId | string | null;
};

// Enqueues a new job for the worker to pick up on the next tick. Returns
// the stored job's id so an admin "sync now" UI can report "job started"
// to the user and later poll `/api/jobs/:id` for status.
export async function enqueue<K extends JobKind>(
  input: EnqueueInput<K>
): Promise<string> {
  await connectDB();
  const doc = await Job.create({
    kind: input.kind,
    payload: input.payload ?? {},
    runAt: input.runAt ?? new Date(),
    maxAttempts: input.maxAttempts ?? 3,
    enqueuedBy: input.enqueuedBy ?? null,
  });
  logger.info("job enqueued", { jobId: String(doc._id), kind: input.kind });
  return String(doc._id);
}

export type ClaimedJob = {
  _id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
};

// Atomically claim the next ready job for `workerId`. Picks pending
// rows whose runAt has arrived, OR running rows whose lease has expired
// (a crashed worker). The findOneAndUpdate is a single atomic step, so
// two workers racing can never claim the same row.
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  await connectDB();
  const now = new Date();
  const claimed = await Job.findOneAndUpdate(
    {
      runAt: { $lte: now },
      $or: [
        { status: "pending" },
        // Expired lease — recovery path for a crashed worker. The
        // sparse-y check on leaseExpiresAt lets us index only pending/
        // running rows cheaply.
        { status: "running", leaseExpiresAt: { $lt: now } },
      ],
    },
    {
      $set: {
        status: "running",
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        workerId,
      },
      $inc: { attempts: 1 },
    },
    { sort: { runAt: 1 }, new: true }
  ).lean<{
    _id: Types.ObjectId;
    kind: JobKind;
    payload: Record<string, unknown>;
    attempts: number;
  }>();
  if (!claimed) return null;
  return {
    _id: String(claimed._id),
    kind: claimed.kind,
    payload: claimed.payload ?? {},
    attempts: claimed.attempts,
  };
}

export async function completeJob(
  jobId: string,
  result: unknown
): Promise<void> {
  await connectDB();
  await Job.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "completed" as JobStatus,
        result,
        finishedAt: new Date(),
        leaseExpiresAt: null,
      },
    }
  );
}

// Fails the job. If attempts < maxAttempts, re-schedules with backoff;
// otherwise marks it failed terminally.
export async function failJob(
  jobId: string,
  err: unknown
): Promise<void> {
  await connectDB();
  const message = err instanceof Error ? err.message : String(err);
  const job = await Job.findById(jobId).select("attempts maxAttempts").lean<{
    attempts: number;
    maxAttempts: number;
  }>();
  if (!job) return;

  if (job.attempts < job.maxAttempts) {
    const idx = Math.min(job.attempts - 1, BACKOFF_MS.length - 1);
    const delay = BACKOFF_MS[Math.max(0, idx)];
    await Job.updateOne(
      { _id: jobId },
      {
        $set: {
          status: "pending" as JobStatus,
          lastError: message,
          runAt: new Date(Date.now() + delay),
          leaseExpiresAt: null,
          workerId: null,
        },
      }
    );
    logger.warn("job retry scheduled", { jobId, attempts: job.attempts, delay, message });
    return;
  }

  await Job.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "failed" as JobStatus,
        lastError: message,
        finishedAt: new Date(),
        leaseExpiresAt: null,
      },
    }
  );
  logger.error("job failed permanently", { jobId, message });
}
