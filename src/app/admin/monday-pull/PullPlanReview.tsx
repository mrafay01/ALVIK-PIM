"use client";

import { useMemo, useState } from "react";
import { ArrowRight, FileSpreadsheet, Search, TriangleAlert, UserPlus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { PageJump } from "@/components/app/PageJump";

export interface PullPlanRow {
  mondayItemId: string;
  mondayItemName: string;
  action: "update" | "create" | "skip_no_vendor";
  poId?: string;
  poNumber?: string;
  vendorName: string | null;
  vendorMatched: boolean;
  statusText: string | null;
  mappedStatus: string | null;
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

const PAGE = 100;

const SORTS = {
  po_desc: { label: "PO # (newest first)", fn: (a: PullPlanRow, b: PullPlanRow) => cmpPo(b, a) },
  po_asc: { label: "PO # (oldest first)", fn: (a: PullPlanRow, b: PullPlanRow) => cmpPo(a, b) },
  order_desc: {
    label: "Order date (newest)",
    fn: (a: PullPlanRow, b: PullPlanRow) => (b.orderDate ?? "").localeCompare(a.orderDate ?? ""),
  },
  vendor: { label: "Vendor (A–Z)", fn: (a: PullPlanRow, b: PullPlanRow) => cmpText(a.vendorName, b.vendorName) },
  status: { label: "Board status (A–Z)", fn: (a: PullPlanRow, b: PullPlanRow) => cmpText(a.statusText, b.statusText) },
  total_desc: { label: "Total (high → low)", fn: (a: PullPlanRow, b: PullPlanRow) => (b.poTotal ?? -1) - (a.poTotal ?? -1) },
} as const;
type SortKey = keyof typeof SORTS;

function cmpText(a: string | null, b: string | null) {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return a.localeCompare(b);
}
function cmpPo(a: PullPlanRow, b: PullPlanRow) {
  return a.mondayItemName.localeCompare(b.mondayItemName, undefined, { numeric: true });
}

function actionTone(action: PullPlanRow["action"]) {
  if (action === "update") return "brass" as const;
  if (action === "create") return "good" as const;
  return "neutral" as const;
}

// Review step of the Monday import: search, filter and sort the board's
// rows, untick any that shouldn't be imported, then apply only the ticked
// ones. Skipped rows (no vendor on the board) can't be imported and are
// shown for reference only.
export function PullPlanReview({
  rows,
  committing,
  onApply,
}: {
  rows: PullPlanRow[];
  committing: boolean;
  onApply: (mondayItemIds: string[], saveFiles: boolean) => void;
}) {
  // Copy each imported PO's files from Monday into its SharePoint folder
  // right after the import. On by default; the copy can also be run later.
  const [saveFiles, setSaveFiles] = useState(true);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<"" | PullPlanRow["action"]>("");
  const [status, setStatus] = useState("");
  const [vendor, setVendor] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [sort, setSort] = useState<SortKey>("po_desc");
  const [page, setPage] = useState(1);
  // Everything importable starts ticked; the reviewer unticks what to leave out.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.action !== "skip_no_vendor").map((r) => r.mondayItemId))
  );

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.statusText).filter(Boolean) as string[])].sort(),
    [rows]
  );
  const vendors = useMemo(
    () => [...new Set(rows.map((r) => r.vendorName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (action && r.action !== action) return false;
        if (status && r.statusText !== status) return false;
        if (vendor && r.vendorName !== vendor) return false;
        if (onlyChanges && !(r.action === "create" || r.statusChanged)) return false;
        if (needle) {
          const hay = `${r.mondayItemName} ${r.vendorName ?? ""} ${r.trackingNumber ?? ""} ${r.statusText ?? ""}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort(SORTS[sort].fn);
  }, [rows, q, action, status, vendor, onlyChanges, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE, currentPage * PAGE);

  const selectableShown = filtered.filter((r) => r.action !== "skip_no_vendor");
  const shownSelected = selectableShown.filter((r) => selected.has(r.mondayItemId)).length;
  const allShownSelected = selectableShown.length > 0 && shownSelected === selectableShown.length;

  const selectedRows = rows.filter((r) => selected.has(r.mondayItemId));
  const selUpdate = selectedRows.filter((r) => r.action === "update").length;
  const selCreate = selectedRows.filter((r) => r.action === "create").length;
  const selFiles = selectedRows.reduce((n, r) => n + (r.fileCount ?? 0), 0);

  function resetPageAnd<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  function setShown(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of selectableShown) {
        if (on) next.add(r.mondayItemId);
        else next.delete(r.mondayItemId);
      }
      return next;
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasFilters = q || action || status || vendor || onlyChanges;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3.5">
          <div className="flex gap-5 text-[0.85rem] flex-wrap">
            <span>
              <strong>{selectedRows.length}</strong> selected to import
            </span>
            <span className="text-ink-soft">
              {selUpdate} update · {selCreate} create
            </span>
            <span className="text-ink-faint">
              {rows.length} on the board · {rows.filter((r) => r.action === "skip_no_vendor").length} can&apos;t be
              imported (no vendor set)
            </span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-[0.85rem] cursor-pointer">
              <input
                type="checkbox"
                checked={saveFiles}
                onChange={(e) => setSaveFiles(e.target.checked)}
                disabled={committing}
              />
              <span>
                Also save PO files to SharePoint
                <span className="text-ink-faint"> ({selFiles} file{selFiles === 1 ? "" : "s"})</span>
              </span>
            </label>
            <Button
              variant="primary"
              disabled={selectedRows.length === 0}
              loading={committing}
              onClick={() => onApply(selectedRows.map((r) => r.mondayItemId), saveFiles)}
            >
              <span className="flex items-center gap-1.5">
                {!committing && <ArrowRight size={15} />}
                {committing ? "Importing…" : `Import ${selectedRows.length} selected`}
              </span>
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Search</span>
            <span className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                type="search"
                value={q}
                onChange={(e) => resetPageAnd(setQ)(e.target.value)}
                placeholder="PO #, vendor, tracking, status…"
                className="font-body text-[0.88rem] pl-8 pr-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none w-full focus:border-brass"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 w-[150px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Action</span>
            <Select value={action} onChange={(e) => resetPageAnd(setAction)(e.target.value as typeof action)}>
              <option value="">All</option>
              <option value="update">Update</option>
              <option value="create">Create</option>
              <option value="skip_no_vendor">Can&apos;t import</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 w-[180px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Board status</span>
            <Select value={status} onChange={(e) => resetPageAnd(setStatus)(e.target.value)}>
              <option value="">All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 w-[180px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Vendor</span>
            <Select value={vendor} onChange={(e) => resetPageAnd(setVendor)(e.target.value)}>
              <option value="">All</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 w-[190px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Sort by</span>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORTS[k].label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-[0.84rem] text-ink-soft py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyChanges}
              onChange={(e) => resetPageAnd(setOnlyChanges)(e.target.checked)}
              className="w-4 h-4 accent-[var(--brass)]"
            />
            Only new POs or status changes
          </label>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setAction("");
                setStatus("");
                setVendor("");
                setOnlyChanges(false);
                setPage(1);
              }}
              className="flex items-center gap-1 text-[0.8rem] text-ink-soft hover:text-critical px-2 py-2.5 bg-transparent border-0 cursor-pointer"
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5 flex-wrap mt-3.5 pt-3.5 border-t border-border text-[0.83rem]">
          <span className="text-ink-soft">
            Showing {filtered.length} of {rows.length} · {shownSelected} of {selectableShown.length} shown are selected
          </span>
          <Button size="sm" disabled={allShownSelected || selectableShown.length === 0} onClick={() => setShown(true)}>
            Select all shown
          </Button>
          <Button size="sm" disabled={shownSelected === 0} onClick={() => setShown(false)}>
            Deselect all shown
          </Button>
        </div>
      </Card>

      <Card padding={0}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[1240px]">
            <thead>
              <tr>
                <th className="bg-surface-sunken px-3.5 py-2.5 border-b border-border-strong w-[40px]">
                  <input
                    type="checkbox"
                    aria-label="Select all shown rows"
                    checked={allShownSelected}
                    onChange={(e) => setShown(e.target.checked)}
                    className="w-4 h-4 accent-[var(--brass)]"
                  />
                </th>
                {[
                  "PO #",
                  "Action",
                  "Vendor",
                  "Board status",
                  "Mapped status",
                  "Priority",
                  "Total",
                  "Order date",
                  "Request date",
                  "Vendor conf.",
                  "Tracking #",
                  "Ship conf.",
                  "Files",
                  "Note",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-3.5 py-2.5 border-b border-border-strong whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-4 py-6 text-center text-[0.85rem] text-ink-faint">
                    No rows match these filters.
                  </td>
                </tr>
              )}
              {visible.map((row) => {
                const skip = row.action === "skip_no_vendor";
                const isSel = selected.has(row.mondayItemId);
                return (
                  <tr
                    key={row.mondayItemId}
                    className={`border-b border-border ${!skip && !isSel ? "opacity-55" : ""}`}
                  >
                    <td className="px-3.5 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Import PO ${row.mondayItemName}`}
                        checked={isSel}
                        disabled={skip}
                        onChange={() => toggle(row.mondayItemId)}
                        className="w-4 h-4 accent-[var(--brass)] disabled:opacity-40"
                      />
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[0.82rem] font-semibold">{row.mondayItemName}</td>
                    <td className="px-3.5 py-2.5">
                      <Pill tone={actionTone(row.action)}>{skip ? "can't import" : row.action}</Pill>
                    </td>
                    <td className="px-3.5 py-2.5 text-[0.83rem]">
                      {row.vendorName ?? "—"}
                      {!row.vendorMatched && row.vendorName && (
                        <span
                          title={`"${row.vendorName}" will be created automatically on import`}
                          className="ml-1.5 inline-flex items-center gap-1 align-[-1px] text-[0.72rem] text-brass"
                        >
                          <UserPlus size={12} /> new
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-[0.83rem] text-ink-soft">
                      {row.statusText ?? "—"}
                      {row.statusText && !row.mappedStatus && (
                        <span
                          title="No pipeline-status equivalent; stored as-is, pipeline status left unchanged"
                          className="ml-1.5 inline-flex items-center gap-1 align-[-1px] text-[0.72rem] text-warn"
                        >
                          <TriangleAlert size={12} /> unmapped
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-[0.83rem]">
                      {row.mappedStatus ? (
                        <span className={row.statusChanged ? "text-brass font-semibold" : "text-ink-soft"}>
                          {row.mappedStatus.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-ink-faint">unchanged</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-[0.83rem] text-ink-soft capitalize">{row.priorityText ?? "—"}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[0.82rem]">
                      {row.poTotal != null ? row.poTotal.toFixed(2) : "—"}
                    </td>
                    <td className="px-3.5 py-2.5 text-[0.82rem] text-ink-soft whitespace-nowrap">{row.orderDate ?? "—"}</td>
                    <td className="px-3.5 py-2.5 text-[0.82rem] text-ink-soft whitespace-nowrap">{row.requestDate ?? "—"}</td>
                    <td className="px-3.5 py-2.5 text-[0.82rem] text-ink-soft whitespace-nowrap">{row.vendorConfDate ?? "—"}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[0.8rem] whitespace-nowrap">{row.trackingNumber ?? "—"}</td>
                    <td className="px-3.5 py-2.5 text-[0.83rem]">{row.joelShipConfirmed ? "Yes" : "No"}</td>
                    <td className="px-3.5 py-2.5 text-[0.83rem]">
                      {row.fileCount > 0 ? (
                        <span className="flex items-center gap-1">
                          <FileSpreadsheet size={13} /> {row.fileCount}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-[0.78rem] text-ink-faint max-w-[260px]">{row.reason ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border text-[0.82rem]">
            <span className="text-ink-faint">
              Page {currentPage} of {pageCount}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {pageCount > 2 && <PageJump page={currentPage} pageCount={pageCount} onJump={setPage} />}
            <div className="flex gap-2">
              <Button size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                Previous
              </Button>
              <Button size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
                Next
              </Button>
            </div>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
