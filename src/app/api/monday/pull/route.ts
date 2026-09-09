import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import SyncLog from "@/models/SyncLog";
import { buildPullPlan, commitPullPlan, type PullPlanRow } from "@/lib/monday/pull";

// GET: dry-run preview only. Reads the live Monday board and reports what
// a pull would create/update/skip — never writes to the DB or to Monday.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user?.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const plan = await buildPullPlan();
  return NextResponse.json(plan);
}

// POST: applies a plan the caller already reviewed via GET. Expects the
// same `rows` array back (not re-fetched from Monday blind) so what gets
// committed matches what was shown on screen.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user?.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { rows?: PullPlanRow[] };
  if (!body.rows || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows is required" }, { status: 400 });
  }

  await connectDB();

  const startedAt = new Date();
  const result = await commitPullPlan(body.rows);

  await SyncLog.create({
    runType: "monday_pull",
    startedAt,
    finishedAt: new Date(),
    rowsProcessed: result.processed,
    changed: result.updated + result.created,
    unchanged: 0,
    skipped: result.skipped,
    errored: result.errored,
    errorDetail: result.errors.map((e) => ({ message: `Monday item ${e.mondayItemId}: ${e.message}` })),
  });

  return NextResponse.json(result);
}
