"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  TriangleAlert,
  CheckCheck,
  Database,
  Search,
  X,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Select, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/app/Pagination";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";
import { REVIEW_SORTS, reviewSearch, type ReviewParams, type ReviewSort, type ReviewStatusFilter } from "@/lib/import/reviewQuery";

type FieldFlag = {
  field: string;
  message: string;
  rawValue: unknown;
};

type StagedRow = {
  _id: string;
  rowNumber: number;
  coerced: Record<string, unknown>;
  flags: FieldFlag[];
  reviewStatus: "needs_review" | "approved" | "rejected";
  committedItemId?: string | null;
};

type BulkAction = "approve" | "reject" | "reset";

const STATUS_LABEL: Record<StagedRow["reviewStatus"], string> = {
  needs_review: "needs review",
  approved: "approved",
  rejected: "excluded",
};

function text(v: unknown): string {
  return v === undefined || v === null || v === "" ? "—" : String(v);
}

function money(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`;
}

export function ReviewTable({
  batchId,
  rows,
  params,
  page,
  filteredTotal,
  approvedPendingCount,
  unflaggedPendingCount,
  categories,
  brands,
}: {
  batchId: string;
  rows: StagedRow[];
  params: ReviewParams;
  page: number;
  filteredTotal: number;
  approvedPendingCount: number;
  unflaggedPendingCount: number;
  categories: string[];
  brands: string[];
}) {
  const router = useRouter();
  const { refresh, refreshing } = useRefreshAfterSave();
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Which action is in flight (kept until the refreshed rows are shown).
  const [pending, setPending] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const busy = pending ?? (refreshing ? lastAction : null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A different page/filter is a different set of rows: start a fresh selection.
  const rowKey = rows.map((r) => r._id).join(",");
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [rowKey]);

  function navigate(next: Partial<ReviewParams>) {
    router.push(`/catalog/import/${batchId}${reviewSearch({ ...params, ...next })}`);
  }

  async function run(key: string, task: () => Promise<boolean>) {
    setActionError(null);
    setPending(key);
    setLastAction(key);
    try {
      if (await task()) refresh();
    } catch {
      setActionError("Couldn't reach the server. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function failed(res: Response, fallback: string): Promise<boolean> {
    if (res.ok) return false;
    const data = await res.json().catch(() => ({}));
    setActionError(data.error ?? fallback);
    return true;
  }

  function decide(rowId: string, reviewStatus: "approved" | "rejected") {
    return run(`row:${rowId}:${reviewStatus}`, async () => {
      const res = await fetch(`/api/admin/import-review/${batchId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus }),
      });
      return !(await failed(res, "Could not save that decision."));
    });
  }

  function saveEdit(rowId: string, field: string, value: string) {
    return run(`edit:${rowId}`, async () => {
      const res = await fetch(`/api/admin/import-review/${batchId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coercedOverrides: { [field]: value } }),
      });
      return !(await failed(res, "Could not save that edit."));
    });
  }

  function bulk(action: BulkAction) {
    const count = allMatching ? filteredTotal : selected.size;
    if (action === "reject" && !window.confirm(`Exclude ${count} row(s)? They won't be written to the catalog.`)) return;
    return run(`bulk:${action}`, async () => {
      const res = await fetch(`/api/admin/import-review/${batchId}/rows/bulk-decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          allMatching
            ? {
                action,
                matching: {
                  filter: params.filter,
                  q: params.q,
                  category: params.category,
                  brand: params.brand,
                },
              }
            : { action, rowIds: [...selected] }
        ),
      });
      if (await failed(res, "Couldn't update those rows.")) return false;
      setSelected(new Set());
      setAllMatching(false);
      return true;
    });
  }

  function bulkApproveUnflagged() {
    return run("unflagged", async () => {
      const res = await fetch(`/api/admin/import-review/${batchId}/rows/bulk-approve`, { method: "POST" });
      return !(await failed(res, "Bulk approve failed."));
    });
  }

  async function commitApproved() {
    setCommitting(true);
    setLastAction("commit");
    setCommitResult(null);
    try {
      const res = await fetch(`/api/admin/import-review/${batchId}/commit`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCommitResult(`Error: ${data.error ?? "commit failed"}`);
        return;
      }
      const errorTail =
        data.errors.length > 0
          ? ` ${data.errors.length} failed: ${data.errors
              .slice(0, 3)
              .map((e: { message: string }) => e.message)
              .join("; ")}${data.errors.length > 3 ? "…" : ""}`
          : "";
      setCommitResult(
        `Committed ${data.committed} rows (${data.created} new, ${data.merged} merged into existing items).` + errorTail
      );
      refresh();
    } catch {
      setCommitResult("Error: couldn't reach the server.");
    } finally {
      setCommitting(false);
    }
  }

  const selectable = rows.filter((r) => !r.committedItemId);
  const allOnPage = selectable.length > 0 && selectable.every((r) => selected.has(r._id));
  const selectionCount = allMatching ? filteredTotal : selected.size;
  const commitBusy = committing || busy === "commit";
  const hasFilters = params.q || params.category || params.brand || params.filter !== "all" || params.sort !== "row";

  function togglePage(on: boolean) {
    setAllMatching(false);
    setSelected(on ? new Set(selectable.map((r) => r._id)) : new Set());
  }

  function toggleRow(id: string) {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <Card className="mb-4">
        <div className="flex gap-3 items-center flex-wrap">
          <Button disabled={unflaggedPendingCount === 0} loading={busy === "unflagged"} onClick={bulkApproveUnflagged}>
            <span className="flex items-center gap-1.5">
              {busy !== "unflagged" && <CheckCheck size={14} />}
              {busy === "unflagged" ? "Approving…" : `Approve all ${unflaggedPendingCount} unflagged`}
            </span>
          </Button>
          <Button variant="primary" disabled={approvedPendingCount === 0} loading={commitBusy} onClick={commitApproved}>
            <span className="flex items-center gap-1.5">
              {!commitBusy && <Database size={14} />}
              {commitBusy ? "Committing…" : `Commit ${approvedPendingCount} approved row(s) to the catalog`}
            </span>
          </Button>
          {busy?.startsWith("edit:") && (
            <span className="inline-flex items-center gap-1.5 text-[0.82rem] text-ink-soft">
              <Loader2 size={13} className="animate-spin" /> Saving change…
            </span>
          )}
          {commitResult && <span className="text-[0.83rem] text-ink-soft">{commitResult}</span>}
          {actionError && <span className="text-[0.83rem] text-critical">{actionError}</span>}
        </div>
      </Card>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Search</span>
            <span className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                type="search"
                defaultValue={params.q}
                onChange={(e) => {
                  const v = e.target.value;
                  if (searchTimer.current) clearTimeout(searchTimer.current);
                  searchTimer.current = setTimeout(() => navigate({ q: v.trim() }), 350);
                }}
                placeholder="SKU or title…"
                className="font-body text-[0.88rem] pl-8 pr-3 py-2.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none w-full focus:border-brass"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 w-[160px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Show</span>
            <Select value={params.filter} onChange={(e) => navigate({ filter: e.target.value as ReviewStatusFilter })}>
              <option value="all">All rows</option>
              <option value="flagged">Flagged rows</option>
              <option value="needs_review">Needs review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Excluded</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 w-[160px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Category</span>
            <Select value={params.category} onChange={(e) => navigate({ category: e.target.value })}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 w-[160px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Brand</span>
            <Select value={params.brand} onChange={(e) => navigate({ brand: e.target.value })}>
              <option value="">All</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 w-[160px]">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Sort by</span>
            <Select value={params.sort} onChange={(e) => navigate({ sort: e.target.value as ReviewSort })}>
              {(Object.keys(REVIEW_SORTS) as ReviewSort[]).map((k) => (
                <option key={k} value={k}>
                  {REVIEW_SORTS[k].label}
                </option>
              ))}
            </Select>
          </label>
          {hasFilters && (
            <button
              type="button"
              onClick={() => router.push(`/catalog/import/${batchId}`)}
              className="flex items-center gap-1 text-[0.8rem] text-ink-soft hover:text-critical px-2 py-2.5 bg-transparent border-0 cursor-pointer"
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </Card>

      {selectionCount > 0 && (
        <Card className="mb-4 !border-brass flex items-center gap-2.5 flex-wrap">
          <span className="text-[0.86rem] font-semibold mr-1">
            {selectionCount} row{selectionCount === 1 ? "" : "s"} selected
            {allMatching ? " (every row matching these filters)" : ""}
          </span>
          {!allMatching && allOnPage && filteredTotal > selected.size && (
            <button
              type="button"
              onClick={() => setAllMatching(true)}
              className="text-[0.82rem] text-brass font-semibold bg-transparent border-0 cursor-pointer p-0 mr-1"
            >
              Select all {filteredTotal} matching rows
            </button>
          )}
          <Button size="sm" loading={busy === "bulk:approve"} disabled={!!busy} onClick={() => bulk("approve")}>
            <span className="flex items-center gap-1">
              <CheckCircle2 size={13} /> Approve
            </span>
          </Button>
          <Button size="sm" variant="danger" loading={busy === "bulk:reject"} disabled={!!busy} onClick={() => bulk("reject")}>
            <span className="flex items-center gap-1">
              <XCircle size={13} /> Exclude from import
            </span>
          </Button>
          <Button size="sm" variant="ghost" loading={busy === "bulk:reset"} disabled={!!busy} onClick={() => bulk("reset")}>
            <span className="flex items-center gap-1">
              <RotateCcw size={13} /> Back to review
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected(new Set());
              setAllMatching(false);
            }}
          >
            Clear selection
          </Button>
        </Card>
      )}

      {filteredTotal === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No rows match these filters.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1100px]">
              <thead>
                <tr>
                  <th className="bg-surface-sunken px-4 py-2.5 border-b border-border-strong w-[40px]">
                    <input
                      type="checkbox"
                      aria-label="Select every row on this page"
                      checked={allOnPage}
                      disabled={selectable.length === 0}
                      onChange={(e) => togglePage(e.target.checked)}
                      className="w-4 h-4 accent-[var(--brass)]"
                    />
                  </th>
                  {["Row", "SKU", "Title", "Category", "Brand", "MSRP", "Flags", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSel = allMatching || selected.has(row._id);
                  const rowBusy = busy?.startsWith(`row:${row._id}:`) ? busy.split(":")[2] : null;
                  return (
                    <tr
                      key={row._id}
                      className={`border-b border-border align-top ${row.reviewStatus === "rejected" ? "opacity-60" : ""} ${
                        isSel ? "bg-brass-bg" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        {!row.committedItemId && (
                          <input
                            type="checkbox"
                            aria-label={`Select row ${row.rowNumber}`}
                            checked={isSel}
                            onChange={() => toggleRow(row._id)}
                            className="w-4 h-4 accent-[var(--brass)]"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[0.82rem] text-ink-faint">{row.rowNumber}</td>
                      <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold whitespace-nowrap">
                        {text(row.coerced.itemNumber)}
                      </td>
                      <td className="px-4 py-3 text-[0.83rem] max-w-[260px] truncate" title={text(row.coerced.title)}>
                        {text(row.coerced.title)}
                      </td>
                      <td className="px-4 py-3 text-[0.83rem] text-ink-soft">{text(row.coerced.category)}</td>
                      <td className="px-4 py-3 text-[0.83rem] text-ink-soft">{text(row.coerced.brand)}</td>
                      <td className="px-4 py-3 font-mono text-[0.82rem]">
                        {money(row.coerced["pricing.newMsrp"] ?? row.coerced["pricing.msrp"])}
                      </td>
                      <td className="px-4 py-3 max-w-[320px]">
                        {row.flags.length === 0 ? (
                          <span className="flex items-center gap-1.5 text-good text-[0.82rem]">
                            <CheckCircle2 size={13} /> none
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {row.flags.map((f, i) => (
                              <div key={i} className="text-[0.8rem] text-warn flex items-start gap-1.5">
                                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                                <span>
                                  {f.field === "itemNumber" ? (
                                    f.message
                                  ) : (
                                    <>
                                      <strong>{f.field}</strong>: {f.message}
                                      <br />
                                      <Input
                                        defaultValue={String(row.coerced[f.field] ?? "")}
                                        onBlur={(e) => {
                                          if (e.target.value !== String(row.coerced[f.field] ?? "")) {
                                            void saveEdit(row._id, f.field, e.target.value);
                                          }
                                        }}
                                        className="!w-[150px] mt-1"
                                      />
                                    </>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.committedItemId ? (
                          <Pill tone="good">in catalog</Pill>
                        ) : (
                          <Pill
                            tone={
                              row.reviewStatus === "approved" ? "good" : row.reviewStatus === "rejected" ? "critical" : "neutral"
                            }
                          >
                            {STATUS_LABEL[row.reviewStatus]}
                          </Pill>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {!row.committedItemId && (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              disabled={row.reviewStatus === "approved" || !!rowBusy}
                              loading={rowBusy === "approved"}
                              onClick={() => decide(row._id, "approved")}
                            >
                              <span className="flex items-center gap-1">
                                <CheckCircle2 size={13} /> Approve
                              </span>
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={row.reviewStatus === "rejected" || !!rowBusy}
                              loading={rowBusy === "rejected"}
                              onClick={() => decide(row._id, "rejected")}
                            >
                              <span className="flex items-center gap-1">
                                <XCircle size={13} /> Exclude
                              </span>
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination
              page={page}
              total={filteredTotal}
              basePath={`/catalog/import/${batchId}`}
              query={{
                filter: params.filter === "all" ? undefined : params.filter,
                q: params.q || undefined,
                category: params.category || undefined,
                brand: params.brand || undefined,
                sort: params.sort === "row" ? undefined : params.sort,
              }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
