import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { claimNextJob, completeJob, failJob } from "@/lib/jobs/queue";
import { runJob } from "@/lib/jobs/workers";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";

// Background-job tick endpoint — serverless-friendly worker loop.
//
// Scheduling model: wire this to a Vercel Cron (or any external cron)
// hitting POST every ~60s. One tick drains up to `MAX_JOBS_PER_TICK`
// ready jobs so a backlog clears quickly without blowing a single
// invocation's function timeout. On a long-lived Node server the same
// endpoint can be hit on a timer with the same effect.
//
// Auth: this endpoint is NOT role-gated — it must run from the cron
// without a user session. It's protected instead by a shared-secret
// bearer token (JOBS_WORKER_TOKEN env var), compared with timing-safe
// equality. Public callers get 401 and never reach the queue.

const MAX_JOBS_PER_TICK = 10;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.JOBS_WORKER_TOKEN;
  if (!expected) return false; // never let an unconfigured deploy run jobs
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  return constantTimeEquals(provided, expected);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const workerId = `${process.env.VERCEL_REGION ?? "local"}:${crypto.randomBytes(4).toString("hex")}`;

  const executed: { jobId: string; kind: string; status: "completed" | "failed" }[] = [];
  for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
    const claimed = await claimNextJob(workerId);
    if (!claimed) break;
    try {
      const result = await runJob(claimed.kind, claimed.payload);
      await completeJob(claimed._id, result);
      executed.push({ jobId: claimed._id, kind: claimed.kind, status: "completed" });
    } catch (err) {
      await failJob(claimed._id, err);
      executed.push({ jobId: claimed._id, kind: claimed.kind, status: "failed" });
      logger.error("job execution failed", {
        jobId: claimed._id,
        kind: claimed.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ workerId, drained: executed.length, executed });
}
