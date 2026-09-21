import { mondayRequest } from "./client";
import { MONDAY_BOARD_ID, MONDAY_COLUMN_IDS, MONDAY_LABEL_TO_STATUS } from "./config";
import PurchaseOrder from "@/models/PurchaseOrder";
import Vendor from "@/models/Vendor";
import type { PoStatus, Priority } from "@/lib/enums";
import { PRIORITIES } from "@/lib/enums";

const PULL_COLUMN_IDS = [
  MONDAY_COLUMN_IDS.status,
  MONDAY_COLUMN_IDS.vendor,
  MONDAY_COLUMN_IDS.poTotal,
  MONDAY_COLUMN_IDS.orderDate,
  MONDAY_COLUMN_IDS.requestDate,
  MONDAY_COLUMN_IDS.vendorConfDate,
  MONDAY_COLUMN_IDS.priority,
  MONDAY_COLUMN_IDS.images,
  MONDAY_COLUMN_IDS.data,
  MONDAY_COLUMN_IDS.pricing,
  MONDAY_COLUMN_IDS.jmUpdate,
  MONDAY_COLUMN_IDS.onMaster,
  MONDAY_COLUMN_IDS.descriptions,
  MONDAY_COLUMN_IDS.trackingNumber,
  MONDAY_COLUMN_IDS.joelShipConfirmed,
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

// Monday date columns come back as "YYYY-MM-DD" (or blank) in `text`.
function parseDate(text: string | null): Date | null {
  if (!text) return null;
  const d = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The board's Priority column label doesn't always match the app's
// lowercase enum casing — normalize and only accept a confident match.
function parsePriority(text: string | null): Priority | null {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();
  return (PRIORITIES as readonly string[]).includes(normalized) ? (normalized as Priority) : null;
}

// Monday checkbox columns report "v" in `text` when checked, null/"" when not.
function parseCheckbox(text: string | null): boolean {
  return text === "v";
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
  // "skip_no_vendor" is the only true skip left: a brand-new board item with
  // no vendor set at all has nothing to create a PO against. Every other
  // combination (mapped status, unmapped status, or no status) now results
  // in an update or create — the board's status label is always captured
  // verbatim via mondayStatusText even when it can't drive the app's
  // pipeline `status` field. See config.ts's module comment for why.
  action: "update" | "create" | "skip_no_vendor";
  poId?: string;
  poNumber?: string;
  vendorName: string | null;
  vendorMatched: boolean;
  statusText: string | null;
  mappedStatus: PoStatus | null;
  statusChanged: boolean;
  poTotal: number | null;
  orderDate: string | null;
  requestDate: string | null;
  vendorConfDate: string | null;
  priorityText: string | null;
  trackingNumber: string | null;
  joelShipConfirmed: boolean;
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
    const orderDate = colText(item, MONDAY_COLUMN_IDS.orderDate);
    const requestDate = colText(item, MONDAY_COLUMN_IDS.requestDate);
    const vendorConfDate = colText(item, MONDAY_COLUMN_IDS.vendorConfDate);
    const priorityText = colText(item, MONDAY_COLUMN_IDS.priority);
    const trackingNumber = colText(item, MONDAY_COLUMN_IDS.trackingNumber);
    const joelShipConfirmed = parseCheckbox(colText(item, MONDAY_COLUMN_IDS.joelShipConfirmed));
    const files = parseFiles(item);
    const existing = poByNumber.get(item.name);

    if (existing) {
      // Existing POs always update, regardless of status mapping — the raw
      // label lands on mondayStatusText even when it's a side-lane state
      // like "Stuck" that can't move the pipeline `status` field.
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
        orderDate,
        requestDate,
        vendorConfDate,
        priorityText,
        trackingNumber,
        joelShipConfirmed,
        fileCount: files.length,
        reason:
          statusText && !mappedStatus
            ? `Board status "${statusText}" has no confident app-status mapping — stored as-is, pipeline status unchanged`
            : undefined,
      });
      continue;
    }

    if (!vendorName) {
      rows.push({
        mondayItemId: item.id,
        mondayItemName: item.name,
        action: "skip_no_vendor",
        vendorName: null,
        vendorMatched: false,
        statusText,
        mappedStatus,
        statusChanged: false,
        poTotal: poTotalText ? Number(poTotalText) : null,
        orderDate,
        requestDate,
        vendorConfDate,
        priorityText,
        trackingNumber,
        joelShipConfirmed,
        fileCount: files.length,
        reason: "No vendor set on this board item — cannot create a PO without one",
      });
      continue;
    }

    // A new item with a vendor is always creatable now, even with an
    // unmapped or missing status label — `status` falls back to the
    // schema's default (send_to_vendor) same as any other field the board
    // doesn't give a confident value for, and the raw label is preserved.
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
      orderDate,
      requestDate,
      vendorConfDate,
      priorityText,
      trackingNumber,
      joelShipConfirmed,
      fileCount: files.length,
      reason: [
        vendorMatched ? null : `Vendor "${vendorName}" not found in PIM — will be created automatically on import`,
        mappedStatus
          ? null
          : statusText
            ? `Board status "${statusText}" has no confident app-status mapping — will default to "Send to vendor"`
            : "No status set on board item — will default to \"Send to vendor\"",
      ]
        .filter(Boolean)
        .join("; ") || undefined,
    });
  }

  return {
    rows,
    toUpdate: rows.filter((r) => r.action === "update").length,
    toCreate: rows.filter((r) => r.action === "create").length,
    skipped: rows.filter((r) => r.action === "skip_no_vendor").length,
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
//
// The board is re-read once here (so a stale plan can't apply data that
// changed since the preview), then every DB write is batched into two
// bulkWrite calls instead of one round-trip per row.
export async function commitPullPlan(rows: PullPlanRow[]): Promise<PullCommitResult> {
  const items = await fetchAllBoardItems();
  const itemById = new Map(items.map((i) => [i.id, i]));

  // Pre-resolve every vendor a "create" row needs in one query rather than
  // a findOne per row.
  const createVendorNames = [
    ...new Set(
      rows
        .filter((r) => r.action === "create" && r.vendorName)
        .map((r) => r.vendorName as string)
    ),
  ];
  const vendors = createVendorNames.length
    ? await Vendor.find({ name: { $in: createVendorNames } }).select("name").lean()
    : [];
  const vendorIdByName = new Map(vendors.map((v) => [v.name, v._id]));

  // A vendor name on the board that doesn't exist in PIM yet is created
  // automatically here rather than blocking the PO import — Vendor.name is
  // unique, so this can never produce a duplicate: any name already
  // resolved above is skipped, and within this same batch a name is only
  // ever inserted once (missingVendorNames is de-duplicated by the Set).
  // insertMany with ordered:false + a unique index also means a genuine
  // race (another request creating the same vendor between our lookup and
  // insert) fails just that one insert, not the whole batch.
  const missingVendorNames = createVendorNames.filter((name) => !vendorIdByName.has(name));
  if (missingVendorNames.length > 0) {
    try {
      const createdVendors = await Vendor.insertMany(
        missingVendorNames.map((name) => ({ name })),
        { ordered: false }
      );
      for (const v of createdVendors) vendorIdByName.set(v.name, v._id);
    } catch (err) {
      // Some inserts may still have succeeded even though this threw
      // (ordered:false) — re-query to pick up whichever vendors actually
      // landed, e.g. from a concurrent request creating the same name.
      const writeErrors = (err as { writeErrors?: unknown[] }).writeErrors;
      if (!writeErrors) throw err;
      const reReadVendors = await Vendor.find({ name: { $in: missingVendorNames } })
        .select("name")
        .lean();
      for (const v of reReadVendors) vendorIdByName.set(v.name, v._id);
    }
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const errors: { mondayItemId: string; message: string }[] = [];

  type UpdateOp = { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } };
  type InsertOp = { insertOne: { document: Record<string, unknown> } };
  const ops: (UpdateOp | InsertOp)[] = [];
  const now = new Date();

  function checklistFrom(item: MondayItem): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [field, columnId] of Object.entries(CHECKLIST_COLUMNS)) {
      const text = colText(item, columnId);
      const value = text ? CHECKLIST_LABEL_TO_VALUE[field]?.[text] : null;
      if (value) out[field] = value;
    }
    return out;
  }

  for (const row of rows) {
    const item = itemById.get(row.mondayItemId);
    if (!item) {
      errors.push({ mondayItemId: row.mondayItemId, message: "Item no longer found on board" });
      continue;
    }
    if (row.action === "skip_no_vendor") {
      skipped++;
      continue;
    }

    const files = parseFiles(item);
    const poTotalText = colText(item, MONDAY_COLUMN_IDS.poTotal);
    const checklist = checklistFrom(item);
    const orderDate = parseDate(colText(item, MONDAY_COLUMN_IDS.orderDate));
    const requestDate = parseDate(colText(item, MONDAY_COLUMN_IDS.requestDate));
    const vendorConfDate = parseDate(colText(item, MONDAY_COLUMN_IDS.vendorConfDate));
    const priority = parsePriority(colText(item, MONDAY_COLUMN_IDS.priority));
    const trackingNumber = colText(item, MONDAY_COLUMN_IDS.trackingNumber);
    const joelShipConfirmed = parseCheckbox(colText(item, MONDAY_COLUMN_IDS.joelShipConfirmed));

    if (row.action === "update" && row.poId) {
      const statusText = colText(item, MONDAY_COLUMN_IDS.status);
      const setFields: Record<string, unknown> = {
        mondayItemId: item.id,
        mondayFiles: files,
        lastPulledFromMondayAt: now,
        joelShipConfirmed,
        // Always stored verbatim, mapped or not — this is what keeps a PO
        // sitting in "Stuck"/"Canceled"/etc. fully visible even though the
        // pipeline `status` field below only moves on a confident mapping.
        mondayStatusText: statusText,
        mondayStatusMapped: !!row.mappedStatus,
      };
      for (const [field, value] of Object.entries(checklist)) {
        setFields[`backOfficeChecklist.${field}`] = value;
      }
      if (row.mappedStatus) setFields.status = row.mappedStatus;
      if (poTotalText) setFields.poTotal = Number(poTotalText);
      if (orderDate) setFields.orderDate = orderDate;
      if (requestDate) setFields.requestDate = requestDate;
      if (vendorConfDate) setFields.vendorConfDate = vendorConfDate;
      if (priority) setFields.priority = priority;
      if (trackingNumber) setFields.trackingNumber = trackingNumber;

      ops.push({ updateOne: { filter: { _id: row.poId }, update: { $set: setFields } } });
      updated++;
      continue;
    }

    if (row.action === "create") {
      if (!row.vendorName) {
        errors.push({ mondayItemId: row.mondayItemId, message: "Cannot create — board item has no vendor set" });
        continue;
      }
      // Resolved either from the pre-commit lookup above or from the
      // auto-create step just before this loop — a vendor name present on
      // the board always ends up with an id by this point unless the
      // insert itself failed (a genuine DB error, not a "missing" case).
      const vendorId = vendorIdByName.get(row.vendorName);
      if (!vendorId) {
        errors.push({ mondayItemId: row.mondayItemId, message: `Could not create or resolve vendor "${row.vendorName}"` });
        continue;
      }

      const statusText = colText(item, MONDAY_COLUMN_IDS.status);

      ops.push({
        insertOne: {
          document: {
            poNumber: row.mondayItemName,
            vendorId,
            orderPurpose: { category: "stock" },
            // Falls back to the schema's own default ("send_to_vendor")
            // when the board's status label has no confident pipeline
            // equivalent — same as any other field the board doesn't give
            // a usable value for. mondayStatusText/mondayStatusMapped below
            // are what actually reflect the true board state in that case.
            status: row.mappedStatus ?? undefined,
            priority: priority ?? undefined,
            poTotal: poTotalText ? Number(poTotalText) : undefined,
            orderDate: orderDate ?? undefined,
            requestDate: requestDate ?? undefined,
            vendorConfDate: vendorConfDate ?? undefined,
            trackingNumber: trackingNumber ?? undefined,
            joelShipConfirmed,
            mondayStatusText: statusText,
            mondayStatusMapped: !!row.mappedStatus,
            backOfficeChecklist: checklist,
            mondayItemId: item.id,
            mondayFiles: files,
            lastPulledFromMondayAt: now,
            createdAt: now,
            updatedAt: now,
          },
        },
      });
      created++;
    }
  }

  if (ops.length > 0) {
    try {
      await PurchaseOrder.bulkWrite(ops as never, { ordered: false });
    } catch (err) {
      // bulkWrite with ordered:false still applies the writes it can; report
      // the ones it couldn't without failing the whole run.
      const writeErrors = (err as { writeErrors?: { errmsg?: string }[] }).writeErrors ?? [];
      if (writeErrors.length === 0) throw err;
      for (const we of writeErrors) {
        errors.push({ mondayItemId: "(batch)", message: we.errmsg ?? "write failed" });
      }
      updated = Math.max(0, updated - writeErrors.length);
    }
  }

  return { processed: rows.length, updated, created, skipped, errored: errors.length, errors };
}
