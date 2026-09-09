"use client";

import { useState } from "react";
import { RefreshCw, FileSpreadsheet, TriangleAlert, CheckCircle2, ArrowRight, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";

interface PullPlanRow {
  mondayItemId: string;
  mondayItemName: string;
  action: "update" | "create" | "skip_no_status";
  poId?: string;
  poNumber?: string;
  vendorName: string | null;
  vendorMatched: boolean;
  statusText: string | null;
  mappedStatus: string | null;
  statusChanged: boolean;
  poTotal: number | null;
  fileCount: number;
  reason?: string;
}

interface PullPlan {
  rows: PullPlanRow[];
  toUpdate: number;
  toCreate: number;
  skipped: number;
}

interface PullCommitResult {
  processed: number;
  updated: number;
  created: number;
  skipped: number;
  errored: number;
  errors: { mondayItemId: string; message: string }[];
}

function actionTone(action: PullPlanRow["action"]) {
  if (action === "update") return "brass" as const;
  if (action === "create") return "good" as const;
  return "neutral" as const;
}

export function MondayPullPanel() {
  const [plan, setPlan] = useState<PullPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<PullCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/monday/pull");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Preview failed (${res.status})`);
      }
      setPlan(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!plan) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/monday/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: plan.rows }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Import failed (${res.status})`);
      }
      setResult(await res.json());
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base mb-1">Pull updates from Monday.com</h2>
            <p className="text-[0.85rem] text-ink-soft m-0 max-w-[560px]">
              Reads every item on the live Purchase Orders board — status, checklist progress, PO totals, and
              vendor-uploaded PI files — and shows what would change before anything is written. Never modifies
              the Monday board.
            </p>
          </div>
          <Button variant="primary" disabled={loading} onClick={runPreview}>
            <span className="flex items-center gap-1.5">
              <RefreshCw size={15} className={loading ? "spin" : undefined} />
              {loading ? "Reading board…" : "Preview import"}
            </span>
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="!border-critical-bg">
          <div className="flex gap-2 items-start text-critical text-[0.85rem]">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        </Card>
      )}

      {result && (
        <Card className="!border-good-bg">
          <div className={`flex gap-2 items-start text-good text-[0.88rem] ${result.errors.length ? "mb-2.5" : ""}`}>
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              Import complete — {result.updated} PO(s) updated, {result.created} created, {result.skipped} skipped.
            </span>
          </div>
          {result.errors.length > 0 && (
            <div className="flex flex-col gap-1 ml-6">
              {result.errors.map((e, i) => (
                <div key={i} className="text-[0.8rem] text-warn">
                  {e.mondayItemId}: {e.message}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {plan && (
        <>
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-3.5">
              <div className="flex gap-5 text-[0.85rem]">
                <span><strong>{plan.toUpdate}</strong> to update</span>
                <span><strong>{plan.toCreate}</strong> to create</span>
                <span className="text-ink-faint"><strong>{plan.skipped}</strong> skipped (no confident status match)</span>
              </div>
              <Button variant="primary" disabled={committing || (plan.toUpdate === 0 && plan.toCreate === 0)} onClick={commit}>
                <span className="flex items-center gap-1.5">
                  <ArrowRight size={15} />
                  {committing ? "Importing…" : `Apply ${plan.toUpdate + plan.toCreate} change(s)`}
                </span>
              </Button>
            </div>
          </Card>

          <Card padding={0}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[900px]">
                <thead>
                  <tr>
                    {["PO #", "Action", "Vendor", "Board status", "Mapped status", "Total", "Files", "Note"].map((h) => (
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
                  {plan.rows.map((row) => (
                    <tr key={row.mondayItemId} className="border-b border-border">
                      <td className="px-3.5 py-2.5 font-mono text-[0.82rem] font-semibold">{row.mondayItemName}</td>
                      <td className="px-3.5 py-2.5">
                        <Pill tone={actionTone(row.action)}>{row.action.replace(/_/g, " ")}</Pill>
                      </td>
                      <td className="px-3.5 py-2.5 text-[0.83rem]">
                        {row.vendorName ?? "—"}
                        {!row.vendorMatched && row.vendorName && (
                          <TriangleAlert size={12} color="var(--warn)" className="ml-1.5 inline align-[-1px]" />
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-[0.83rem] text-ink-soft">{row.statusText ?? "—"}</td>
                      <td className="px-3.5 py-2.5 text-[0.83rem]">
                        {row.mappedStatus ? (
                          <span className={row.statusChanged ? "text-brass font-semibold" : "text-ink-soft font-normal"}>
                            {row.mappedStatus.replace(/_/g, " ")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-[0.82rem]">
                        {row.poTotal != null ? row.poTotal.toFixed(2) : "—"}
                      </td>
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
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <p className="text-[0.78rem] text-ink-faint flex items-center gap-1.5">
        <ExternalLink size={12} /> Vendor PI files stay on Monday — imported POs link to them and fetch a fresh
        download link on click rather than copying the file into PIM.
      </p>
    </div>
  );
}
