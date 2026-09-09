import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import SyncLog from "@/models/SyncLog";
import { syncAllPurchaseOrders } from "@/lib/monday/sync";

// POST: manual "sync now" — pushes every purchase order to the Monday.com
// board, logging the run to sync_logs per the blueprint's traceability
// design (§ Sync traceability). Deliberately synchronous/on-demand for now
// rather than a background queue — see PROJECT-REPORT.md Phase 8.
export async function POST() {
  const gate = await requireRole(ROLE_SETS.adminOnly);
  if (isAuthFail(gate)) return gate.response;

  // This fans out one Monday API call per PO — don't let it be triggered
  // back-to-back. A few runs per minute is plenty for a manual "sync now".
  const rl = rateLimit("monday:sync", { limit: 3, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Sync already ran recently — wait a minute before retrying." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  await connectDB();

  const startedAt = new Date();
  const result = await syncAllPurchaseOrders();

  await SyncLog.create({
    runType: "monday_push",
    startedAt,
    finishedAt: new Date(),
    rowsProcessed: result.processed,
    changed: result.changed,
    unchanged: 0,
    skipped: 0,
    errored: result.errored,
    errorDetail: result.errors.map((e) => ({ message: `PO ${e.poId}: ${e.message}` })),
  });

  return NextResponse.json(result);
}
