import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import SyncLog from "@/models/SyncLog";
import { buildPullPlan, commitPullPlan, type PullPlanRow } from "@/lib/monday/pull";

// GET: dry-run preview only. Reads the live Monday board and reports what
// a pull would create/update/skip — never writes to the DB or to Monday.
export async function GET() {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  await connectDB();
  const plan = await buildPullPlan();
  return NextResponse.json(plan);
}

// POST: applies a plan the caller already reviewed via GET. Expects the
// same `rows` array back (not re-fetched from Monday blind) so what gets
// committed matches what was shown on screen.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

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
