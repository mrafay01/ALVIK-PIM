import type { JobKind } from "@/models/Job";
import SyncLog from "@/models/SyncLog";
import PurchaseOrder from "@/models/PurchaseOrder";
import { syncPurchaseOrderToMonday, syncAllPurchaseOrders } from "@/lib/monday/sync";
import logger from "@/lib/logger";
import { archiveMondayFiles } from "@/lib/purchase-orders/files";
import { enqueue } from "@/lib/jobs/queue";

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
  async monday_push_all() {
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
  // Runs in slices well under the job lease; if files remain, it queues
  // the next slice so a large backlog drains across ticks.
  async archive_po_files() {
    const result = await archiveMondayFiles({ timeBudgetMs: 3 * 60 * 1000 });
    if (result.remaining.files > 0 && result.copied + result.skipped > 0) {
      await enqueue({ kind: "archive_po_files" });
    }
    return result;
  },

  async marketplace_export(payload) {
    // Scaffolded — the current /api/marketplace-export route still runs
    // synchronously because the file is streamed to the response. When
    // that moves to a store-then-download flow this handler produces the
    // file into object storage and returns the URL for the UI to poll.
    logger.info("marketplace_export job handler is a placeholder", { payload });
    return { placeholder: true };
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
