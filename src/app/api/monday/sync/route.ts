import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import SyncLog from "@/models/SyncLog";
import { syncAllPurchaseOrders } from "@/lib/monday/sync";

// POST: manual "sync now" — pushes every purchase order to the Monday.com
// board, logging the run to sync_logs per the blueprint's traceability
// design (§ Sync traceability). Deliberately synchronous/on-demand for now
// rather than a background queue — see PROJECT-REPORT.md Phase 8.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user?.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
