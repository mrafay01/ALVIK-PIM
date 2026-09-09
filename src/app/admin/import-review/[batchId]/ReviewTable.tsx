"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, TriangleAlert, CheckCheck, Database } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Select, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type FieldFlag = {
  field: string;
  message: string;
  rawValue: unknown;
};

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

export function ReviewTable({ batchId, rows: initialRows }: { batchId: string; rows: StagedRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<"all" | "flagged" | "needs_review">("flagged");
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);

  const visibleRows = rows.filter((r) => {
    if (filter === "flagged") return r.flags.length > 0;
    if (filter === "needs_review") return r.reviewStatus === "needs_review";
    return true;
  });

  async function decide(
    rowId: string,
    reviewStatus: "approved" | "rejected",
    overrides?: Record<string, unknown>
  ) {
    const res = await fetch(`/api/admin/import-review/${batchId}/rows/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus, coercedOverrides: overrides }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setRows((prev) => prev.map((r) => (r._id === rowId ? { ...r, ...data.row } : r)));
  }

  async function editField(rowId: string, field: string, value: string) {
    setRows((prev) =>
      prev.map((r) => (r._id === rowId ? { ...r, coerced: { ...r.coerced, [field]: value } } : r))
    );
  }

  async function saveEdit(rowId: string, field: string, value: string) {
    await fetch(`/api/admin/import-review/${batchId}/rows/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coercedOverrides: { [field]: value } }),
    });
  }

  async function commitApproved() {
    setCommitting(true);
    setCommitResult(null);
    try {
      const res = await fetch(`/api/admin/import-review/${batchId}/commit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCommitResult(`Error: ${data.error ?? "commit failed"}`);
        return;
      }
      setCommitResult(
        `Committed ${data.committed} rows (${data.created} new, ${data.merged} merged into existing items).` +
          (data.errors.length > 0 ? ` ${data.errors.length} failed — see console.` : "")
      );
      if (data.errors.length > 0) console.error("Commit errors:", data.errors);
    } finally {
      setCommitting(false);
    }
  }

  async function bulkApproveUnflagged() {
    const targets = rows.filter((r) => r.flags.length === 0 && r.reviewStatus === "needs_review");
    for (const row of targets) {
      await decide(row._id, "approved");
    }
  }

  const approvedCount = rows.filter((r) => r.reviewStatus === "approved" && !r.committedItemId).length;
  const unflaggedPendingCount = rows.filter(
    (r) => r.flags.length === 0 && r.reviewStatus === "needs_review"
  ).length;

  return (
    <div>
      <Card className="mb-5">
        <div className="flex gap-3.5 items-end flex-wrap">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.72rem] font-semibold text-ink-faint uppercase tracking-wide">Show</span>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="!w-[160px]">
              <option value="flagged">Flagged rows</option>
              <option value="needs_review">Needs review</option>
              <option value="all">All rows</option>
            </Select>
          </label>
          <Button disabled={unflaggedPendingCount === 0} onClick={bulkApproveUnflagged}>
            <span className="flex items-center gap-1.5">
              <CheckCheck size={14} /> Approve all {unflaggedPendingCount} unflagged
            </span>
          </Button>
          <Button variant="primary" disabled={committing || approvedCount === 0} onClick={commitApproved}>
            <span className="flex items-center gap-1.5">
              <Database size={14} /> {committing ? "Committing…" : `Commit ${approvedCount} approved row(s)`}
            </span>
          </Button>
          {commitResult && <span className="text-[0.83rem] text-ink-soft">{commitResult}</span>}
        </div>
      </Card>

      {visibleRows.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No rows match this filter.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[820px]">
              <thead>
                <tr>
                  {["Row", "SKU", "Flags", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row._id} className="border-b border-border align-top">
                    <td className="px-4 py-3 font-mono text-[0.82rem]">{row.rowNumber}</td>
                    <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold">{String(row.coerced.itemNumber ?? "—")}</td>
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
                                    <strong>{f.field}</strong>: {f.message}
                                    <br />
                                    <Input
                                      defaultValue={String(row.coerced[f.field] ?? "")}
                                      onChange={(e) => editField(row._id, f.field, e.target.value)}
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
                        <Pill tone={row.reviewStatus === "approved" ? "good" : row.reviewStatus === "rejected" ? "critical" : "neutral"}>
                          {row.reviewStatus.replace(/_/g, " ")}
                        </Pill>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {!row.committedItemId && (
                        <div className="flex gap-1.5">
                          <Button size="sm" disabled={row.reviewStatus === "approved"} onClick={() => decide(row._id, "approved")}>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 size={13} /> Approve
                            </span>
                          </Button>
                          <Button size="sm" variant="danger" disabled={row.reviewStatus === "rejected"} onClick={() => decide(row._id, "rejected")}>
                            <span className="flex items-center gap-1">
                              <XCircle size={13} /> Reject
                            </span>
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
