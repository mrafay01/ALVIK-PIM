import { Types, type PipelineStage } from "mongoose";
import { PO_STATUSES, PRIORITIES } from "@/lib/enums";
import {
  MONDAY_CLOSED_LABELS,
  MONDAY_RECEIVED_LABELS,
  MONDAY_CANCELED_LABELS,
  type PoListState,
  type PoSortKey,
} from "./listState";

// Server-only half of the Purchase Orders list query: turns a validated
// PoListState (see ./listState.ts) into a single aggregation pipeline that
// filters, computes derived sort keys, sorts, paginates, and counts.

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Number of the six back-office checklist fields at their "done" value.
// Must match CHECKLIST_DONE_VALUE in src/lib/statusDisplay.ts.
const CHECKLIST_DONE_COUNT_EXPR = {
  $add: [
    { $cond: [{ $eq: ["$backOfficeChecklist.images", "received"] }, 1, 0] },
    { $cond: [{ $eq: ["$backOfficeChecklist.data", "received"] }, 1, 0] },
    { $cond: [{ $eq: ["$backOfficeChecklist.pricing", "confirmed"] }, 1, 0] },
    { $cond: [{ $eq: ["$backOfficeChecklist.jmUpdate", "updated"] }, 1, 0] },
    { $cond: [{ $eq: ["$backOfficeChecklist.onMaster", "done"] }, 1, 0] },
    { $cond: [{ $eq: ["$backOfficeChecklist.descriptions", "done"] }, 1, 0] },
  ],
};

const SORT_FIELD: Record<PoSortKey, string> = {
  updated: "updatedAt",
  created: "createdAt",
  po: "poNumber",
  vendor: "vendorName",
  status: "statusRank",
  priority: "priorityRank",
  total: "poTotal",
  orderDate: "orderDate",
  requestDate: "requestDate",
  vendorConfDate: "vendorConfDate",
  checklist: "checklistDone",
};

// Fields that can be missing. A missing value sorts to the end in BOTH
// directions, so "earliest request date" doesn't open with fifty undated POs.
const NULLABLE_SORTS: PoSortKey[] = ["vendor", "total", "orderDate", "requestDate", "vendorConfDate", "priority"];

// "Still open" = not received in the pipeline AND not closed on the Monday
// board. Every quick view about live work starts from this.
// What "open" means for a PO everywhere (list page, dashboard): not
// received in the app and not finished/canceled on Monday.
export const OPEN_PO_CONDITIONS: Record<string, unknown>[] = [
  { status: { $ne: "shipment_received" } },
  { mondayStatusText: { $nin: MONDAY_CLOSED_LABELS } },
];
const OPEN = OPEN_PO_CONDITIONS;
const RECEIVED_MATCH = { $or: [{ status: "shipment_received" }, { mondayStatusText: { $in: MONDAY_RECEIVED_LABELS } }] };
const CANCELED_MATCH = { mondayStatusText: { $in: MONDAY_CANCELED_LABELS } };

export type PoListRow = {
  _id: unknown;
  poNumber: string;
  vendorName?: string | null;
  status: string;
  priority?: string | null;
  orderPurpose?: { category?: string; tag?: string | null };
  poTotal?: number | null;
  orderDate?: Date | null;
  requestDate?: Date | null;
  trackingNumber?: string | null;
  mondayStatusText?: string | null;
  mondayStatusMapped?: boolean | null;
  mondayItemId?: string | null;
  vendorReplySent?: boolean;
  joelShipConfirmed?: boolean;
  checklistDone: number;
  updatedAt?: Date;
  source?: "monday" | "quotation" | "manual" | null;
  lineCount: number;
};

// The view presets' extra conditions. Exported so the page can count each
// view without re-implementing the definitions. "blocked" also needs the
// computed checklist count, applied after $addFields (see VIEW_POST_MATCH).
export function viewPreMatch(view: PoListState["view"], now: Date): Record<string, unknown>[] {
  switch (view) {
    case "attention":
      return [{ priority: { $in: ["high", "critical"] } }, ...OPEN];
    case "overdue":
      return [{ requestDate: { $lt: now } }, ...OPEN];
    case "awaiting_reply":
      return [{ vendorReplySent: { $ne: true } }, ...OPEN];
    case "awaiting_ship_conf":
      return [{ status: "ready_to_ship" }, { joelShipConfirmed: { $ne: true } }, ...OPEN];
    case "unmapped":
      // Side-lane labels the pipeline doesn't model (Stuck, On hold, …) —
      // not the finished ones, which have their own lifecycle filter.
      return [{ mondayStatusMapped: false }, ...OPEN];
    case "not_synced":
      return [{ $or: [{ mondayItemId: null }, { mondayItemId: { $exists: false } }] }, ...OPEN];
    case "blocked":
      return [{ status: { $in: ["in_transit", "ready_to_ship"] } }, ...OPEN];
    default:
      return [];
  }
}

const DERIVED_FIELDS: PipelineStage.AddFields = {
  $addFields: {
    checklistDone: CHECKLIST_DONE_COUNT_EXPR,
    // Pipeline order, with Monday-closed POs placed after the last stage
    // (received, then canceled) instead of at their stale "send_to_vendor".
    statusRank: {
      $switch: {
        branches: [
          { case: { $in: ["$mondayStatusText", MONDAY_RECEIVED_LABELS] }, then: PO_STATUSES.length },
          { case: { $in: ["$mondayStatusText", MONDAY_CANCELED_LABELS] }, then: PO_STATUSES.length + 1 },
        ],
        default: { $indexOfArray: [PO_STATUSES as unknown as string[], "$status"] },
      },
    },
    priorityRank: {
      $let: {
        vars: { i: { $indexOfArray: [PRIORITIES as unknown as string[], "$priority"] } },
        in: { $cond: [{ $lt: ["$$i", 0] }, null, "$$i"] },
      },
    },
  },
};

// One $facet stage that counts every quick view at once — used for the
// badges on the view chips. Counts ignore the other filters on purpose:
// they answer "how many POs are in this situation overall", which is what
// tells someone whether a view is worth clicking.
export function buildViewCountsPipeline(now: Date): PipelineStage[] {
  const views = ["attention", "overdue", "blocked", "awaiting_reply", "awaiting_ship_conf", "unmapped", "not_synced"] as const;
  const facet: Record<string, PipelineStage.FacetPipelineStage[]> = {};
  for (const v of views) {
    const stages: PipelineStage.FacetPipelineStage[] = [{ $match: { $and: viewPreMatch(v, now) } }];
    if (v === "blocked") stages.push({ $match: { checklistDone: { $lt: 6 } } });
    stages.push({ $count: "n" });
    facet[v] = stages;
  }
  return [DERIVED_FIELDS, { $facet: facet }];
}

// `vendorIdsMatchingQ` is resolved by the caller (a regex over vendor names)
// so free-text search can match vendor names without a $lookup over every PO.
export function buildPoListPipeline(
  state: PoListState,
  opts: { vendorIdsMatchingQ: Types.ObjectId[]; skip: number; limit: number; now: Date }
): PipelineStage[] {
  const match: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [...viewPreMatch(state.view, opts.now)];

  if (state.q) {
    const rx = new RegExp(escapeRegex(state.q), "i");
    const or: Record<string, unknown>[] = [
      { poNumber: rx },
      { trackingNumber: rx },
      { mondayStatusText: rx },
      { "orderPurpose.tag": rx },
    ];
    if (opts.vendorIdsMatchingQ.length > 0) or.push({ vendorId: { $in: opts.vendorIdsMatchingQ } });
    and.push({ $or: or });
  }
  if (state.lifecycle === "open") and.push(...OPEN);
  if (state.lifecycle === "received") and.push(RECEIVED_MATCH);
  if (state.lifecycle === "canceled") and.push(CANCELED_MATCH);

  if (state.status === "shipment_received") {
    and.push(RECEIVED_MATCH);
  } else if (state.status) {
    // A Monday-closed PO's stored status is a stale default, so it must not
    // show up under the stage it's parked at.
    match.status = state.status;
    and.push({ mondayStatusText: { $nin: MONDAY_CLOSED_LABELS } });
  }
  if (state.priority) match.priority = state.priority;
  if (state.purpose) match["orderPurpose.category"] = state.purpose;
  if (state.image) match.imageStatus = state.image;
  if (state.vendor) match.vendorId = new Types.ObjectId(state.vendor);
  if (state.source === "quotation") match.source = "quotation";
  if (state.source === "manual") match.source = "manual";
  if (state.source === "monday") {
    // POs pulled before `source` existed have no source but do carry a
    // mondayItemId — count those as Monday-sourced too.
    and.push({ $or: [{ source: "monday" }, { source: null, mondayItemId: { $nin: [null, ""] } }] });
  }
  if (state.replied) match.vendorReplySent = state.replied === "yes" ? true : { $ne: true };
  if (state.shipConf) match.joelShipConfirmed = state.shipConf === "yes" ? true : { $ne: true };

  if (state.from || state.to) {
    const range: Record<string, Date> = {};
    if (state.from) range.$gte = new Date(`${state.from}T00:00:00.000Z`);
    if (state.to) range.$lte = new Date(`${state.to}T23:59:59.999Z`);
    match[state.dateField] = range;
  }
  if (state.minTotal || state.maxTotal) {
    const range: Record<string, number> = {};
    if (state.minTotal) range.$gte = Number(state.minTotal);
    if (state.maxTotal) range.$lte = Number(state.maxTotal);
    match.poTotal = range;
  }
  if (and.length > 0) match.$and = and;

  const pipeline: PipelineStage[] = [{ $match: match }, DERIVED_FIELDS];

  const postMatch: Record<string, unknown> = {};
  if (state.checklist === "complete") postMatch.checklistDone = 6;
  if (state.checklist === "incomplete" || state.view === "blocked") postMatch.checklistDone = { $lt: 6 };
  if (Object.keys(postMatch).length > 0) pipeline.push({ $match: postMatch });

  const vendorLookup: PipelineStage.FacetPipelineStage[] = [
    {
      $lookup: {
        from: "vendors",
        localField: "vendorId",
        foreignField: "_id",
        as: "_v",
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    { $addFields: { vendorName: { $arrayElemAt: ["$_v.name", 0] } } },
  ];

  // Vendor name is normally resolved only for the visible page. Sorting by
  // vendor needs it for every matched row, so the lookup moves ahead of $sort.
  const sortByVendor = state.sort === "vendor";
  if (sortByVendor) pipeline.push(...(vendorLookup as PipelineStage[]));

  const sortField = SORT_FIELD[state.sort];
  const dirNum = state.dir === "asc" ? 1 : -1;
  if (NULLABLE_SORTS.includes(state.sort)) {
    pipeline.push({
      $addFields: { _sortMissing: { $cond: [{ $eq: [{ $ifNull: [`$${sortField}`, null] }, null] }, 1, 0] } },
    });
    pipeline.push({ $sort: { _sortMissing: 1, [sortField]: dirNum, _id: 1 } });
  } else {
    pipeline.push({ $sort: { [sortField]: dirNum, _id: 1 } });
  }

  pipeline.push({
    $facet: {
      rows: [
        { $skip: opts.skip },
        { $limit: opts.limit },
        ...(sortByVendor ? [] : vendorLookup),
        {
          $project: {
            poNumber: 1,
            vendorName: 1,
            status: 1,
            priority: 1,
            orderPurpose: 1,
            poTotal: 1,
            orderDate: 1,
            requestDate: 1,
            trackingNumber: 1,
            mondayStatusText: 1,
            mondayStatusMapped: 1,
            mondayItemId: 1,
            vendorReplySent: 1,
            joelShipConfirmed: 1,
            checklistDone: 1,
            updatedAt: 1,
            source: 1,
            lineCount: { $size: { $ifNull: ["$lineItems", []] } },
          },
        },
      ],
      count: [{ $count: "n" }],
      // Sum of PO totals across the FILTERED set — the "Pipeline value"
      // tile follows the active filters instead of always showing everything.
      value: [{ $group: { _id: null, total: { $sum: { $ifNull: ["$poTotal", 0] } } } }],
    },
  });
  return pipeline;
}
