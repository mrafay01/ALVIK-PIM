import { mondayRequest } from "./client";
import { MONDAY_BOARD_ID, MONDAY_COLUMN_IDS, STATUS_TO_MONDAY_LABEL, backOfficeFieldToMondayLabel } from "./config";
import type { PurchaseOrderDoc } from "@/models/PurchaseOrder";
import PurchaseOrder from "@/models/PurchaseOrder";
import type { HydratedDocument } from "mongoose";

interface ColumnValuesResult {
  create_item?: { id: string };
  change_multiple_column_values?: { id: string };
}

function buildColumnValues(po: HydratedDocument<PurchaseOrderDoc>): Record<string, unknown> {
  const values: Record<string, unknown> = {
    [MONDAY_COLUMN_IDS.status]: { label: STATUS_TO_MONDAY_LABEL[po.status as keyof typeof STATUS_TO_MONDAY_LABEL] },
  };

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
    await po.save();
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

  return { mondayItemId: po.mondayItemId, created: false };
}

// Syncs every PO that either has no mondayItemId yet, or whose updatedAt
// is newer than its last sync — used by the manual "sync now" endpoint and
// eventually a scheduled job. Returns per-row results for a sync_logs entry.
export async function syncAllPurchaseOrders(): Promise<{
  processed: number;
  changed: number;
  errored: number;
  errors: { poId: string; message: string }[];
}> {
  const pos = await PurchaseOrder.find({});
  let changed = 0;
  const errors: { poId: string; message: string }[] = [];

  for (const po of pos) {
    try {
      await syncPurchaseOrderToMonday(po);
      changed++;
    } catch (err) {
      errors.push({ poId: String(po._id), message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processed: pos.length, changed, errored: errors.length, errors };
}
