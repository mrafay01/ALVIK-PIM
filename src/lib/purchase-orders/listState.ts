import {
  PO_STATUSES,
  PRIORITIES,
  ORDER_PURPOSE_CATEGORIES,
  IMAGE_STATUSES,
} from "@/lib/enums";

// Client-safe half of the Purchase Orders list query: the URL-param state
// shape, its defaults, and parse/serialize. No mongoose imports here — the
// filter bar (a client component) imports this module directly. The
// Mongo pipeline builder lives in ./listQuery.ts.

export const PO_SORT_KEYS = [
  "updated",
  "created",
  "po",
  "vendor",
  "status",
  "priority",
  "total",
  "orderDate",
  "requestDate",
  "vendorConfDate",
  "checklist",
] as const;
export type PoSortKey = (typeof PO_SORT_KEYS)[number];

export const PO_VIEWS = [
  "all",
  "attention",
  "overdue",
  "blocked",
  "awaiting_reply",
  "awaiting_ship_conf",
  "unmapped",
  "not_synced",
] as const;
export type PoView = (typeof PO_VIEWS)[number];

export const PO_DATE_FIELDS = ["orderDate", "requestDate", "vendorConfDate", "updatedAt"] as const;

// Monday board labels that mean the PO is finished. They have no pipeline
// `status` mapping (see src/lib/monday/config.ts), so those POs sit at the
// default "send_to_vendor" — ~7,000 historical rows on the live board. They
// are treated as closed everywhere on the list page, not as open orders.
export const MONDAY_RECEIVED_LABELS = ["Received", "Received without images", "Partial received"];
export const MONDAY_CANCELED_LABELS = ["Canceled", "Cancelled"];
export const MONDAY_CLOSED_LABELS = [...MONDAY_RECEIVED_LABELS, ...MONDAY_CANCELED_LABELS];

export const PO_LIFECYCLES = ["", "open", "received", "canceled"] as const;

export type PoListState = {
  q: string;
  view: PoView;
  lifecycle: (typeof PO_LIFECYCLES)[number];
  status: string;
  priority: string;
  purpose: string;
  image: string;
  vendor: string;
  source: "" | "monday" | "quotation" | "manual";
  dateField: (typeof PO_DATE_FIELDS)[number];
  from: string;
  to: string;
  minTotal: string;
  maxTotal: string;
  checklist: "" | "complete" | "incomplete";
  replied: "" | "yes" | "no";
  shipConf: "" | "yes" | "no";
  sort: PoSortKey;
  dir: "asc" | "desc";
};

export const DEFAULT_PO_STATE: PoListState = {
  q: "",
  view: "all",
  lifecycle: "",
  status: "",
  priority: "",
  purpose: "",
  image: "",
  vendor: "",
  source: "",
  dateField: "orderDate",
  from: "",
  to: "",
  minTotal: "",
  maxTotal: "",
  checklist: "",
  replied: "",
  shipConf: "",
  sort: "updated",
  dir: "desc",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function pick<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function numOrEmpty(raw: string | undefined): string {
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? raw : "";
}

// Every param is checked against an allow-list, so a crafted URL can't
// smuggle operators or regex into the Mongo query.
export function parsePoListState(sp: Record<string, string | undefined>): PoListState {
  return {
    q: (sp.q ?? "").trim().slice(0, 100),
    view: pick(sp.view, PO_VIEWS, "all"),
    lifecycle: pick(sp.lifecycle, PO_LIFECYCLES, ""),
    status: pick(sp.status, ["", ...PO_STATUSES] as const, ""),
    priority: pick(sp.priority, ["", ...PRIORITIES] as const, ""),
    purpose: pick(sp.purpose, ["", ...ORDER_PURPOSE_CATEGORIES] as const, ""),
    image: pick(sp.image, ["", ...IMAGE_STATUSES] as const, ""),
    vendor: sp.vendor && OBJECT_ID.test(sp.vendor) ? sp.vendor : "",
    source: pick(sp.source, ["", "monday", "quotation", "manual"] as const, ""),
    dateField: pick(sp.dateField, PO_DATE_FIELDS, "orderDate"),
    from: sp.from && ISO_DATE.test(sp.from) ? sp.from : "",
    to: sp.to && ISO_DATE.test(sp.to) ? sp.to : "",
    minTotal: numOrEmpty(sp.minTotal),
    maxTotal: numOrEmpty(sp.maxTotal),
    checklist: pick(sp.checklist, ["", "complete", "incomplete"] as const, ""),
    replied: pick(sp.replied, ["", "yes", "no"] as const, ""),
    shipConf: pick(sp.shipConf, ["", "yes", "no"] as const, ""),
    sort: pick(sp.sort, PO_SORT_KEYS, "updated"),
    dir: pick(sp.dir, ["asc", "desc"] as const, "desc"),
  };
}

// Omits defaults so URLs stay short and shareable.
export function poListStateToQuery(state: PoListState): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of Object.keys(DEFAULT_PO_STATE) as (keyof PoListState)[]) {
    const v = state[k];
    if (v && v !== DEFAULT_PO_STATE[k]) out[k] = v;
  }
  return out;
}

// Sort keys whose natural first click is ascending (A–Z, earliest date,
// lowest stage); everything else starts descending (newest, biggest, most urgent).
export const ASC_FIRST_SORTS: PoSortKey[] = ["po", "vendor", "status", "requestDate"];
