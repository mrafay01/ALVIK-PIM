import { NextResponse } from "next/server";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { enqueue } from "@/lib/jobs/queue";
import { Types } from "mongoose";

// POST: enqueue a Monday.com bulk-push job rather than running it
// synchronously inside this request.
//
// Rationale: a full run fans out one API call per PO to Monday with a
// bounded concurrency of 4; several hundred POs can take minutes, which
// is well past the serverless function timeout (10s on Vercel's
// Hobby/Pro default). The handler now returns 202 Accepted with a
// jobId; the admin UI polls GET /api/jobs/[jobId] for status, and a
// cron tick (POST /api/jobs/tick) actually runs the sync.
export async function POST() {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  // Still rate-limited at the enqueue step so a stuck admin UI can't
  // flood the queue with duplicate runs. 3/min is comfortably more than
  // anyone needs for a manual "sync now".
  const rl = await rateLimit("monday:sync", { limit: 3, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Sync already enqueued recently. Wait a minute before retrying." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const adminId = gate.session.user?.id;
  const jobId = await enqueue({
    kind: "monday_push_all",
    enqueuedBy: adminId ? new Types.ObjectId(adminId) : null,
  });

  return NextResponse.json(
    {
      jobId,
      status: "queued",
      pollUrl: `/api/jobs/${jobId}`,
    },
    { status: 202 }
  );
}
