"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X, SlidersHorizontal, ArrowDownUp } from "lucide-react";
import { Select as BaseSelect } from "@/components/ui/Field";
import {
  DEFAULT_PO_STATE,
  poListStateToQuery,
  type PoListState,
  type PoView,
  type PoSortKey,
} from "@/lib/purchase-orders/listState";

const LABEL = "text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide";
const INPUT =
  "font-body text-[0.89rem] px-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none w-full focus:border-brass focus:shadow-[0_0_0_3px_var(--brass-glow)]";

const VIEWS: { value: PoView; label: string; hint: string }[] = [
  { value: "all", label: "All", hint: "Every purchase order" },
  { value: "attention", label: "Needs attention", hint: "High/critical priority, not yet received" },
  { value: "overdue", label: "Overdue", hint: "Request date has passed, not yet received" },
  { value: "blocked", label: "Checklist blocking", hint: "In transit / ready to ship with back-office checklist incomplete" },
  { value: "awaiting_reply", label: "Awaiting vendor reply", hint: "No reply sent to the vendor yet" },
  { value: "awaiting_ship_conf", label: "Awaiting ship confirmation", hint: "Ready to ship, Joel hasn't confirmed" },
  { value: "unmapped", label: "Unmapped Monday status", hint: "Board label the pipeline doesn't model (Stuck, On hold…)" },
  { value: "not_synced", label: "Not on Monday", hint: "Never pushed to the Monday board" },
];

const SORTS: { value: PoSortKey; label: string }[] = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Date created" },
  { value: "po", label: "PO number" },
  { value: "vendor", label: "Vendor" },
  { value: "status", label: "Pipeline stage" },
  { value: "priority", label: "Priority" },
  { value: "total", label: "PO total" },
  { value: "orderDate", label: "Order date" },
  { value: "requestDate", label: "Request date" },
  { value: "vendorConfDate", label: "Vendor confirmation date" },
  { value: "checklist", label: "Checklist progress" },
];

type Option = { value: string; label: string };

// A bare <select> sizes itself to its longest option and overflows a
// fixed-width column; pin each one to the width of the column it sits in.
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <BaseSelect {...props} className={`w-full min-w-0 ${props.className ?? ""}`} />;
}

export function PurchaseOrderFilters({
  state,
  vendors,
  statuses,
  priorities,
  purposes,
  imageStatuses,
  viewCounts,
}: {
  state: PoListState;
  vendors: Option[];
  statuses: Option[];
  priorities: Option[];
  purposes: Option[];
  imageStatuses: Option[];
  viewCounts: Partial<Record<PoView, number>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(state.q);

  // Follow the URL when it changes from outside the box (Clear, back/forward),
  // but never while someone is typing in it: an older search arriving late
  // would otherwise wipe the letters typed since.
  useEffect(() => {
    if (document.activeElement !== searchRef.current) setQ(state.q);
  }, [state.q]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const advancedActive =
    !!state.image || !!state.from || !!state.to || !!state.minTotal || !!state.maxTotal ||
    !!state.checklist || !!state.replied || !!state.shipConf;
  const [showAdvanced, setShowAdvanced] = useState(advancedActive);

  function pushWith(next: Partial<PoListState>) {
    // A search still waiting to run goes along with this change; on its own
    // it would run later with the filters from before this change and undo it.
    if (debounceRef.current && !("q" in next)) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      next = { ...next, q: (searchRef.current?.value ?? q).trim() };
    }
    const merged = { ...state, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(poListStateToQuery(merged))) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function onSearchChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      pushWith({ q: value.trim() });
    }, 350);
  }

  function clearAll() {
    // A search still waiting to run would bring the old text straight back.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setQ("");
    pushWith({ ...DEFAULT_PO_STATE, sort: state.sort, dir: state.dir });
  }

  const activeCount = (Object.keys(DEFAULT_PO_STATE) as (keyof PoListState)[]).filter(
    (k) => k !== "sort" && k !== "dir" && k !== "dateField" && state[k] !== DEFAULT_PO_STATE[k]
  ).length;

  return (
    <div className="mb-5 flex flex-col gap-3.5">
      {/* Quick views */}
      <div className="flex gap-1.5 flex-wrap">
        {VIEWS.map((v) => {
          const active = state.view === v.value;
          const count = viewCounts[v.value];
          return (
            <button
              key={v.value}
              type="button"
              title={v.hint}
              onClick={() => pushWith({ view: v.value })}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.82rem] border ${
                active
                  ? "font-semibold bg-brass-bg text-brass border-[color:var(--brass-glow)]"
                  : "font-medium bg-transparent text-ink-soft border-border hover:border-border-strong"
              }`}
            >
              {v.label}
              {count != null && count > 0 && (
                <span className={`font-mono text-[0.72rem] ${active ? "text-brass" : "text-ink-faint"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Primary row */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
          <span className={LABEL}>Search</span>
          <span className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="PO #, vendor, tracking #, Monday status, tag…"
              className={`${INPUT} pl-8`}
            />
          </span>
        </label>

        <label className="flex flex-col gap-1.5 w-[150px]">
          <span className={LABEL}>Lifecycle</span>
          <Select
            value={state.lifecycle}
            onChange={(e) => pushWith({ lifecycle: e.target.value as PoListState["lifecycle"] })}
          >
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="received">Received</option>
            <option value="canceled">Canceled</option>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 w-[170px]">
          <span className={LABEL}>Stage</span>
          <Select value={state.status} onChange={(e) => pushWith({ status: e.target.value })}>
            <option value="">All stages</option>
            {statuses.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 w-[180px]">
          <span className={LABEL}>Vendor</span>
          <Select value={state.vendor} onChange={(e) => pushWith({ vendor: e.target.value })}>
            <option value="">All vendors</option>
            {vendors.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 w-[140px]">
          <span className={LABEL}>Source</span>
          <Select
            value={state.source}
            onChange={(e) => pushWith({ source: e.target.value as PoListState["source"] })}
          >
            <option value="">All sources</option>
            <option value="monday">Monday board</option>
            <option value="quotation">Vendor quote</option>
            <option value="manual">Created from item</option>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 w-[130px]">
          <span className={LABEL}>Priority</span>
          <Select value={state.priority} onChange={(e) => pushWith({ priority: e.target.value })}>
            <option value="">Any</option>
            {priorities.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 w-[160px]">
          <span className={LABEL}>Purpose</span>
          <Select value={state.purpose} onChange={(e) => pushWith({ purpose: e.target.value })}>
            <option value="">Any</option>
            {purposes.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </label>

        <div className="flex flex-col gap-1.5 w-[250px]">
          <span className={LABEL}>Sort by</span>
          <span className="flex gap-1.5 items-stretch">
            <Select
              value={state.sort}
              onChange={(e) => pushWith({ sort: e.target.value as PoSortKey })}
              aria-label="Sort by"
              className="flex-1 min-w-0"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => pushWith({ dir: state.dir === "asc" ? "desc" : "asc" })}
              title={state.dir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
              className="flex items-center justify-center gap-1 w-[64px] rounded-sm border border-border-strong text-ink-soft hover:border-brass hover:text-brass font-mono text-[0.72rem] shrink-0"
            >
              <ArrowDownUp size={13} />
              {state.dir === "asc" ? "ASC" : "DESC"}
            </button>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-sm border text-[0.82rem] ${
            showAdvanced || advancedActive
              ? "border-brass text-brass"
              : "border-border-strong text-ink-soft hover:border-brass hover:text-brass"
          }`}
        >
          <SlidersHorizontal size={14} /> More filters
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 text-[0.8rem] text-ink-soft hover:text-critical px-2 py-2.5"
          >
            <X size={13} /> Clear {activeCount}
          </button>
        )}
      </div>

      {/* Advanced */}
      {showAdvanced && (
        <div className="flex flex-wrap items-end gap-3 p-3.5 rounded-md border border-border bg-surface-sunken/40">
          <label className="flex flex-col gap-1.5 w-[190px]">
            <span className={LABEL}>Date field</span>
            <Select
              value={state.dateField}
              onChange={(e) => pushWith({ dateField: e.target.value as PoListState["dateField"] })}
            >
              <option value="orderDate">Order date</option>
              <option value="requestDate">Request date</option>
              <option value="vendorConfDate">Vendor confirmation date</option>
              <option value="updatedAt">Last updated</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 w-[150px]">
            <span className={LABEL}>From</span>
            {/* Keyed on the URL value so Clear / back resets what's shown. */}
            <input
              key={`from-${state.from}`}
              type="date"
              defaultValue={state.from}
              max={state.to || undefined}
              onChange={(e) => pushWith({ from: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1.5 w-[150px]">
            <span className={LABEL}>To</span>
            <input
              key={`to-${state.to}`}
              type="date"
              defaultValue={state.to}
              min={state.from || undefined}
              onChange={(e) => pushWith({ to: e.target.value })}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1.5 w-[110px]">
            <span className={LABEL}>Min total $</span>
            <input
              key={`min-${state.minTotal}`}
              type="number"
              min="0"
              step="0.01"
              defaultValue={state.minTotal}
              onBlur={(e) => e.target.value !== state.minTotal && pushWith({ minTotal: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1.5 w-[110px]">
            <span className={LABEL}>Max total $</span>
            <input
              key={`max-${state.maxTotal}`}
              type="number"
              min="0"
              step="0.01"
              defaultValue={state.maxTotal}
              onBlur={(e) => e.target.value !== state.maxTotal && pushWith({ maxTotal: e.target.value })}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1.5 w-[170px]">
            <span className={LABEL}>Image status</span>
            <Select value={state.image} onChange={(e) => pushWith({ image: e.target.value })}>
              <option value="">Any</option>
              {imageStatuses.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1.5 w-[150px]">
            <span className={LABEL}>Checklist</span>
            <Select
              value={state.checklist}
              onChange={(e) => pushWith({ checklist: e.target.value as PoListState["checklist"] })}
            >
              <option value="">Any</option>
              <option value="complete">Complete (6/6)</option>
              <option value="incomplete">Incomplete</option>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5 w-[140px]">
            <span className={LABEL}>Vendor replied</span>
            <Select
              value={state.replied}
              onChange={(e) => pushWith({ replied: e.target.value as PoListState["replied"] })}
            >
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5 w-[150px]">
            <span className={LABEL}>Ship confirmed</span>
            <Select
              value={state.shipConf}
              onChange={(e) => pushWith({ shipConf: e.target.value as PoListState["shipConf"] })}
            >
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </label>
        </div>
      )}
    </div>
  );
}
