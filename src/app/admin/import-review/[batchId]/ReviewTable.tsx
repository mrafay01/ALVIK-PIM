"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, TriangleAlert, CheckCheck, Database } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Select, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/app/Pagination";

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

type Filter = "all" | "flagged" | "needs_review";

export function ReviewTable({
  batchId,
  rows,
  filter,
  page,
  filteredTotal,
  approvedPendingCount,
  unflaggedPendingCount,
}: {
  batchId: string;
  rows: StagedRow[];
  filter: Filter;
  page: number;
  filteredTotal: number;
  approvedPendingCount: number;
  unflaggedPendingCount: number;
}) {
  const router = useRouter();
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function setFilter(next: Filter) {
    // Filter and page live in the URL so only the matching page of rows is
    // fetched server-side — going to page 1 whenever the filter changes.
    router.push(`/admin/import-review/${batchId}?filter=${next}`);
  }

  async function decide(
    rowId: string,
    reviewStatus: "approved" | "rejected",
    overrides?: Record<string, unknown>
  ) {
    setActionError(null);
    const res = await fetch(`/api/admin/import-review/${batchId}/rows/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus, coercedOverrides: overrides }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setActionError(data.error ?? "Could not save that decision.");
      return;
    }
    router.refresh();
  }

  async function saveEdit(rowId: string, field: string, value: string) {
    setActionError(null);
    const res = await fetch(`/api/admin/import-review/${batchId}/rows/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coercedOverrides: { [field]: value } }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setActionError(data.error ?? "Could not save that edit.");
    }
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
      const errorTail =
        data.errors.length > 0
          ? ` ${data.errors.length} failed: ${data.errors
              .slice(0, 3)
              .map((e: { message: string }) => e.message)
              .join("; ")}${data.errors.length > 3 ? "…" : ""}`
          : "";
      setCommitResult(
        `Committed ${data.committed} rows (${data.created} new, ${data.merged} merged into existing items).` +
          errorTail
      );
      router.refresh();
    } finally {
      setCommitting(false);
    }
  }

  async function bulkApproveUnflagged() {
    setBulkApproving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/import-review/${batchId}/rows/bulk-approve`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Bulk approve failed.");
        return;
      }
      router.refresh();
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
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="!w-[160px]"
            >
              <option value="flagged">Flagged rows</option>
              <option value="needs_review">Needs review</option>
              <option value="all">All rows</option>
            </Select>
          </label>
          <Button disabled={unflaggedPendingCount === 0 || bulkApproving} onClick={bulkApproveUnflagged}>
            <span className="flex items-center gap-1.5">
              <CheckCheck size={14} /> {bulkApproving ? "Approving…" : `Approve all ${unflaggedPendingCount} unflagged`}
            </span>
          </Button>
          <Button variant="primary" disabled={committing || approvedPendingCount === 0} onClick={commitApproved}>
            <span className="flex items-center gap-1.5">
              <Database size={14} /> {committing ? "Committing…" : `Commit ${approvedPendingCount} approved row(s)`}
            </span>
          </Button>
          {commitResult && <span className="text-[0.83rem] text-ink-soft">{commitResult}</span>}
          {actionError && <span className="text-[0.83rem] text-critical">{actionError}</span>}
        </div>
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
                  {["Row", "SKU", "Flags", "Status", "Actions"].map((h) => (
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
                {rows.map((row) => (
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
          <div className="px-4 pb-3">
            <Pagination
              page={page}
              total={filteredTotal}
              basePath={`/admin/import-review/${batchId}`}
              query={{ filter }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
