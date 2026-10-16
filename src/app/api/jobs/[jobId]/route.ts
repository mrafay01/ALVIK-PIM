import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import Job from "@/models/Job";
import { isObjectId } from "@/lib/ids";

// GET /api/jobs/[jobId] — admin-only poll endpoint for a background job.
// A "sync now" UI calls POST /api/monday/sync (which enqueues), gets
// back a jobId, then polls here until status moves to completed/failed.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  const { jobId } = await params;
  if (!isObjectId(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!/^[0-9a-fA-F]{24}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  await connectDB();
  const job = await Job.findById(jobId)
    .select("kind status attempts maxAttempts result lastError enqueuedBy startedAt finishedAt createdAt")
    .lean();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}
