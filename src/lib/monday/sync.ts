import { mondayRequest } from "./client";
import { MONDAY_BOARD_ID, MONDAY_COLUMN_IDS, STATUS_TO_MONDAY_LABEL, backOfficeFieldToMondayLabel } from "./config";
import type { PurchaseOrderDoc } from "@/models/PurchaseOrder";
import PurchaseOrder from "@/models/PurchaseOrder";
import { MONDAY_CLOSED_LABELS } from "@/lib/purchase-orders/listState";
import type { HydratedDocument } from "mongoose";

interface ColumnValuesResult {
  create_item?: { id: string };
  change_multiple_column_values?: { id: string };
}

function buildColumnValues(po: HydratedDocument<PurchaseOrderDoc>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  // Only write the Status column when the app's stage is actually the
  // truth. A PO whose board label has no pipeline mapping (Received,
  // Canceled, Stuck, On Hold…) carries a stale default stage here — pushing
  // it would overwrite e.g. "Received" on the board with "Send to vendor".
  if (po.mondayStatusMapped !== false) {
    values[MONDAY_COLUMN_IDS.status] = {
      label: STATUS_TO_MONDAY_LABEL[po.status as keyof typeof STATUS_TO_MONDAY_LABEL],
    };
  }

  if (po.poTotal != null) values[MONDAY_COLUMN_IDS.poTotal] = po.poTotal;
  if (po.orderDate) values[MONDAY_COLUMN_IDS.orderDate] = { date: toDateString(po.orderDate) };
  if (po.requestDate) values[MONDAY_COLUMN_IDS.requestDate] = { date: toDateString(po.requestDate) };
  if (po.vendorConfDate) values[MONDAY_COLUMN_IDS.vendorConfDate] = { date: toDateString(po.vendorConfDate) };
  values[MONDAY_COLUMN_IDS.joelShipConfirmed] = { checked: po.joelShipConfirmed ? "true" : "false" };

  const checklist = po.backOfficeChecklist;
  if (checklist) {
    const fields: (keyof typeof MONDAY_COLUMN_IDS)[] = ["images", "data", "pricing", "jmUpdate", "onMaster", "descriptions"];
    for (const field of fields) {
      const raw = checklist[field as keyof typeof checklist];
      if (!raw) continue;
      const label = backOfficeFieldToMondayLabel(field as "images" | "data" | "pricing" | "jmUpdate" | "onMaster" | "descriptions", raw as string);
      if (label) values[MONDAY_COLUMN_IDS[field]] = { label };
    }
  }

  return values;
}

// Records that the board now matches this PO. Saved with timestamps off:
// otherwise the save stamps updatedAt a few ms AFTER lastPushedToMondayAt,
// so the PO would look "changed since last push" forever and get re-pushed
// on every bulk sync.
function markPushed(po: HydratedDocument<PurchaseOrderDoc>, columnValues: Record<string, unknown>) {
  po.lastPushedToMondayAt = new Date();
  const pushed = columnValues[MONDAY_COLUMN_IDS.status] as { label?: string } | undefined;
  if (pushed?.label) {
    po.mondayStatusText = pushed.label;
    po.mondayStatusMapped = true;
  }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Pushes one PO to Monday.com — creates the board item on first sync
// (storing the returned id back on mondayItemId for idempotency), then
// updates column values on every subsequent call rather than creating
// duplicates. Never called synchronously inside the request that changed
// the PO's status — call this from a background job or a deliberate
// "sync now" action, per the blueprint's async-trigger design.
export async function syncPurchaseOrderToMonday(
  po: HydratedDocument<PurchaseOrderDoc>
): Promise<{ mondayItemId: string; created: boolean }> {
  const columnValues = buildColumnValues(po);

  if (!po.mondayItemId) {
    const mutation = `
      mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
        create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
          id
        }
      }
    `;
    const data = await mondayRequest<ColumnValuesResult>(mutation, {
      boardId: MONDAY_BOARD_ID,
      itemName: po.poNumber,
      columnValues: JSON.stringify(columnValues),
    });
    const id = data.create_item?.id;
    if (!id) throw new Error("Monday create_item did not return an id");

    po.mondayItemId = id;
    markPushed(po, columnValues);
    await po.save({ timestamps: false });
    return { mondayItemId: id, created: true };
  }

  const mutation = `
    mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
        id
      }
    }
  `;
  await mondayRequest<ColumnValuesResult>(mutation, {
    boardId: MONDAY_BOARD_ID,
    itemId: po.mondayItemId,
    columnValues: JSON.stringify(columnValues),
  });

  markPushed(po, columnValues);
  await po.save({ timestamps: false });

  return { mondayItemId: po.mondayItemId, created: false };
}

// Runs `worker` over `items` with at most `concurrency` in flight at once —
// keeps a bulk operation from firing hundreds of Monday API calls in a
// single unbounded burst while still being much faster than one-at-a-time.
async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

// Syncs every PO that has no mondayItemId yet, or whose content changed
// since it was last pushed (updatedAt newer than lastPushedToMondayAt) —
// used by the manual "sync now" endpoint and eventually a scheduled job.
// Runs with bounded concurrency rather than one PO at a time. Returns
// per-row results for a sync_logs entry.
//
// With timeBudgetMs, no new PO is started once the budget is spent (the
// ones in flight finish), and `more` says POs were left for another run: a
// big backlog can't fit in one serverless call. Pushed POs are stamped
// lastPushedToMondayAt, so the next run picks up exactly the rest.
export async function syncAllPurchaseOrders(opts: { timeBudgetMs?: number } = {}): Promise<{
  processed: number;
  changed: number;
  errored: number;
  errors: { poId: string; message: string }[];
  more: boolean;
}> {
  const deadline = opts.timeBudgetMs ? Date.now() + opts.timeBudgetMs : Infinity;
  const pos = await PurchaseOrder.find({
    $or: [
      { mondayItemId: null },
      { lastPushedToMondayAt: null },
      { $expr: { $gt: ["$updatedAt", "$lastPushedToMondayAt"] } },
    ],
    // Finished on the board (Received / Canceled) — nothing to push.
    mondayStatusText: { $nin: MONDAY_CLOSED_LABELS },
  });

  let changed = 0;
  let processed = 0;
  let more = false;
  const errors: { poId: string; message: string }[] = [];

  await mapWithConcurrency(pos, 4, async (po) => {
    if (Date.now() >= deadline) {
      more = true;
      return;
    }
    processed++;
    try {
      await syncPurchaseOrderToMonday(po);
      changed++;
    } catch (err) {
      errors.push({ poId: String(po._id), message: err instanceof Error ? err.message : String(err) });
    }
  });

  return { processed, changed, errored: errors.length, errors, more };
}
