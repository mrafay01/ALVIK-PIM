import { mondayRequest } from "./client";
import { MONDAY_BOARD_ID, MONDAY_COLUMN_IDS, MONDAY_LABEL_TO_STATUS } from "./config";
import PurchaseOrder from "@/models/PurchaseOrder";
import Vendor from "@/models/Vendor";
import type { PoStatus } from "@/lib/enums";

const PULL_COLUMN_IDS = [
  MONDAY_COLUMN_IDS.status,
  MONDAY_COLUMN_IDS.vendor,
  MONDAY_COLUMN_IDS.poTotal,
  MONDAY_COLUMN_IDS.images,
  MONDAY_COLUMN_IDS.data,
  MONDAY_COLUMN_IDS.pricing,
  MONDAY_COLUMN_IDS.jmUpdate,
  MONDAY_COLUMN_IDS.onMaster,
  MONDAY_COLUMN_IDS.descriptions,
  "files",
] as const;

interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

interface BoardItemsResult {
  boards: { items_page: { cursor: string | null; items: MondayItem[] } }[];
}

async function fetchAllBoardItems(): Promise<MondayItem[]> {
  const items: MondayItem[] = [];
  let cursor: string | null = null;

  do {
    const query: string = cursor
      ? `query ($cursor: String!) {
          boards(ids: [${MONDAY_BOARD_ID}]) {
            items_page(limit: 100, cursor: $cursor) {
              cursor
              items { id name column_values(ids: ${JSON.stringify(PULL_COLUMN_IDS)}) { id text value } }
            }
          }
        }`
      : `query {
          boards(ids: [${MONDAY_BOARD_ID}]) {
            items_page(limit: 100) {
              cursor
              items { id name column_values(ids: ${JSON.stringify(PULL_COLUMN_IDS)}) { id text value } }
            }
          }
        }`;

    const data: BoardItemsResult = await mondayRequest<BoardItemsResult>(query, cursor ? { cursor } : undefined);
    const page: BoardItemsResult["boards"][number]["items_page"] | undefined = data.boards[0]?.items_page;
    if (!page) break;
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);

  return items;
}

function colText(item: MondayItem, columnId: string): string | null {
  return item.column_values.find((c) => c.id === columnId)?.text ?? null;
}

function parseFiles(item: MondayItem): { name: string; assetId: string }[] {
  const raw = item.column_values.find((c) => c.id === "files")?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { files?: { name: string; assetId: number }[] };
    return (parsed.files ?? []).map((f) => ({ name: f.name, assetId: String(f.assetId) }));
  } catch {
    return [];
  }
}

export interface PullPlanRow {
  mondayItemId: string;
  mondayItemName: string;
  action: "update" | "create" | "skip_no_status";
  poId?: string;
  poNumber?: string;
  vendorName: string | null;
  vendorMatched: boolean;
  statusText: string | null;
  mappedStatus: PoStatus | null;
  statusChanged: boolean;
  poTotal: number | null;
  fileCount: number;
  reason?: string;
}

export interface PullPlan {
  rows: PullPlanRow[];
  toUpdate: number;
  toCreate: number;
  skipped: number;
}

// Read-only: fetches every item on the real Monday board and computes what
// a pull would do, without writing to the DB. Matching is by PO number
// (Monday item name == PurchaseOrder.poNumber) since no mondayItemId has
// ever been recorded on the inbound direction for pre-existing board items.
export async function buildPullPlan(): Promise<PullPlan> {
  const items = await fetchAllBoardItems();
  const poNumbers = items.map((i) => i.name);
  const existingPOs = await PurchaseOrder.find({ poNumber: { $in: poNumbers } }).lean();
  const poByNumber = new Map(existingPOs.map((po) => [po.poNumber, po]));

  const vendorNames = [...new Set(items.map((i) => colText(i, MONDAY_COLUMN_IDS.vendor)).filter(Boolean))] as string[];
  const vendors = await Vendor.find({ name: { $in: vendorNames } }).lean();
  const vendorByName = new Map(vendors.map((v) => [v.name, v]));

  const rows: PullPlanRow[] = [];

  for (const item of items) {
    const statusText = colText(item, MONDAY_COLUMN_IDS.status);
    const mappedStatus = statusText ? MONDAY_LABEL_TO_STATUS[statusText] ?? null : null;
    const vendorName = colText(item, MONDAY_COLUMN_IDS.vendor);
    const vendorMatched = vendorName ? vendorByName.has(vendorName) : false;
    const poTotalText = colText(item, MONDAY_COLUMN_IDS.poTotal);
    const files = parseFiles(item);
    const existing = poByNumber.get(item.name);

    if (existing) {
      rows.push({
        mondayItemId: item.id,
        mondayItemName: item.name,
        action: "update",
        poId: String(existing._id),
        poNumber: existing.poNumber,
        vendorName,
        vendorMatched,
        statusText,
        mappedStatus,
        statusChanged: mappedStatus != null && mappedStatus !== existing.status,
        poTotal: poTotalText ? Number(poTotalText) : null,
        fileCount: files.length,
      });
      continue;
    }

    if (!mappedStatus) {
      rows.push({
        mondayItemId: item.id,
        mondayItemName: item.name,
        action: "skip_no_status",
        vendorName,
        vendorMatched,
        statusText,
        mappedStatus: null,
        statusChanged: false,
        poTotal: poTotalText ? Number(poTotalText) : null,
        fileCount: files.length,
        reason: statusText
          ? `Board status "${statusText}" has no confident app-status mapping`
          : "No status set on board item",
      });
      continue;
    }

    rows.push({
      mondayItemId: item.id,
      mondayItemName: item.name,
      action: "create",
      vendorName,
      vendorMatched,
      statusText,
      mappedStatus,
      statusChanged: false,
      poTotal: poTotalText ? Number(poTotalText) : null,
      fileCount: files.length,
      reason: vendorMatched ? undefined : `Vendor "${vendorName ?? "(none)"}" not found in PIM — will need manual vendor assignment`,
    });
  }

  return {
    rows,
    toUpdate: rows.filter((r) => r.action === "update").length,
    toCreate: rows.filter((r) => r.action === "create").length,
    skipped: rows.filter((r) => r.action === "skip_no_status").length,
  };
}

export interface PullCommitResult {
  processed: number;
  updated: number;
  created: number;
  skipped: number;
  errored: number;
  errors: { mondayItemId: string; message: string }[];
}

const CHECKLIST_COLUMNS = {
  images: MONDAY_COLUMN_IDS.images,
  data: MONDAY_COLUMN_IDS.data,
  pricing: MONDAY_COLUMN_IDS.pricing,
  jmUpdate: MONDAY_COLUMN_IDS.jmUpdate,
  onMaster: MONDAY_COLUMN_IDS.onMaster,
  descriptions: MONDAY_COLUMN_IDS.descriptions,
} as const;

const CHECKLIST_LABEL_TO_VALUE: Record<string, Record<string, string>> = {
  images: { "Sent to photo guy": "sent_to_photo_guy", "Rush 1pcs for photo guy": "rush_requested", "Modify image": "modify_requested", Received: "received" },
  data: { "Waiting for vendor update": "waiting_for_vendor_update", Received: "received" },
  pricing: { Negotiating: "pending", Confirmed: "confirmed" },
  jmUpdate: { "Working on it": "pending", "Waiting for Jm price": "waiting_for_price", "Waiting for Box#": "waiting_for_box_number", Updated: "updated" },
  onMaster: { "Need to enter it": "pending", "Need MSRP Prices": "need_msrp", Done: "done" },
  descriptions: { "in-progress": "pending", "waiting for more items": "waiting_for_more_items", Done: "done" },
};

// Applies a previously reviewed pull plan: updates matched POs' status /
// checklist / totals / file references from the board, and creates new
// POs for unmatched board items whose status has a confident mapping.
// Deliberately never writes back to Monday — this is inbound-only.
export async function commitPullPlan(rows: PullPlanRow[]): Promise<PullCommitResult> {
  const items = await fetchAllBoardItems();
  const itemById = new Map(items.map((i) => [i.id, i]));

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const errors: { mondayItemId: string; message: string }[] = [];

  for (const row of rows) {
    const item = itemById.get(row.mondayItemId);
    if (!item) {
      errors.push({ mondayItemId: row.mondayItemId, message: "Item no longer found on board" });
      continue;
    }

    try {
      if (row.action === "skip_no_status") {
        skipped++;
        continue;
      }

      const files = parseFiles(item);
      const poTotalText = colText(item, MONDAY_COLUMN_IDS.poTotal);
      const checklistUpdate: Record<string, string> = {};
      for (const [field, columnId] of Object.entries(CHECKLIST_COLUMNS)) {
        const text = colText(item, columnId);
        const value = text ? CHECKLIST_LABEL_TO_VALUE[field]?.[text] : null;
        if (value) checklistUpdate[`backOfficeChecklist.${field}`] = value;
      }

      if (row.action === "update" && row.poId) {
        const setFields: Record<string, unknown> = {
          ...checklistUpdate,
          mondayItemId: item.id,
          mondayFiles: files,
          lastPulledFromMondayAt: new Date(),
        };
        if (row.mappedStatus) setFields.status = row.mappedStatus;
        if (poTotalText) setFields.poTotal = Number(poTotalText);

        await PurchaseOrder.updateOne({ _id: row.poId }, { $set: setFields });
        updated++;
        continue;
      }

      if (row.action === "create") {
        if (!row.vendorMatched || !row.vendorName) {
          errors.push({ mondayItemId: row.mondayItemId, message: `Cannot create — vendor "${row.vendorName ?? "(none)"}" not found in PIM` });
          continue;
        }
        const vendor = await Vendor.findOne({ name: row.vendorName }).lean();
        if (!vendor) {
          errors.push({ mondayItemId: row.mondayItemId, message: `Vendor "${row.vendorName}" disappeared during commit` });
          continue;
        }

        await PurchaseOrder.create({
          poNumber: row.mondayItemName,
          vendorId: vendor._id,
          orderPurpose: { category: "stock" },
          status: row.mappedStatus,
          poTotal: poTotalText ? Number(poTotalText) : undefined,
          backOfficeChecklist: Object.fromEntries(
            Object.entries(checklistUpdate).map(([k, v]) => [k.replace("backOfficeChecklist.", ""), v])
          ),
          mondayItemId: item.id,
          mondayFiles: files,
          lastPulledFromMondayAt: new Date(),
        });
        created++;
      }
    } catch (err) {
      errors.push({ mondayItemId: row.mondayItemId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processed: rows.length, updated, created, skipped, errored: errors.length, errors };
}
