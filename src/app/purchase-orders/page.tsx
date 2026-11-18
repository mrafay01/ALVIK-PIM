import Link from "next/link";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import PurchaseOrder from "@/models/PurchaseOrder";
import Vendor from "@/models/Vendor";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import {
  ClipboardList,
  TriangleAlert,
  DollarSign,
  CalendarClock,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FileSpreadsheet,
  LayoutGrid,
  PackagePlus,
} from "lucide-react";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/statusDisplay";
import { PO_STATUSES, PRIORITIES, ORDER_PURPOSE_CATEGORIES, IMAGE_STATUSES, type PoStatus } from "@/lib/enums";
import {
  parsePoListState,
  poListStateToQuery,
  ASC_FIRST_SORTS,
  MONDAY_RECEIVED_LABELS,
  MONDAY_CANCELED_LABELS,
  type PoListState,
  type PoSortKey,
  type PoView,
} from "@/lib/purchase-orders/listState";
import {
  buildPoListPipeline,
  buildViewCountsPipeline,
  escapeRegex,
  type PoListRow,
} from "@/lib/purchase-orders/listQuery";
import { PurchaseOrderFilters } from "./PurchaseOrderFilters";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

function humanize(s: string): string {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const PRIORITY_TONE: Record<string, "neutral" | "warn" | "critical" | "brand"> = {
  low: "neutral",
  medium: "brand",
  high: "warn",
  critical: "critical",
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const state = parsePoListState(sp);
  const page = parsePage(sp.page);
  const now = new Date();

  await connectDB();

  // Free-text search also matches vendor names: resolve those to ids first
  // so the PO query stays a plain indexed $in instead of a $lookup on every PO.
  const vendorIdsMatchingQ: Types.ObjectId[] = state.q
    ? (
        await Vendor.find({ name: new RegExp(escapeRegex(state.q), "i") })
          .select("_id")
          .limit(200)
          .lean()
      ).map((v) => v._id as Types.ObjectId)
    : [];

  const [listResult, viewCountsResult, allCount, vendors] = await Promise.all([
    PurchaseOrder.aggregate(
      buildPoListPipeline(state, { vendorIdsMatchingQ, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, now })
    ).collation({ locale: "en", numericOrdering: true }),
    PurchaseOrder.aggregate(buildViewCountsPipeline(now)),
    PurchaseOrder.estimatedDocumentCount(),
    Vendor.find({}).select("name").sort({ name: 1 }).lean(),
  ]);

  const rows = (listResult[0]?.rows ?? []) as PoListRow[];
  const total: number = listResult[0]?.count?.[0]?.n ?? 0;
  const filteredValue: number = listResult[0]?.value?.[0]?.total ?? 0;
  const { openValue: openValueFacet, ...counts } = (viewCountsResult[0] ?? {}) as Record<string, { n: number }[]>;
  const openValue = openValueFacet?.[0]?.n ?? 0;
  const viewCounts: Partial<Record<PoView, number>> = Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, v[0]?.n ?? 0])
  );

  const query = poListStateToQuery(state);
  const isFiltered = Object.keys(query).some((k) => k !== "sort" && k !== "dir");

  // A page past the end (an old bookmark, or the last row filtered away):
  // go to the last page that has rows instead of an empty table.
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > lastPage && total > 0) {
    const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]));
    if (lastPage > 1) params.set("page", String(lastPage));
    const qs = params.toString();
    redirect(qs ? `/purchase-orders?${qs}` : "/purchase-orders");
  }

  return (
    <AppShell activeHref="/purchase-orders" eyebrow="Vendor pipeline" title="Purchase Orders">
      <p className="text-ink-soft max-w-[72ch] mb-6 text-[0.92rem]">
        All purchase orders in one list.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <StatCard
          label={isFiltered ? `Matching (of ${allCount})` : "Total POs"}
          value={total}
          icon={ClipboardList}
          tone="brand"
        />
        <StatCard label="Needs attention" value={viewCounts.attention ?? 0} icon={TriangleAlert} tone="warn" />
        <StatCard label="Overdue" value={viewCounts.overdue ?? 0} icon={CalendarClock} tone="warn" />
        <StatCard
          label={isFiltered ? "Value (matching)" : "Open pipeline value"}
          value={`$${(isFiltered ? filteredValue : openValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          tone="neutral"
        />
      </div>

      <PurchaseOrderFilters
        state={state}
        viewCounts={viewCounts}
        vendors={vendors.map((v) => ({ value: String(v._id), label: v.name }))}
        statuses={PO_STATUSES.map((s) => ({ value: s, label: PO_STATUS_LABEL[s] }))}
        priorities={PRIORITIES.map((p) => ({ value: p, label: humanize(p) }))}
        purposes={ORDER_PURPOSE_CATEGORIES.map((p) => ({ value: p, label: humanize(p) }))}
        imageStatuses={IMAGE_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
      />

      {total === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">
            {allCount === 0
              ? "No purchase orders yet. Commit a vendor quote, or run the Monday import."
              : "No purchase orders match these filters."}
          </p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1100px]">
              <thead>
                <tr>
                  <SortHeader label="PO #" sortKey="po" state={state} />
                  <SortHeader label="Vendor" sortKey="vendor" state={state} />
                  <SortHeader label="Stage" sortKey="status" state={state} />
                  <SortHeader label="Priority" sortKey="priority" state={state} />
                  <th className={TH_CLASS}>Purpose</th>
                  <th className={`${TH_CLASS} text-right`}>Lines</th>
                  <SortHeader label="Checklist" sortKey="checklist" state={state} />
                  <SortHeader label="Ordered" sortKey="orderDate" state={state} />
                  <SortHeader label="Requested" sortKey="requestDate" state={state} />
                  <SortHeader label="Total" sortKey="total" state={state} align="right" />
                  <SortHeader label="Updated" sortKey="updated" state={state} />
                </tr>
              </thead>
              <tbody>
                {rows.map((po) => {
                  const label = po.mondayStatusText ?? "";
                  const receivedOnBoard = MONDAY_RECEIVED_LABELS.includes(label);
                  const canceledOnBoard = MONDAY_CANCELED_LABELS.includes(label);
                  const closed = receivedOnBoard || canceledOnBoard || po.status === "shipment_received";
                  const overdue = !!po.requestDate && new Date(po.requestDate) < now && !closed;
                  const fromMonday = po.source === "monday" || (!po.source && !!po.mondayItemId);
                  const sourceTitle = fromMonday
                    ? "From the Monday board"
                    : po.source === "manual"
                      ? "Created from an item's page"
                      : "From a committed vendor quote";
                  const SourceIcon = fromMonday ? LayoutGrid : po.source === "manual" ? PackagePlus : FileSpreadsheet;
                  return (
                    <tr key={String(po._id)} className="czc-row border-b border-border">
                      <td className={TD_CLASS}>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/purchase-orders/${po._id}`}
                            className="font-mono font-semibold text-[0.85rem] text-navy-deep no-underline"
                          >
                            {po.poNumber}
                          </Link>
                          <span title={sourceTitle} className="text-ink-faint">
                            <SourceIcon size={12} />
                          </span>
                        </div>
                        {po.trackingNumber && (
                          <div className="text-[0.72rem] text-ink-faint font-mono mt-0.5">#{po.trackingNumber}</div>
                        )}
                      </td>
                      <td className={`${TD_CLASS} text-ink-soft`}>{po.vendorName || "—"}</td>
                      <td className={TD_CLASS}>
                        {receivedOnBoard || canceledOnBoard ? (
                          // The stored stage is a stale default for these; the
                          // Monday label is the truth, so show that instead.
                          <Pill tone={receivedOnBoard ? "good" : "neutral"}>{label}</Pill>
                        ) : (
                          <Pill tone={PO_STATUS_TONE[po.status as PoStatus]}>
                            {PO_STATUS_LABEL[po.status as PoStatus] ?? po.status}
                          </Pill>
                        )}
                        {po.mondayStatusMapped === false && po.mondayStatusText && !closed && (
                          <div
                            className="text-[0.72rem] text-warn mt-1 flex items-center gap-1"
                            title="Monday board label that the pipeline doesn't model"
                          >
                            <TriangleAlert size={11} /> {po.mondayStatusText}
                          </div>
                        )}
                      </td>
                      <td className={TD_CLASS}>
                        {po.priority ? (
                          <Pill tone={PRIORITY_TONE[po.priority] ?? "neutral"}>{humanize(po.priority)}</Pill>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${TD_CLASS} text-ink-soft`}>
                        {po.orderPurpose?.category ? humanize(po.orderPurpose.category) : "—"}
                        {po.orderPurpose?.tag && (
                          <div className="text-[0.72rem] text-ink-faint">{po.orderPurpose.tag}</div>
                        )}
                      </td>
                      <td className={`${TD_CLASS} font-mono text-right`}>{po.lineCount || "—"}</td>
                      <td className={TD_CLASS}>
                        <ChecklistMeter done={po.checklistDone} />
                      </td>
                      <td className={`${TD_CLASS} text-[0.8rem] text-ink-soft whitespace-nowrap`}>
                        {fmtDate(po.orderDate)}
                      </td>
                      <td
                        className={`${TD_CLASS} text-[0.8rem] whitespace-nowrap ${
                          overdue ? "text-critical font-semibold" : "text-ink-soft"
                        }`}
                        title={overdue ? "Past the request date and not yet received" : undefined}
                      >
                        {fmtDate(po.requestDate)}
                      </td>
                      <td className={`${TD_CLASS} font-mono text-right`}>
                        {po.poTotal != null ? `$${po.poTotal.toLocaleString()}` : "—"}
                      </td>
                      <td className={`${TD_CLASS} text-[0.78rem] text-ink-faint whitespace-nowrap`}>
                        {fmtDate(po.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination page={page} total={total} basePath="/purchase-orders" query={query} />
          </div>
        </Card>
      )}
    </AppShell>
  );
}

// Clickable column header. Clicking the active column flips direction;
// clicking another column switches to it with that column's natural first
// direction (A–Z / earliest for names and dates people scan forward,
// newest / largest / most urgent for the rest).
function SortHeader({
  label,
  sortKey,
  state,
  align,
}: {
  label: string;
  sortKey: PoSortKey;
  state: PoListState;
  align?: "right";
}) {
  const active = state.sort === sortKey;
  const nextDir: PoListState["dir"] = active
    ? state.dir === "asc"
      ? "desc"
      : "asc"
    : ASC_FIRST_SORTS.includes(sortKey)
      ? "asc"
      : "desc";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(poListStateToQuery({ ...state, sort: sortKey, dir: nextDir }))) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  const Icon = !active ? ArrowUpDown : state.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={`${TH_CLASS} ${align === "right" ? "text-right" : ""}`} aria-sort={active ? (state.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={qs ? `/purchase-orders?${qs}` : "/purchase-orders"}
        className={`inline-flex items-center gap-1 no-underline ${
          active ? "text-brand" : "text-ink-faint hover:text-ink"
        }`}
      >
        {label}
        <Icon size={11} className={active ? "" : "opacity-50"} />
      </Link>
    </th>
  );
}

function ChecklistMeter({ done }: { done: number }) {
  const pct = Math.round((done / 6) * 100);
  const tone = done === 6 ? "bg-good" : done >= 3 ? "bg-brand-fill" : "bg-warn";
  return (
    <div className="flex items-center gap-2" title={`${done} of 6 back-office checklist items done`}>
      <div className="w-[52px] h-[6px] rounded-full bg-surface-sunken overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[0.75rem] text-ink-soft">{done}/6</span>
    </div>
  );
}
