import type { JobKind } from "@/models/Job";
import SyncLog from "@/models/SyncLog";
import PurchaseOrder from "@/models/PurchaseOrder";
import { syncPurchaseOrderToMonday, syncAllPurchaseOrders } from "@/lib/monday/sync";
import { archiveMondayFiles } from "@/lib/purchase-orders/files";
import { enqueue } from "@/lib/jobs/queue";
import { notify } from "@/lib/notifications/notify";
import { mondaySyncFailed } from "@/lib/notifications/messages";

// Per-kind handler table. Every job the queue knows about has exactly
// one handler here; adding a new kind means adding its JOB_KINDS entry
// and a handler below — nothing else touches the queue plumbing.
//
// Handlers receive the already-claimed job's payload and return any
// serializable result that should be persisted on the job row for the
// admin UI / sync_logs. A thrown error signals the queue to retry
// per the backoff policy in queue.ts.

export type JobResult = unknown;

type Handler = (payload: Record<string, unknown>) => Promise<JobResult>;

const HANDLERS: Record<JobKind, Handler> = {
  // Runs in ~30 s slices so one fits inside a 60 s tick (which may start it
  // up to 15 s in). If POs are left it queues the next slice, but only when
  // this one pushed something, so a board that keeps refusing doesn't loop
  // forever.
  async monday_push_all() {
    const startedAt = new Date();
    const result = await syncAllPurchaseOrders({ timeBudgetMs: 30_000 });
    if (result.more && result.changed > 0) {
      await enqueue({ kind: "monday_push_all" });
    }
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
    if (result.errored > 0) {
      // Awaited: a background job has no response to send first.
      await notify({
        ...mondaySyncFailed({
          what: "push",
          failed: result.errored,
          total: result.processed,
          messages: result.errors.map((e) => `PO ${e.poId}: ${e.message}`),
        }),
        // The push re-queues itself in slices; one email per hour of slices.
        throttle: { key: "monday-push-failed", windowMs: 60 * 60 * 1000 },
      });
    }
    return result;
  },

  async monday_push_po(payload) {
    const poId = payload.poId;
    if (typeof poId !== "string") throw new Error("monday_push_po: payload.poId is required");
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw new Error(`monday_push_po: PO ${poId} not found`);
    return syncPurchaseOrderToMonday(po);
  },

  // Copies Monday PO files into SharePoint (see lib/purchase-orders/files).
  // Runs in ~40 s slices so one fits inside a 60 s tick; if files remain,
  // it queues the next slice so a large backlog drains across ticks.
  async archive_po_files() {
    const result = await archiveMondayFiles({ timeBudgetMs: 40_000 });
    if (result.remaining.files > 0 && result.copied + result.skipped > 0) {
      await enqueue({ kind: "archive_po_files" });
    }
    return result;
  },
};

export async function runJob(
  kind: JobKind,
  payload: Record<string, unknown>
): Promise<JobResult> {
  const handler = HANDLERS[kind];
  if (!handler) throw new Error(`No handler registered for job kind ${kind}`);
  return handler(payload);
}
