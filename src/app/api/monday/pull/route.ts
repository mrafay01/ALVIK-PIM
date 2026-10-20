import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import SyncLog from "@/models/SyncLog";
import { buildPullPlan, commitSelectedPullRows } from "@/lib/monday/pull";

// Reading the whole board plus the database writes can take a while on a
// large board.
export const maxDuration = 60;

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

  // Only the ids of the rows the reviewer kept selected; the rows
  // themselves are rebuilt from the board server-side. (Sending whole rows
  // for a full ~7,000-item board ran past the 1 MB JSON request limit.)
  const body = (await req.json().catch(() => null)) as { mondayItemIds?: unknown } | null;
  const ids = body?.mondayItemIds;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && /^\d+$/.test(id))) {
    return NextResponse.json({ error: "Select at least one board item to import" }, { status: 400 });
  }

  await connectDB();

  const startedAt = new Date();
  const result = await commitSelectedPullRows(ids as string[]);

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
