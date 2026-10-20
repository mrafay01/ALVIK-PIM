"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  TriangleAlert,
  CheckCheck,
  Database,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Select, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/app/Pagination";
import { QUOTE_FIELD_BY_KEY, QUOTE_FIELDS } from "@/lib/quote-import/fields";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

// Ordered standard-field keys — used to display the row's actual fields
// in the same left-to-right order they appear on the vendor's quote
// sheet, rather than object-insertion order (which varies).
const STANDARD_FIELD_ORDER = QUOTE_FIELDS.map((f) => f.key);

type FieldFlag = { field: string; message: string; rawValue: unknown };

type StagedRow = {
  _id: string;
  rowNumber: number;
  raw: Record<string, unknown>;
  coerced: Record<string, unknown>;
  flags: FieldFlag[];
  reviewStatus: "needs_review" | "approved" | "rejected";
  reviewNote?: string;
  committedItemId?: string | null;
};

type Filter = "all" | "flagged" | "needs_review";

export function QuoteReviewTable({
  quotationId,
  rows,
  customColumns: initialCustomColumns,
  filter,
  page,
  filteredTotal,
  approvedPendingCount,
  unflaggedPendingCount,
}: {
  quotationId: string;
  rows: StagedRow[];
  customColumns: string[];
  filter: Filter;
  page: number;
  filteredTotal: number;
  approvedPendingCount: number;
  unflaggedPendingCount: number;
}) {
  const router = useRouter();
  const { refresh, refreshing } = useRefreshAfterSave();
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  // Row-level save in flight (approve / reject / an inline edit). Kept
  // until the refreshed rows are on screen so the row never looks idle
  // while its new state is still loading.
  const [rowPending, setRowPending] = useState<{ id: string; kind: string } | null>(null);
  const [lastAction, setLastAction] = useState<{ id: string; kind: string } | null>(null);
  const startAction = (id: string, kind: string) => {
    setRowPending({ id, kind });
    setLastAction({ id, kind });
  };
  const rowBusy = rowPending ?? (refreshing ? lastAction : null);
  const bulkBusy = bulkApproving || (refreshing && lastAction?.kind === "bulk");
  const commitBusy = committing || (refreshing && lastAction?.kind === "commit");
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Quote-level custom columns — managed client-side so an add/remove
  // doesn't need a full page refresh. The server is still the source of
  // truth (every mutation PATCHes and the response's customColumns is
  // what we store), but we don't wait for an SSR reload to see the add.
  const [customColumns, setCustomColumns] = useState<string[]>(initialCustomColumns);
  // The row id currently showing its per-row "add column" input, if any.
  // null = no row is adding; "quote" = the quote-level add box is open.
  const [adding, setAdding] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setFilterValue(next: Filter) {
    router.push(`/purchase-orders/quotes/${quotationId}?filter=${next}`);
  }

  async function decide(rowId: string, reviewStatus: "approved" | "rejected") {
    setActionError(null);
    startAction(rowId, reviewStatus);
    try {
      const res = await fetch(`/api/quotations/${quotationId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Could not save that decision.");
        return;
      }
      refresh();
    } catch {
      setActionError("Couldn't reach the server. Try again.");
    } finally {
      setRowPending(null);
    }
  }

  async function saveEdit(rowId: string, field: string, value: string) {
    setActionError(null);
    startAction(rowId, "edit");
    try {
      const res = await fetch(`/api/quotations/${quotationId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coercedOverrides: { [field]: value } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Could not save that edit.");
      } else {
        refresh();
      }
    } catch {
      setActionError("Couldn't reach the server. Try again.");
    } finally {
      setRowPending(null);
    }
  }

  async function commitApproved() {
    setCommitting(true);
    setLastAction({ id: "", kind: "commit" });
    setCommitResult(null);
    try {
      const res = await fetch(`/api/quotations/${quotationId}/commit`, { method: "POST" });
      const data = await res.json();
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
      const poTail = data.purchaseOrder
        ? data.purchaseOrder.created
          ? " Purchase order created."
          : ` Added ${data.purchaseOrder.linesAdded} line(s) to the existing purchase order.`
        : "";
      setCommitResult(
        `Committed ${data.committed} row(s): ${data.created} new item(s), ${data.merged} merged into existing.` +
          poTail +
          errorTail
      );
      refresh();
    } finally {
      setCommitting(false);
    }
  }

  // Add a quote-level column — appears on every row of this quote with
  // an empty editable input. Server validates for duplicates and for
  // collisions with standard field labels.
  async function addQuoteColumn(label: string) {
    setActionError(null);
    const trimmed = label.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/quotations/${quotationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "add_custom_column", label: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(data.error ?? "Could not add that column.");
      return;
    }
    setCustomColumns(data.customColumns as string[]);
    setAdding(null);
  }

  async function removeQuoteColumn(label: string) {
    setActionError(null);
    const res = await fetch(`/api/quotations/${quotationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "remove_custom_column", label }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(data.error ?? "Could not remove that column.");
      return;
    }
    setCustomColumns(data.customColumns as string[]);
  }

  // Add a one-off custom field to a single row (not the whole quote).
  // The field becomes part of that row's __custom map immediately; it
  // does NOT propagate to sibling rows. Collisions with existing per-row
  // custom labels fall through to overwrite — same as editing any other
  // custom entry.
  async function addRowColumn(rowId: string, label: string, value: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    // Guard against a reviewer typing a standard field's label into the
    // per-row add box; let them edit the real column instead.
    if (QUOTE_FIELD_BY_KEY[trimmed] || QUOTE_FIELDS.some((f) => f.label.toLowerCase() === trimmed.toLowerCase())) {
      setActionError(`"${trimmed}" is a standard column — look for it below instead of adding it.`);
      return;
    }
    await saveEdit(rowId, `custom.${trimmed}`, value);
    setAdding(null);
  }

  async function bulkApproveUnflagged() {
    setBulkApproving(true);
    setLastAction({ id: "", kind: "bulk" });
    setActionError(null);
    try {
      const res = await fetch(`/api/quotations/${quotationId}/rows/bulk-approve`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Bulk approve failed.");
        return;
      }
      refresh();
    } finally {
      setBulkApproving(false);
    }
  }

  return (
    <div>
      <Card className="mb-5">
        <div className="flex gap-3.5 items-end flex-wrap">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Show</span>
            <Select
              value={filter}
              onChange={(e) => setFilterValue(e.target.value as Filter)}
              className="!w-[160px]"
            >
              <option value="all">All rows</option>
              <option value="flagged">Flagged rows</option>
              <option value="needs_review">Needs review</option>
            </Select>
          </label>
          <Button disabled={unflaggedPendingCount === 0} loading={bulkBusy} onClick={bulkApproveUnflagged}>
            <span className="flex items-center gap-1.5">
              {!bulkBusy && <CheckCheck size={14} />}
              {bulkBusy ? "Approving…" : `Approve all ${unflaggedPendingCount} unflagged`}
            </span>
          </Button>
          <Button variant="primary" disabled={approvedPendingCount === 0} loading={commitBusy} onClick={commitApproved}>
            <span className="flex items-center gap-1.5">
              {!commitBusy && <Database size={14} />}
              {commitBusy ? "Committing…" : `Commit ${approvedPendingCount} approved row(s)`}
            </span>
          </Button>
          {adding === "quote" ? (
            <QuoteColumnAdder
              existing={customColumns}
              onCommit={addQuoteColumn}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <Button onClick={() => setAdding("quote")}>
              <span className="flex items-center gap-1.5">
                <Plus size={14} /> Add column to every row
              </span>
            </Button>
          )}
          {rowBusy?.kind === "edit" && (
            <span className="inline-flex items-center gap-1.5 text-[0.82rem] text-ink-soft">
              <Loader2 size={13} className="animate-spin" /> Saving change…
            </span>
          )}
          {commitResult && <span className="text-[0.83rem] text-ink-soft">{commitResult}</span>}
          {actionError && <span className="text-[0.83rem] text-critical">{actionError}</span>}
        </div>
        {customColumns.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide self-center mr-1">
              Added columns:
            </span>
            {customColumns.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 bg-brass-bg text-brass text-[0.78rem] px-2 py-1 rounded-full"
              >
                {label}
                <button
                  type="button"
                  onClick={() => removeQuoteColumn(label)}
                  className="hover:text-critical"
                  aria-label={`Remove column ${label}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {filteredTotal === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No rows match this filter.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[820px]">
              <thead>
                <tr>
                  {["", "Row", "CZ item#", "Vendor item#", "Flags", "Status", "Actions"].map((h, i) => (
                    <th
                      key={i}
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
                  const isOpen = expanded.has(row._id);
                  const flaggedFields = new Set(row.flags.map((f) => f.field));
                  return (
                    <Fragment key={row._id}>
                      <tr className="border-b border-border align-top">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpand(row._id)}
                            className="text-ink-faint hover:text-ink"
                            aria-label={isOpen ? "Collapse" : "Expand"}
                          >
                            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-[0.82rem]">{row.rowNumber}</td>
                        <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold">
                          {String(row.coerced.itemNumber ?? "—")}
                        </td>
                        <td className="px-4 py-3 text-[0.82rem]">{String(row.coerced.vendorSku ?? "—")}</td>
                        <td className="px-4 py-3 max-w-[360px]">
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
                                        <strong>{QUOTE_FIELD_BY_KEY[f.field]?.label ?? f.field}</strong>: {f.message}
                                        <br />
                                        <Input
                                          defaultValue={String(row.coerced[f.field] ?? "")}
                                          onBlur={(e) => saveEdit(row._id, f.field, e.target.value)}
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
                            <Pill tone="good">committed</Pill>
                          ) : (
                            <Pill
                              tone={
                                row.reviewStatus === "approved"
                                  ? "good"
                                  : row.reviewStatus === "rejected"
                                    ? "critical"
                                    : "neutral"
                              }
                            >
                              {row.reviewStatus.replace(/_/g, " ")}
                            </Pill>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {!row.committedItemId && (
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                disabled={row.reviewStatus === "approved" || rowBusy?.id === row._id}
                                loading={rowBusy?.id === row._id && rowBusy.kind === "approved"}
                                onClick={() => decide(row._id, "approved")}
                              >
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 size={13} /> Approve
                                </span>
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={row.reviewStatus === "rejected" || rowBusy?.id === row._id}
                                loading={rowBusy?.id === row._id && rowBusy.kind === "rejected"}
                                onClick={() => decide(row._id, "rejected")}
                              >
                                <span className="flex items-center gap-1">
                                  <XCircle size={13} /> Reject
                                </span>
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border bg-surface-sunken/40">
                          <td />
                          <td colSpan={6} className="px-4 py-3">
                            <RowDetail
                              row={row}
                              customColumns={customColumns}
                              flaggedFields={flaggedFields}
                              onSave={(field, value) => saveEdit(row._id, field, value)}
                              adding={adding === row._id}
                              onStartAdd={() => setAdding(row._id)}
                              onCancelAdd={() => setAdding(null)}
                              onAddRowColumn={(label, value) => addRowColumn(row._id, label, value)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination
              page={page}
              total={filteredTotal}
              basePath={`/purchase-orders/quotes/${quotationId}`}
              query={{ filter }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

// One row's expanded detail block.
//
// Only fields that are either:
//   - present on this row's `coerced` (a value the file carried OR a
//     value a reviewer previously typed), OR
//   - a quote-level custom column added by the reviewer
// get rendered. Columns the vendor left blank for this specific PO are
// hidden — matching the "only show columns the PO had" requirement.
// The reviewer can still add more via "+ Add column", below.
function RowDetail({
  row,
  customColumns,
  flaggedFields,
  onSave,
  adding,
  onStartAdd,
  onCancelAdd,
  onAddRowColumn,
}: {
  row: StagedRow;
  customColumns: string[];
  flaggedFields: Set<string>;
  onSave: (field: string, value: string) => void | Promise<void>;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onAddRowColumn: (label: string, value: string) => void | Promise<void>;
}) {
  // Standard fields the row actually has a value for, in the fixed
  // left-to-right order of QUOTE_FIELDS. A flagged field with no
  // coerced value still shows (its flag is already surfaced on the row
  // summary; this is the editor to fix it).
  const presentStandardKeys = useMemo(() => {
    const present: string[] = [];
    for (const key of STANDARD_FIELD_ORDER) {
      const v = row.coerced[key];
      const hasValue = v !== undefined && v !== null && v !== "";
      if (hasValue || flaggedFields.has(key)) present.push(key);
    }
    return present;
  }, [row.coerced, flaggedFields]);

  const rowCustom = useMemo(
    () => (row.coerced.__custom ?? {}) as Record<string, string>,
    [row.coerced]
  );
  // Union of labels on the row's own __custom map AND the quote-level
  // customColumns list — rendered as one block so a reviewer sees one
  // place for every custom field. Dedup is case-insensitive, with the
  // quote-level casing preferred for a consistent header.
  const customLabels = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of Object.keys(rowCustom)) seen.set(l.toLowerCase(), l);
    for (const l of customColumns) seen.set(l.toLowerCase(), l);
    return [...seen.values()];
  }, [rowCustom, customColumns]);

  const canEdit = !row.committedItemId;

  return (
    <div>
      {/* Standard fields the row actually carries */}
      {presentStandardKeys.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-2.5">
          {presentStandardKeys.map((key) => {
            const field = QUOTE_FIELD_BY_KEY[key];
            if (!field) return null;
            const val = row.coerced[key];
            const isFlagged = flaggedFields.has(key);
            return (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
                  {field.label}
                </span>
                {!canEdit ? (
                  <span className="text-[0.84rem] text-ink">
                    {val === undefined || val === null || val === "" ? "—" : String(val)}
                  </span>
                ) : (
                  <Input
                    defaultValue={val === undefined || val === null ? "" : String(val)}
                    disabled={field.kind === "image"}
                    onBlur={(e) => {
                      const next = e.target.value;
                      if (next !== (val === undefined || val === null ? "" : String(val))) {
                        onSave(key, next);
                      }
                    }}
                    className={`!py-1.5 ${isFlagged ? "!border-warn" : ""}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[0.82rem] text-ink-faint italic">
          This row didn&apos;t carry any of the standard columns. Add one below if the vendor missed it.
        </p>
      )}

      {/* Custom fields: per-row __custom entries + quote-level customColumns */}
      {(customLabels.length > 0 || canEdit) && (
        <div className="mt-4 pt-3.5 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[0.66rem] font-semibold text-brass uppercase tracking-wide">
              Custom fields
            </span>
            {canEdit && !adding && (
              <button
                type="button"
                onClick={onStartAdd}
                className="text-[0.76rem] text-brass hover:text-brass-hover flex items-center gap-1"
              >
                <Plus size={12} /> Add column to this row
              </button>
            )}
          </div>
          {customLabels.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-2.5">
              {customLabels.map((label) => {
                const val = rowCustom[label] ?? rowCustom[Object.keys(rowCustom).find((k) => k.toLowerCase() === label.toLowerCase()) ?? ""] ?? "";
                return (
                  <div key={label} className="flex flex-col gap-1">
                    <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
                      {label}
                    </span>
                    {!canEdit ? (
                      <span className="text-[0.84rem] text-ink">{val || "—"}</span>
                    ) : (
                      <Input
                        defaultValue={val}
                        onBlur={(e) => {
                          if (e.target.value !== val) onSave(`custom.${label}`, e.target.value);
                        }}
                        className="!py-1.5"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {canEdit && adding && (
            <RowColumnAdder onCommit={onAddRowColumn} onCancel={onCancelAdd} />
          )}
        </div>
      )}
    </div>
  );
}

// Inline "+ Add column to this row" input pair. The label + value go in,
// and the parent routes it through the row PATCH that writes a single
// custom.<label> entry — same path used for editing an existing custom
// value, so no new server surface.
function RowColumnAdder({
  onCommit,
  onCancel,
}: {
  onCommit: (label: string, value: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  return (
    <div className="mt-3 flex items-end gap-2 flex-wrap">
      <label className="flex flex-col gap-1 min-w-[160px]">
        <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
          New column name
        </span>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Finish"
          autoFocus
          className="!py-1.5"
        />
      </label>
      <label className="flex flex-col gap-1 min-w-[160px]">
        <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
          Value for this row
        </span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="(optional)"
          className="!py-1.5"
        />
      </label>
      <Button size="sm" variant="primary" disabled={!label.trim()} onClick={() => onCommit(label, value)}>
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

// Inline "+ Add column to every row" input, shown at the top of the
// quote. Blocks duplicates and standard-field collisions client-side;
// the server also validates both (/api/quotations/[id] PATCH).
function QuoteColumnAdder({
  existing,
  onCommit,
  onCancel,
}: {
  existing: string[];
  onCommit: (label: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit() {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (existing.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      setLocalError("Already added");
      return;
    }
    if (
      QUOTE_FIELDS.some(
        (f) =>
          f.label.toLowerCase() === trimmed.toLowerCase() ||
          (f.aliases ?? []).some((a) => a.toLowerCase() === trimmed.toLowerCase())
      )
    ) {
      setLocalError("That's already a standard column");
      return;
    }
    setLocalError(null);
    onCommit(trimmed);
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <label className="flex flex-col gap-1 min-w-[180px]">
        <span className="text-[0.68rem] font-semibold text-ink-faint uppercase tracking-wide">
          Column name
        </span>
        <Input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            if (localError) setLocalError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") onCancel();
          }}
          placeholder="e.g. Finish"
          autoFocus
          className="!py-1.5"
        />
      </label>
      <Button size="sm" variant="primary" disabled={!label.trim()} onClick={submit}>
        Add column
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {localError && <span className="text-[0.78rem] text-warn">{localError}</span>}
    </div>
  );
}
